import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  FAILURE_REASONS,
  type FailureReason,
  type ShipmentFailureReason,
  type ShipmentStatus,
} from "@/types/shipment";

type AreaRow = {
  area_id: string;
  nama_area: string;
  sla_area: number;
};

type RegularDetailRow = {
  nik_kerja: string;
  nama_lengkap: string;
  shipment_id: number | null;
  tanggal_shipment: string | null;
  status_shipment: ShipmentStatus | null;
  shipment_code: string | null;
  jam_berangkat: string | null;
  jam_pulang: string | null;
  jumlah_toko: number | null;
  terkirim: number | null;
  gagal: number | null;
  alasan: unknown;
};

type FreelanceDetailRow = {
  shipment_id: number;
  nama_freelance: string;
  tanggal_shipment: string;
  status_shipment: ShipmentStatus;
  shipment_code: string | null;
  jam_berangkat: string | null;
  jam_pulang: string | null;
  jumlah_toko: number;
  terkirim: number;
  gagal: number;
  alasan: unknown;
};

type AdminTanggalItem = {
  person_type: "regular" | "freelance";
  nik_kerja: string | null;
  nama_lengkap: string;
  status: "Regular" | "Freelance";
  action: "input" | "edit_delete";
  shipment_code_display: string;
  shipment: {
    shipment_id: number;
    area_id: string;
    nik_kerja: string | null;
    is_freelance: boolean;
    nama_freelance: string | null;
    tanggal_shipment: string;
    status_shipment: ShipmentStatus;
    shipment_code: string | null;
    jam_berangkat: string | null;
    jam_pulang: string | null;
    jumlah_toko: number;
    terkirim: number;
    gagal: number;
    alasan: ShipmentFailureReason[];
  } | null;
};

const dateParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

const failureReasonSet = new Set<string>(FAILURE_REASONS);

function isFailureReason(value: unknown): value is FailureReason {
  return typeof value === "string" && failureReasonSet.has(value);
}

function normalizeFailureReason(item: unknown): ShipmentFailureReason | null {
  if (isFailureReason(item)) {
    return { reason: item };
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const record = item as {
    reason?: unknown;
    note?: unknown;
  };

  if (!isFailureReason(record.reason)) {
    return null;
  }

  const note =
    typeof record.note === "string" && record.note.trim()
      ? record.note.trim()
      : undefined;

  return note
    ? { reason: record.reason, note }
    : { reason: record.reason };
}

function isActiveShipmentCode(shipmentCode: string | null | undefined): boolean {
  return typeof shipmentCode === "string" && /^\d{10}$/.test(shipmentCode);
}

function parseAlasan(value: unknown): ShipmentFailureReason[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeFailureReason(item))
      .filter((item): item is ShipmentFailureReason => Boolean(item));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    if (isFailureReason(trimmed)) {
      return [{ reason: trimmed }];
    }

    try {
      return parseAlasan(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }

  return [];
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      date: string;
    }>;
  },
) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { ok: false, message: "Belum login" },
        { status: 401 },
      );
    }

    if (session.user_role !== "admin") {
      return NextResponse.json(
        { ok: false, message: "Endpoint ini hanya untuk user admin" },
        { status: 403 },
      );
    }

    if (!session.area_id) {
      return NextResponse.json(
        { ok: false, message: "Admin tidak memiliki area" },
        { status: 400 },
      );
    }

    const params = await context.params;
    const parsedDate = dateParamSchema.safeParse(params.date);

    if (!parsedDate.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Tanggal tidak valid",
          errors: parsedDate.error.flatten().formErrors,
        },
        { status: 400 },
      );
    }

    const areaId = session.area_id;
    const date = parsedDate.data;

    const areaRows = await query<AreaRow>`
      SELECT
        a.area_id,
        a.nama_area,
        a.sla_area
      FROM area a
      WHERE a.area_id = ${areaId}
      LIMIT 1
    `;

    const areaInfo = areaRows[0];

    const regularRows = await query<RegularDetailRow>`
      SELECT
        u.nik_kerja,
        u.nama_lengkap,
        s.shipment_id,
        s.tanggal_shipment::TEXT AS tanggal_shipment,
        CASE
          WHEN s.shipment_code ~ '^[0-9]{10}$' THEN 'Aktif'
          ELSE s.shipment_code
        END AS status_shipment,
        s.shipment_code,
        s.jam_berangkat::TEXT AS jam_berangkat,
        s.jam_pulang::TEXT AS jam_pulang,
        s.jumlah_toko,
        s.terkirim,
        s.gagal,
        COALESCE(s.alasan, '[]'::JSONB) AS alasan
      FROM users u
      LEFT JOIN shipments s
        ON s.nik_kerja = u.nik_kerja
        AND s.area_id = ${areaId}
        AND s.is_freelance = FALSE
        AND s.tanggal_shipment = ${date}::DATE
      WHERE u.area_id = ${areaId}
        AND u.user_role = 'regular'
        AND u.is_active = TRUE
      ORDER BY u.nama_lengkap ASC
    `;

    const freelanceRows = await query<FreelanceDetailRow>`
      SELECT
        s.shipment_id,
        s.nama_freelance,
        s.tanggal_shipment::TEXT AS tanggal_shipment,
        CASE
          WHEN s.shipment_code ~ '^[0-9]{10}$' THEN 'Aktif'
          ELSE s.shipment_code
        END AS status_shipment,
        s.shipment_code,
        s.jam_berangkat::TEXT AS jam_berangkat,
        s.jam_pulang::TEXT AS jam_pulang,
        s.jumlah_toko,
        s.terkirim,
        s.gagal,
        COALESCE(s.alasan, '[]'::JSONB) AS alasan
      FROM shipments s
      WHERE s.area_id = ${areaId}
        AND s.is_freelance = TRUE
        AND s.tanggal_shipment = ${date}::DATE
      ORDER BY s.nama_freelance ASC
    `;

    const regularItems: AdminTanggalItem[] = regularRows.map((row) => ({
      person_type: "regular",
      nik_kerja: row.nik_kerja,
      nama_lengkap: row.nama_lengkap,
      status: "Regular",
      action: row.shipment_id ? "edit_delete" : "input",
      shipment_code_display: row.shipment_code || "-",
      shipment: row.shipment_id
        ? {
            shipment_id: row.shipment_id,
            area_id: areaId,
            nik_kerja: row.nik_kerja,
            is_freelance: false,
            nama_freelance: null,
            tanggal_shipment: row.tanggal_shipment ?? date,
            status_shipment: row.status_shipment ?? "Aktif",
            shipment_code: row.shipment_code,
            jam_berangkat: row.jam_berangkat,
            jam_pulang: row.jam_pulang,
            jumlah_toko: row.jumlah_toko ?? 0,
            terkirim: row.terkirim ?? 0,
            gagal: row.gagal ?? 0,
            alasan: parseAlasan(row.alasan),
          }
        : null,
    }));

    const freelanceItems: AdminTanggalItem[] = freelanceRows.map((row) => ({
      person_type: "freelance",
      nik_kerja: null,
      nama_lengkap: row.nama_freelance,
      status: "Freelance",
      action: "edit_delete",
      shipment_code_display: row.shipment_code || "-",
      shipment: {
        shipment_id: row.shipment_id,
        area_id: areaId,
        nik_kerja: null,
        is_freelance: true,
        nama_freelance: row.nama_freelance,
        tanggal_shipment: row.tanggal_shipment,
        status_shipment: row.status_shipment,
        shipment_code: row.shipment_code,
        jam_berangkat: row.jam_berangkat,
        jam_pulang: row.jam_pulang,
        jumlah_toko: row.jumlah_toko,
        terkirim: row.terkirim,
        gagal: row.gagal,
        alasan: parseAlasan(row.alasan),
      },
    }));

    const items = [...regularItems, ...freelanceItems];
    const submittedItems = items.filter((item) => item.shipment?.shipment_code);

    return NextResponse.json({
      ok: true,
      data: {
        tanggal: date,
        area_id: areaId,
        nama_area: areaInfo?.nama_area ?? areaId,
        sla_area: Number(areaInfo?.sla_area ?? 0),
        total_regular: regularItems.filter((item) => item.shipment).length,
        total_freelance: freelanceItems.length,
        total_efektif: submittedItems.filter((item) =>
          isActiveShipmentCode(item.shipment?.shipment_code),
        ).length,
        total_non_efektif: submittedItems.filter(
          (item) =>
            item.shipment?.shipment_code &&
            !isActiveShipmentCode(item.shipment.shipment_code),
        ).length,
        items,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal mengambil detail tanggal admin";

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