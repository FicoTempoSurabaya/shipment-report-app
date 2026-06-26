import { NextResponse } from "next/server";

import { validateSpreadsheetRequest } from "@/lib/spreadsheet-auth";
import { query } from "@/lib/db";
import type { UserJabatan } from "@/types/user";

type SpreadsheetUserPullRow = {
  user_id: string;
  nik_kerja: string;
  area_id: string;
  area_code: string;
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
  __sync_snapshot: string;
};

export async function GET(request: Request) {
  const auth = await validateSpreadsheetRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const rows = await query<SpreadsheetUserPullRow>`
      SELECT
        u.user_id::TEXT AS user_id,
        u.nik_kerja,
        u.area_id::TEXT AS area_id,
        a.area_code,
        u.nama_lengkap,
        u.jabatan,
        u.username,
        ''::TEXT AS password,
        u.is_active,
        u.nik_kerja AS __original_nik_kerja,
        'regular'::TEXT AS __user_role,
        'UPSERT'::TEXT AS __sync_action,
        'SYNCED'::TEXT AS __sync_status,
        'Data dari database'::TEXT AS __sync_message,
        NOW()::TEXT AS __last_synced_at,
        CONCAT_WS('|', u.nik_kerja, u.area_id::TEXT, a.area_code, u.nama_lengkap, u.jabatan, u.username, '', u.is_active::TEXT) AS __sync_snapshot
      FROM users u
      LEFT JOIN area a ON a.area_id = u.area_id
      WHERE u.area_id = ${auth.context.areaId}::BIGINT
        AND u.user_role = 'regular'
      ORDER BY u.is_active DESC, u.nama_lengkap ASC, u.nik_kerja ASC
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
