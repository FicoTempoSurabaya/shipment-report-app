import { NextResponse } from "next/server";

import {
  buildDateRangeItems,
  countWorkingDays,
  type DateCardStatus,
} from "@/lib/date";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  buildShipmentLockMap,
  getRegularShipmentLocksInRange,
  getShipmentLockMessage,
  type ShipmentLockInfo,
} from "@/lib/kunci-shipment";
import { dashboardFilterSchema } from "@/lib/validation";
import {
  SHIPMENT_STATUS,
  type ShipmentFailureReason,
  type ShipmentStatus,
} from "@/types/shipment";

type HolidayRow = {
  tanggal_libur: string;
  keterangan_libur: string;
};

type RegularShipmentRow = {
  shipment_id: number;
  tanggal_shipment: string;
  status_shipment: ShipmentStatus;
  shipment_code: string | null;
  jam_berangkat: string | null;
  jam_pulang: string | null;
  jumlah_toko: number;
  terkirim: number;
  gagal: number;
  alasan: ShipmentFailureReason[];
};

type StatusMetric = {
  status: Exclude<ShipmentStatus, "Aktif">;
  count: number;
};

type RegularDateCard = {
  date: string;
  status: DateCardStatus;
  keterangan: string;
  read_only: boolean;
  action: "none" | "input" | "edit";
  shipment: RegularShipmentRow | null;
  lock: ShipmentLockInfo | null;
};

const ACTIVE_SHIPMENT_CODE_PATTERN = /^\d{10}$/;

const NON_ACTIVE_SHIPMENT_STATUSES = SHIPMENT_STATUS.filter(
  (status): status is Exclude<ShipmentStatus, "Aktif"> => status !== "Aktif",
);

function buildShipmentMap(rows: RegularShipmentRow[]): Map<string, RegularShipmentRow> {
  const map = new Map<string, RegularShipmentRow>();

  for (const row of rows) {
    map.set(row.tanggal_shipment.slice(0, 10), row);
  }

  return map;
}

function buildStatusMetrics(rows: RegularShipmentRow[]): StatusMetric[] {
  const map = new Map<string, number>();

  for (const row of rows) {
    const shipmentCode = row.shipment_code?.trim();

    if (!shipmentCode || ACTIVE_SHIPMENT_CODE_PATTERN.test(shipmentCode)) {
      continue;
    }

    map.set(shipmentCode, (map.get(shipmentCode) ?? 0) + 1);
  }

  return NON_ACTIVE_SHIPMENT_STATUSES.map((status) => ({
    status,
    count: map.get(status) ?? 0,
  }));
}

function buildRegularDateCards(params: {
  dateItems: ReturnType<typeof buildDateRangeItems>;
  shipmentMap: Map<string, RegularShipmentRow>;
  lockMap: Map<string, ShipmentLockInfo>;
}): RegularDateCard[] {
  return params.dateItems.map((item) => {
    const shipment = params.shipmentMap.get(item.date) ?? null;
    const lock = params.lockMap.get(item.date) ?? null;

    if (lock) {
      const shipmentText = shipment?.shipment_code ? ` · ${shipment.shipment_code}` : "";

      return {
        date: item.date,
        status: "locked",
        keterangan: `${getShipmentLockMessage(lock)}${shipmentText}`,
        read_only: true,
        action: "none",
        shipment,
        lock,
      };
    }

    if (shipment?.shipment_code) {
      return {
        date: item.date,
        status: "filled",
        keterangan: shipment.shipment_code,
        read_only: false,
        action: "edit",
        shipment,
        lock,
      };
    }

    if (item.is_sunday) {
      return {
        date: item.date,
        status: "sunday",
        keterangan: "Libur Minggu",
        read_only: true,
        action: "none",
        shipment,
        lock,
      };
    }

    if (item.is_holiday) {
      return {
        date: item.date,
        status: "holiday",
        keterangan: item.holiday_note ?? "Libur",
        read_only: true,
        action: "none",
        shipment,
        lock,
      };
    }

    return {
      date: item.date,
      status: "empty",
      keterangan: "Belum Diisi",
      read_only: false,
      action: "input",
      shipment,
      lock,
    };
  });
}

export async function GET(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          message: "Belum login",
        },
        {
          status: 401,
        },
      );
    }

    if (session.user_role !== "regular") {
      return NextResponse.json(
        {
          ok: false,
          message: "Dashboard ini hanya untuk user regular",
        },
        {
          status: 403,
        },
      );
    }

    if (!session.area_id) {
      return NextResponse.json(
        {
          ok: false,
          message: "User regular tidak memiliki area",
        },
        {
          status: 400,
        },
      );
    }

    const { searchParams } = new URL(request.url);

    const parsed = dashboardFilterSchema.safeParse({
      start_date: searchParams.get("start_date"),
      end_date: searchParams.get("end_date"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Filter tanggal tidak valid",
          errors: parsed.error.flatten().fieldErrors,
        },
        {
          status: 400,
        },
      );
    }

    const { start_date: startDate, end_date: endDate } = parsed.data;

    const holidays = await query<HolidayRow>`
      SELECT
        tanggal_libur::TEXT AS tanggal_libur,
        keterangan_libur
      FROM libur_kalender
      WHERE tanggal_libur BETWEEN ${startDate}::DATE AND ${endDate}::DATE
      ORDER BY tanggal_libur ASC
    `;

    const locks = await getRegularShipmentLocksInRange({
      areaId: session.area_id,
      nikKerja: session.nik_kerja,
      startDate,
      endDate,
    });

    const shipments = await query<RegularShipmentRow>`
      SELECT
        shipment_id,
        tanggal_shipment::TEXT AS tanggal_shipment,
        CASE
          WHEN shipment_code ~ '^[0-9]{10}$' THEN 'Aktif'
          ELSE shipment_code
        END AS status_shipment,
        shipment_code,
        jam_berangkat::TEXT AS jam_berangkat,
        jam_pulang::TEXT AS jam_pulang,
        jumlah_toko,
        terkirim,
        gagal,
        COALESCE(alasan, '[]'::JSONB) AS alasan
      FROM shipments
      WHERE nik_kerja = ${session.nik_kerja}
        AND area_id = ${session.area_id}
        AND is_freelance = FALSE
        AND tanggal_shipment BETWEEN ${startDate}::DATE AND ${endDate}::DATE
      ORDER BY tanggal_shipment ASC
    `;

    const dateItems = buildDateRangeItems(startDate, endDate, holidays);
    const shipmentMap = buildShipmentMap(shipments);
    const lockMap = buildShipmentLockMap({
      locks,
      startDate,
      endDate,
    });
    const cards = buildRegularDateCards({
      dateItems,
      shipmentMap,
      lockMap,
    });

    const hk = countWorkingDays(dateItems);
    const hke = shipments.filter((shipment) =>
      ACTIVE_SHIPMENT_CODE_PATTERN.test(shipment.shipment_code ?? ""),
    ).length;
    const statusCounts = buildStatusMetrics(shipments);

    return NextResponse.json({
      ok: true,
      data: {
        user: {
          nik_kerja: session.nik_kerja,
          area_id: session.area_id,
          nama_lengkap: session.nama_lengkap,
          username: session.username,
          user_role: session.user_role,
        },
        filter: {
          start_date: startDate,
          end_date: endDate,
        },
        metrics: {
          hk,
          hke,
          status_counts: statusCounts,
        },
        cards,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal mengambil dashboard regular";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      {
        status: 500,
      },
    );
  }
}
