import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { validateSpreadsheetRequest } from "@/lib/spreadsheet-auth";

type LockingPullRow = {
  kunci_id: string;
  area_id: string;
  nik_kerja: string | null;
  nama_lengkap: string | null;
  tanggal_awal: string;
  tanggal_akhir: string;
  keterangan_kunci: string | null;
  __row_hash: string;
};

export async function GET(request: Request) {
  const auth = await validateSpreadsheetRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const rows = await query<LockingPullRow>`
      SELECT
        k.kunci_id::TEXT AS kunci_id,
        k.area_id,
        k.nik_kerja,
        u.nama_lengkap,
        k.tanggal_awal::TEXT AS tanggal_awal,
        k.tanggal_akhir::TEXT AS tanggal_akhir,
        k.keterangan_kunci,
        MD5(CONCAT_WS('|',
          k.kunci_id::TEXT,
          k.area_id,
          COALESCE(k.nik_kerja, ''),
          k.tanggal_awal::TEXT,
          k.tanggal_akhir::TEXT,
          COALESCE(k.keterangan_kunci, '')
        )) AS __row_hash
      FROM kunci_shipment k
      LEFT JOIN users u
        ON u.nik_kerja = k.nik_kerja
        AND u.area_id = k.area_id
      WHERE k.area_id = ${auth.context.areaId}
      ORDER BY k.tanggal_awal DESC, k.tanggal_akhir DESC, k.kunci_id DESC
    `;

    const sheetRows = rows.map((row) => ({
      area_id: row.area_id,
      nama_lengkap: row.nama_lengkap ?? "",
      tanggal_awal: row.tanggal_awal,
      tanggal_akhir: row.tanggal_akhir,
      keterangan_kunci: row.keterangan_kunci ?? "",
      __kunci_id: row.kunci_id,
      __nik_kerja: row.nik_kerja ?? "",
      __sync_action: "UPSERT",
      __sync_status: "SYNCED",
      __sync_message: "Data dari database",
      __last_synced_at: new Date().toISOString(),
      __row_hash: row.__row_hash,
    }));

    return NextResponse.json({
      ok: true,
      message: "Data locking berhasil diambil dari database",
      rows: sheetRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengambil locking untuk spreadsheet";

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
