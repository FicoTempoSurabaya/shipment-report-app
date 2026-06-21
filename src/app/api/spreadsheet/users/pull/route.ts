import { NextResponse } from "next/server";

import { validateSpreadsheetRequest } from "@/lib/spreadsheet-auth";
import { query } from "@/lib/db";
import type { UserJabatan } from "@/types/user";

type SpreadsheetUserPullRow = {
  nik_kerja: string;
  area_id: string;
  nama_lengkap: string;
  jabatan: UserJabatan;
  username: string;
  password: string;
  is_active: boolean;
  __original_nik_kerja: string;
  __user_role: string;
  __sync_action: string;
  __sync_status: string;
  __sync_message: string;
  __last_synced_at: string;
  __row_hash: string;
};

export async function GET(request: Request) {
  const auth = await validateSpreadsheetRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const rows = await query<SpreadsheetUserPullRow>`
      SELECT
        nik_kerja,
        area_id,
        nama_lengkap,
        jabatan,
        username,
        ''::TEXT AS password,
        is_active,
        nik_kerja AS __original_nik_kerja,
        'regular'::TEXT AS __user_role,
        'UPSERT'::TEXT AS __sync_action,
        'SYNCED'::TEXT AS __sync_status,
        'Data dari database'::TEXT AS __sync_message,
        NOW()::TEXT AS __last_synced_at,
        MD5(CONCAT_WS('|', nik_kerja, area_id, nama_lengkap, jabatan, username, is_active::TEXT)) AS __row_hash
      FROM users
      WHERE area_id = ${auth.context.areaId}
        AND user_role = 'regular'
      ORDER BY is_active DESC, nama_lengkap ASC, nik_kerja ASC
    `;

    return NextResponse.json({
      ok: true,
      message: "Data users berhasil diambil dari database",
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengambil users untuk spreadsheet";

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
