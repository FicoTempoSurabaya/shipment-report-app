import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { validateSpreadsheetRequest } from "@/lib/spreadsheet-auth";
import { formatFailureReasonsForSheet } from "@/lib/spreadsheet-sync";
import type { ShipmentFailureReason } from "@/types/shipment";

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
  alasan: ShipmentFailureReason[] | null;
  __row_hash: string;
};

export async function GET(request: Request) {
  const auth = await validateSpreadsheetRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
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
        )) AS __row_hash
      FROM shipments s
      LEFT JOIN users u
        ON u.nik_kerja = s.nik_kerja
        AND u.area_id = s.area_id
      WHERE s.area_id = ${auth.context.areaId}
      ORDER BY s.tanggal_shipment DESC, s.shipment_id DESC
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
        __last_synced_at: new Date().toISOString(),
        __row_hash: row.__row_hash,
      };
    });

    return NextResponse.json({
      ok: true,
      message: "Data shipments berhasil diambil dari database",
      rows: sheetRows,
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
