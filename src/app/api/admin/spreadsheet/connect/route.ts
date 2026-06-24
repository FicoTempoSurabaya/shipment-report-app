import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { createAreaSpreadsheetViaAppsScript } from "@/lib/google-apps-script-connect";

type AreaSpreadsheetRow = {
  area_id: string;
  nama_area: string;
  spreadsheet_id: string | null;
  spreadsheet_url: string | null;
  area_timezone: string | null;
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
    areaId: session.area_id,
  };
}

function toSpreadsheetData(area: AreaSpreadsheetRow) {
  const isConnected = Boolean(area.spreadsheet_id && area.spreadsheet_url);

  return {
    area_id: area.area_id,
    nama_area: area.nama_area,
    spreadsheet_id: area.spreadsheet_id,
    spreadsheet_url: area.spreadsheet_url,
    is_connected: isConnected,
    button_label: isConnected ? "Buka" : "Hubungkan",
  };
}

export async function POST() {
  try {
    const sessionResult = await validateAdminSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const existingRows = await query<AreaSpreadsheetRow>`
      SELECT
        area_id,
        nama_area,
        spreadsheet_id,
        spreadsheet_url,
        COALESCE(area_timezone, 'Asia/Jakarta') AS area_timezone
      FROM area
      WHERE area_id = ${sessionResult.areaId}
        AND is_active = TRUE
      LIMIT 1
    `;

    const existingArea = existingRows[0];

    if (!existingArea) {
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

    if (existingArea.spreadsheet_id && existingArea.spreadsheet_url) {
      return NextResponse.json({
        ok: true,
        message: "Spreadsheet area sudah terhubung",
        data: toSpreadsheetData(existingArea),
      });
    }

    const connectedSpreadsheet = await createAreaSpreadsheetViaAppsScript({
      area_id: existingArea.area_id,
      area_name: existingArea.nama_area,
      area_timezone: existingArea.area_timezone,
    });

    const updatedRows = await query<AreaSpreadsheetRow>`
      UPDATE area
      SET
        spreadsheet_id = ${connectedSpreadsheet.spreadsheet_id},
        spreadsheet_url = ${connectedSpreadsheet.spreadsheet_url}
      WHERE area_id = ${existingArea.area_id}
        AND is_active = TRUE
      RETURNING
        area_id,
        nama_area,
        spreadsheet_id,
        spreadsheet_url,
        COALESCE(area_timezone, 'Asia/Jakarta') AS area_timezone
    `;

    const updatedArea = updatedRows[0];

    if (!updatedArea) {
      return NextResponse.json(
        {
          ok: false,
          message: "Spreadsheet berhasil dibuat, tetapi gagal disimpan ke database",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Spreadsheet area berhasil dihubungkan",
      data: toSpreadsheetData(updatedArea),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal menghubungkan spreadsheet area";

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
