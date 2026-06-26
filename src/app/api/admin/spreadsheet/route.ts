import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { adminSpreadsheetSchema } from "@/lib/validation";

type AreaSpreadsheetRow = {
  area_id: string;
  area_code: string;
  nama_area: string;
  spreadsheet_id: string | null;
  spreadsheet_url: string | null;
};

async function validateAdminSession() {
  const session = await getSession();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "Belum login",
        },
        {
          status: 401,
        },
      ),
    };
  }

  if (session.user_role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "Endpoint ini hanya untuk user admin",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (!session.area_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "Admin tidak memiliki area",
        },
        {
          status: 400,
        },
      ),
    };
  }

  return {
    ok: true as const,
    session,
    areaId: session.area_id,
  };
}

export async function GET() {
  try {
    const sessionResult = await validateAdminSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const rows = await query<AreaSpreadsheetRow>`
      SELECT
        area_id::TEXT AS area_id,
        area_code,
        nama_area,
        spreadsheet_id,
        spreadsheet_url
      FROM area
      WHERE area_id = ${sessionResult.areaId}::BIGINT
        AND is_active = TRUE
      LIMIT 1
    `;

    const area = rows[0];

    if (!area) {
      return NextResponse.json(
        {
          ok: false,
          message: "Area admin tidak ditemukan atau tidak aktif",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...area,
        is_connected: Boolean(area.spreadsheet_id && area.spreadsheet_url),
        button_label:
          area.spreadsheet_id && area.spreadsheet_url
            ? "Buka Spreadsheet"
            : "Hubungkan Spreadsheet",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal mengambil data spreadsheet area";

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

export async function POST(request: Request) {
  try {
    const sessionResult = await validateAdminSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const json = await request.json();
    const parsed = adminSpreadsheetSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Input spreadsheet tidak valid",
          errors: parsed.error.flatten().fieldErrors,
        },
        {
          status: 400,
        },
      );
    }

    const rows = await query<AreaSpreadsheetRow>`
      UPDATE area
      SET
        spreadsheet_id = ${parsed.data.spreadsheet_id},
        spreadsheet_url = ${parsed.data.spreadsheet_url}
      WHERE area_id = ${sessionResult.areaId}::BIGINT
        AND is_active = TRUE
      RETURNING
        area_id::TEXT AS area_id,
        area_code,
        nama_area,
        spreadsheet_id,
        spreadsheet_url
    `;

    const area = rows[0];

    if (!area) {
      return NextResponse.json(
        {
          ok: false,
          message: "Area admin tidak ditemukan atau tidak aktif",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Spreadsheet area berhasil dihubungkan",
      data: {
        ...area,
        is_connected: Boolean(area.spreadsheet_id && area.spreadsheet_url),
        button_label: "Buka Spreadsheet",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal menyimpan data spreadsheet area";

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