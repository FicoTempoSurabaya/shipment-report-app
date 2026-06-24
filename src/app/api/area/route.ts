import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import type { Area } from "@/types/area";

export async function GET() {
  try {
    const areas = await query<Area>`
      SELECT
        area_id,
        nama_area,
        sla_area,
        spreadsheet_id,
        spreadsheet_url,
        is_active
      FROM area
      WHERE is_active = TRUE
      ORDER BY nama_area ASC
    `;

    return NextResponse.json({
      ok: true,
      data: areas,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengambil data area";

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
