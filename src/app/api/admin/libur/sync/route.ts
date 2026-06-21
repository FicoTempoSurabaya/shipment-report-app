import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { syncIndonesiaHolidayCalendar } from "@/lib/holiday-calendar";

type SyncHolidayRequestBody = {
  year?: unknown;
};

function parseYear(value: unknown): number {
  const year = value === undefined || value === null || value === ""
    ? new Date().getFullYear()
    : Number(value);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Tahun libur harus berupa angka 2000 sampai 2100");
  }

  return year;
}

async function readJsonBody(request: Request): Promise<SyncHolidayRequestBody> {
  try {
    return (await request.json()) as SyncHolidayRequestBody;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
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
          message: "Sinkronisasi libur hanya untuk user admin",
        },
        {
          status: 403,
        },
      );
    }

    const body = await readJsonBody(request);
    const { searchParams } = new URL(request.url);
    const year = parseYear(body.year ?? searchParams.get("year"));
    const result = await syncIndonesiaHolidayCalendar(year);

    return NextResponse.json({
      ok: true,
      message: `Berhasil sinkronisasi ${result.synced_count} data libur tahun ${year}`,
      data: {
        year,
        ...result,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal sinkronisasi libur kalender";

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
