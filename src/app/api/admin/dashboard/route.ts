import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { buildDateRangeItems, countWorkingDays } from "@/lib/date";
import { query } from "@/lib/db";
import { dashboardFilterSchema } from "@/lib/validation";
import { SHIPMENT_STATUS, type ShipmentStatus } from "@/types/shipment";

type AreaRow = {
  area_id: string;
  nama_area: string;
  sla_area: number;
};

type HolidayRow = {
  tanggal_libur: string;
  keterangan_libur: string;
};

type DailyShipmentCountRow = {
  tanggal_shipment: string;
  jumlah_shipment: number;
};

type StatusCountRow = {
  status_shipment: string | null;
  total: number;
};

type StatusMetric = {
  status: Exclude<ShipmentStatus, "Aktif">;
  count: number;
};

type AdminDateCard = {
  date: string;
  is_sunday: boolean;
  is_holiday: boolean;
  holiday_note: string | null;
  jumlah_shipment: number;
};

const NON_ACTIVE_SHIPMENT_STATUSES = SHIPMENT_STATUS.filter(
  (status): status is Exclude<ShipmentStatus, "Aktif"> => status !== "Aktif",
);

function buildShipmentCountMap(
  rows: DailyShipmentCountRow[],
): Map<string, number> {
  const map = new Map<string, number>();

  for (const row of rows) {
    map.set(row.tanggal_shipment.slice(0, 10), row.jumlah_shipment);
  }

  return map;
}

function buildStatusMetrics(rows: StatusCountRow[]): StatusMetric[] {
  const map = new Map<string, number>();

  for (const row of rows) {
    if (!row.status_shipment) {
      continue;
    }

    map.set(row.status_shipment, row.total);
  }

  return NON_ACTIVE_SHIPMENT_STATUSES.map((status) => ({
    status,
    count: map.get(status) ?? 0,
  }));
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

    if (session.user_role !== "admin") {
      return NextResponse.json(
        {
          ok: false,
          message: "Dashboard ini hanya untuk user admin",
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
          message: "Admin tidak memiliki area",
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

    const areaRows = await query<AreaRow>`
      SELECT
        area_id,
        nama_area,
        sla_area
      FROM area
      WHERE area_id = ${session.area_id}
        AND is_active = TRUE
      LIMIT 1
    `;

    const area = areaRows[0];

    if (!area) {
      return NextResponse.json(
        {
          ok: false,
          message: "Area admin tidak ditemukan atau tidak aktif",
        },
        {
          status: 404,
        },
      );
    }

    const holidays = await query<HolidayRow>`
      SELECT
        tanggal_libur::TEXT AS tanggal_libur,
        keterangan_libur
      FROM libur_kalender
      WHERE tanggal_libur BETWEEN ${startDate}::DATE AND ${endDate}::DATE
      ORDER BY tanggal_libur ASC
    `;

    const dailyShipmentCounts = await query<DailyShipmentCountRow>`
      SELECT
        tanggal_shipment::TEXT AS tanggal_shipment,
        COUNT(*)::INT AS jumlah_shipment
      FROM shipments
      WHERE area_id = ${session.area_id}
        AND tanggal_shipment BETWEEN ${startDate}::DATE AND ${endDate}::DATE
      GROUP BY tanggal_shipment
      ORDER BY tanggal_shipment ASC
    `;

    const hkeRows = await query<{ hke: number }>`
      SELECT
        COUNT(DISTINCT tanggal_shipment)::INT AS hke
      FROM shipments
      WHERE area_id = ${session.area_id}
        AND tanggal_shipment BETWEEN ${startDate}::DATE AND ${endDate}::DATE
        AND shipment_code ~ '^[0-9]{10}$'
    `;

    const statusCountRows = await query<StatusCountRow>`
      SELECT
        shipment_code AS status_shipment,
        COUNT(DISTINCT tanggal_shipment)::INT AS total
      FROM shipments
      WHERE area_id = ${session.area_id}
        AND tanggal_shipment BETWEEN ${startDate}::DATE AND ${endDate}::DATE
        AND shipment_code IS NOT NULL
        AND shipment_code !~ '^[0-9]{10}$'
      GROUP BY shipment_code
      ORDER BY shipment_code ASC
    `;

    const dateItems = buildDateRangeItems(startDate, endDate, holidays);
    const shipmentCountMap = buildShipmentCountMap(dailyShipmentCounts);

    const hk = countWorkingDays(dateItems);
    const hke = hkeRows[0]?.hke ?? 0;
    const statusCounts = buildStatusMetrics(statusCountRows);

    const cards: AdminDateCard[] = dateItems.map((item) => ({
      date: item.date,
      is_sunday: item.is_sunday,
      is_holiday: item.is_holiday,
      holiday_note: item.holiday_note,
      jumlah_shipment: shipmentCountMap.get(item.date) ?? 0,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        admin: {
          nik_kerja: session.nik_kerja,
          area_id: session.area_id,
          nama_lengkap: session.nama_lengkap,
          username: session.username,
          user_role: session.user_role,
        },
        area,
        filter: {
          start_date: startDate,
          end_date: endDate,
        },
        metrics: {
          hk,
          hke,
          sla: area.sla_area,
          status_counts: statusCounts,
        },
        cards,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal mengambil dashboard admin";

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