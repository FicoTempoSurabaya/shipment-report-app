import { NextResponse } from "next/server";

import { query } from "@/lib/db";

type LiburKalenderRow = {
  libur_id: number;
  tanggal_libur: string;
  keterangan_libur: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    if (startDate && endDate) {
      const holidays = await query<LiburKalenderRow>`
        SELECT
          libur_id,
          tanggal_libur::TEXT AS tanggal_libur,
          keterangan_libur
        FROM libur_kalender
        WHERE tanggal_libur BETWEEN ${startDate}::DATE AND ${endDate}::DATE
        ORDER BY tanggal_libur ASC
      `;

      return NextResponse.json({
        ok: true,
        data: holidays,
      });
    }

    const holidays = await query<LiburKalenderRow>`
      SELECT
        libur_id,
        tanggal_libur::TEXT AS tanggal_libur,
        keterangan_libur
      FROM libur_kalender
      ORDER BY tanggal_libur ASC
    `;

    return NextResponse.json({
      ok: true,
      data: holidays,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengambil data libur";

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