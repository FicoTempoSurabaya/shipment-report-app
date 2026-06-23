import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { validateSpreadsheetRequest } from "@/lib/spreadsheet-auth";
import { formatFailureReasonsForSheet } from "@/lib/spreadsheet-sync";

type ShipmentPullDbRow = {
  shipment_id: string;
  area_id: string;
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
  __row_hash: string;
  __updated_at: string;
};

function normalizeLimit(value: string | null): number {
  const parsed = Number(value ?? 500);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 500;
  }

  return Math.min(parsed, 1000);
}

function parseCursor(value: string | null) {
  const text = String(value ?? "").trim();

  if (!text) {
    return {
      updatedAt: "",
      shipmentId: "0",
    };
  }

  const [updatedAt = "", shipmentId = "0"] = text.split("||");

  return {
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

    const rows = await query<ShipmentPullDbRow>`
      SELECT
        s.shipment_id::TEXT AS shipment_id,
        s.area_id,
        s.nik_kerja,
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
        MD5(CONCAT_WS('|',
          s.shipment_id::TEXT,
          s.area_id,
          COALESCE(s.nik_kerja, ''),
          s.is_freelance::TEXT,
          COALESCE(s.nama_freelance, ''),
          s.tanggal_shipment::TEXT,
          s.shipment_code,
          COALESCE(s.jam_berangkat::TEXT, ''),
          COALESCE(s.jam_pulang::TEXT, ''),
          s.jumlah_toko::TEXT,
          s.terkirim::TEXT,
          s.gagal::TEXT,
          COALESCE(s.alasan, '')
        )) AS __row_hash,
        s.updated_at::TEXT AS __updated_at
      FROM shipments s
      LEFT JOIN users u
        ON u.nik_kerja = s.nik_kerja
        AND u.area_id = s.area_id
      WHERE s.area_id = ${auth.context.areaId}
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
      LIMIT ${limit}
    `;

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
        __is_freelance: row.is_freelance,
        __shipment_code_type: shipmentCodeType,
        __sync_action: "UPSERT",
        __sync_status: "SYNCED",
        __sync_message: "Data dari database",
        __last_synced_at: fetchedAt,
        __row_hash: row.__row_hash,
      };
    });

    const lastRow = rows[rows.length - 1];
    const nextCursor = rows.length === limit && lastRow ? `${lastRow.__updated_at}||${lastRow.shipment_id}` : "";

    return NextResponse.json({
      ok: true,
      message: "Data shipments berhasil diambil dari database",
      rows: sheetRows,
      next_cursor: nextCursor,
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
