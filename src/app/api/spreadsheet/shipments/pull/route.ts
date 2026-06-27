import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { validateSpreadsheetRequest } from "@/lib/spreadsheet-auth";
import { formatFailureReasonsForSheet } from "@/lib/spreadsheet-sync";

type ShipmentPullDbRow = {
  shipment_id: string;
  area_id: string;
  user_id: string | null;
  nik_kerja: string | null;
  nama_lengkap: string | null;
  is_freelance: boolean;
  nama_freelance: string | null;
  tanggal_shipment: string;
  shipment_code: string;
  jam_berangkat: string | null;
  jam_pulang: string | null;
  jumlah_toko: number;
  terkirim: number;
  gagal: number;
  alasan: string | null;
  __sync_snapshot: string;
  __updated_at: string;
};

function normalizeLimit(value: string | null): number {
  const parsed = Number(value ?? 500);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 500;
  }

  return Math.min(parsed, 5000);
}

function parseCursor(value: string | null) {
  const text = String(value ?? "").trim();

  if (!text) {
    return {
      mode: "updated_at" as const,
      updatedAt: "",
      shipmentId: "0",
    };
  }

  if (text.startsWith("ID||")) {
    const shipmentId = text.slice(4);

    return {
      mode: "shipment_id" as const,
      updatedAt: "",
      shipmentId: /^\d+$/.test(shipmentId) ? shipmentId : "0",
    };
  }

  const [updatedAt = "", shipmentId = "0"] = text.split("||");

  return {
    mode: "updated_at" as const,
    updatedAt,
    shipmentId: /^\d+$/.test(shipmentId) ? shipmentId : "0",
  };
}

export async function GET(request: Request) {
  const auth = await validateSpreadsheetRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const url = new URL(request.url);
    const updatedAfter = url.searchParams.get("updated_after")?.trim() ?? "";
    const limit = normalizeLimit(url.searchParams.get("limit"));
    const cursor = parseCursor(url.searchParams.get("cursor"));
    const fetchedAt = new Date().toISOString();
    const queryLimit = limit + 1;
    const useShipmentIdCursor = cursor.mode === "shipment_id";

    const rowsRaw = useShipmentIdCursor
      ? await query<ShipmentPullDbRow>`
      SELECT
        s.shipment_id::TEXT AS shipment_id,
        s.area_id::TEXT AS area_id,
        s.user_id::TEXT AS user_id,
        u.nik_kerja,
        u.nama_lengkap,
        s.is_freelance,
        s.nama_freelance,
        s.tanggal_shipment::TEXT AS tanggal_shipment,
        s.shipment_code,
        s.jam_berangkat::TEXT AS jam_berangkat,
        s.jam_pulang::TEXT AS jam_pulang,
        s.jumlah_toko,
        s.terkirim,
        s.gagal,
        COALESCE(s.alasan, '') AS alasan,
        CONCAT_WS('|',
          s.area_id::TEXT,
          CASE WHEN s.is_freelance THEN 'freelance' ELSE 'regular' END,
          COALESCE(u.nik_kerja, ''),
          CASE WHEN s.is_freelance THEN '' ELSE COALESCE(u.nama_lengkap, '') END,
          CASE WHEN s.is_freelance THEN COALESCE(s.nama_freelance, '') ELSE '' END,
          s.tanggal_shipment::TEXT,
          s.shipment_code,
          COALESCE(s.jam_berangkat::TEXT, ''),
          COALESCE(s.jam_pulang::TEXT, ''),
          s.jumlah_toko::TEXT,
          s.terkirim::TEXT,
          s.gagal::TEXT,
          COALESCE(s.alasan, '')
        ) AS __sync_snapshot,
        s.updated_at::TEXT AS __updated_at
      FROM shipments s
      LEFT JOIN users u ON u.user_id = s.user_id
      WHERE s.area_id = ${auth.context.areaId}::BIGINT
        AND s.shipment_id > ${cursor.shipmentId}::BIGINT
      ORDER BY s.shipment_id ASC
      LIMIT ${queryLimit}
    `
      : await query<ShipmentPullDbRow>`
      SELECT
        s.shipment_id::TEXT AS shipment_id,
        s.area_id::TEXT AS area_id,
        s.user_id::TEXT AS user_id,
        u.nik_kerja,
        u.nama_lengkap,
        s.is_freelance,
        s.nama_freelance,
        s.tanggal_shipment::TEXT AS tanggal_shipment,
        s.shipment_code,
        s.jam_berangkat::TEXT AS jam_berangkat,
        s.jam_pulang::TEXT AS jam_pulang,
        s.jumlah_toko,
        s.terkirim,
        s.gagal,
        COALESCE(s.alasan, '') AS alasan,
        CONCAT_WS('|',
          s.area_id::TEXT,
          CASE WHEN s.is_freelance THEN 'freelance' ELSE 'regular' END,
          COALESCE(u.nik_kerja, ''),
          CASE WHEN s.is_freelance THEN '' ELSE COALESCE(u.nama_lengkap, '') END,
          CASE WHEN s.is_freelance THEN COALESCE(s.nama_freelance, '') ELSE '' END,
          s.tanggal_shipment::TEXT,
          s.shipment_code,
          COALESCE(s.jam_berangkat::TEXT, ''),
          COALESCE(s.jam_pulang::TEXT, ''),
          s.jumlah_toko::TEXT,
          s.terkirim::TEXT,
          s.gagal::TEXT,
          COALESCE(s.alasan, '')
        ) AS __sync_snapshot,
        s.updated_at::TEXT AS __updated_at
      FROM shipments s
      LEFT JOIN users u ON u.user_id = s.user_id
      WHERE s.area_id = ${auth.context.areaId}::BIGINT
        AND (
          NULLIF(${updatedAfter}, '')::TIMESTAMPTZ IS NULL
          OR s.updated_at > NULLIF(${updatedAfter}, '')::TIMESTAMPTZ
        )
        AND (
          NULLIF(${cursor.updatedAt}, '')::TIMESTAMPTZ IS NULL
          OR s.updated_at > NULLIF(${cursor.updatedAt}, '')::TIMESTAMPTZ
          OR (
            s.updated_at = NULLIF(${cursor.updatedAt}, '')::TIMESTAMPTZ
            AND s.shipment_id > ${cursor.shipmentId}::BIGINT
          )
        )
      ORDER BY s.updated_at ASC, s.shipment_id ASC
      LIMIT ${queryLimit}
    `;

    const hasMore = rowsRaw.length > limit;
    const rows = hasMore ? rowsRaw.slice(0, limit) : rowsRaw;

    const totalRows = await query<{ total_count: string }>`
      SELECT COUNT(*)::TEXT AS total_count
      FROM shipments
      WHERE area_id = ${auth.context.areaId}::BIGINT
    `;
    const totalCount = Number(totalRows[0]?.total_count ?? 0);

    const sheetRows = rows.map((row) => {
      const statusKerja = row.is_freelance ? "freelance" : "regular";
      const shipmentCodeType = /^\d{10}$/.test(row.shipment_code) ? "AKTIF" : "NON_AKTIF";

      return {
        area_id: row.area_id,
        status_kerja: statusKerja,
        nik_kerja: row.nik_kerja ?? "",
        nama_lengkap: row.is_freelance ? "" : row.nama_lengkap ?? "",
        nama_freelance: row.is_freelance ? row.nama_freelance ?? "" : "",
        tanggal_shipment: row.tanggal_shipment,
        shipment_code: row.shipment_code,
        jam_berangkat: row.jam_berangkat ?? "",
        jam_pulang: row.jam_pulang ?? "",
        jumlah_toko: row.jumlah_toko,
        terkirim: row.terkirim,
        gagal: row.gagal,
        alasan: formatFailureReasonsForSheet(row.alasan),
        __shipment_id: row.shipment_id,
        __user_id: row.user_id ?? "",
        __is_freelance: row.is_freelance,
        __shipment_code_type: shipmentCodeType,
        __sync_action: "SKIP",
        __sync_status: "SYNCED",
        __sync_message: "",
        __last_synced_at: fetchedAt,
        __sync_snapshot: row.__sync_snapshot,
      };
    });

    const lastRow = rows[rows.length - 1];
    const nextCursor = hasMore && lastRow
      ? useShipmentIdCursor
        ? `ID||${lastRow.shipment_id}`
        : `${lastRow.__updated_at}||${lastRow.shipment_id}`
      : "";

    return NextResponse.json({
      ok: true,
      message: "Data shipments berhasil diambil dari database",
      rows: sheetRows,
      next_cursor: nextCursor,
      has_more: hasMore,
      total_count: totalCount,
      batch_limit: limit,
      fetched_at: fetchedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengambil shipments untuk spreadsheet";

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
