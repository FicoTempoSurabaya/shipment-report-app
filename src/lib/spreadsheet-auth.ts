import { NextResponse } from "next/server";

import { query } from "@/lib/db";

type AreaSpreadsheetRow = {
  area_id: string;
  area_code: string;
  spreadsheet_id: string | null;
  spreadsheet_url: string | null;
  is_active: boolean;
};

export type SpreadsheetAuthContext = {
  areaId: string;
  areaCode: string;
  spreadsheetId: string;
  spreadsheetUrl: string | null;
  userEmail: string;
};

export type SpreadsheetAuthResult =
  | {
      ok: true;
      context: SpreadsheetAuthContext;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function getWebhookSecret(): string {
  const secret = process.env.SPREADSHEET_WEBHOOK_SECRET?.trim();

  if (!secret) {
    throw new Error("SPREADSHEET_WEBHOOK_SECRET belum diisi di .env.local");
  }

  if (secret.length < 16) {
    throw new Error("SPREADSHEET_WEBHOOK_SECRET terlalu pendek. Minimal 16 karakter.");
  }

  return secret;
}

function getHeader(request: Request, name: string): string {
  return request.headers.get(name)?.trim() ?? "";
}

function splitEmailList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function hasValidSecret(request: Request): boolean {
  const requestSecret = getHeader(request, "x-setra-webhook-secret");
  const expectedSecret = getWebhookSecret();

  return Boolean(requestSecret) && requestSecret === expectedSecret;
}

export function getSpreadsheetHeaderContext(request: Request) {
  return {
    areaId: getHeader(request, "x-setra-area-id"),
    spreadsheetId: getHeader(request, "x-setra-spreadsheet-id"),
    userEmail: getHeader(request, "x-setra-user-email").toLowerCase(),
  };
}

export async function validateSpreadsheetRequest(
  request: Request,
): Promise<SpreadsheetAuthResult> {
  try {
    if (!hasValidSecret(request)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            message: "Secret spreadsheet tidak valid",
          },
          {
            status: 401,
          },
        ),
      };
    }

    const { areaId, spreadsheetId, userEmail } = getSpreadsheetHeaderContext(request);

    if (!areaId) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            message: "Header X-Setra-Area-Id wajib diisi",
          },
          {
            status: 400,
          },
        ),
      };
    }

    if (!spreadsheetId) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            message: "Header X-Setra-Spreadsheet-Id wajib diisi",
          },
          {
            status: 400,
          },
        ),
      };
    }

    const isNumericAreaId = /^\d+$/.test(areaId);
    const rows = await query<AreaSpreadsheetRow>`
      SELECT
        area_id::TEXT AS area_id,
        area_code,
        spreadsheet_id,
        spreadsheet_url,
        is_active
      FROM area
      WHERE (
          ${isNumericAreaId ? areaId : null}::BIGINT IS NOT NULL
          AND area_id = ${isNumericAreaId ? areaId : null}::BIGINT
        )
        OR lower(area_code) = lower(${areaId})
      LIMIT 1
    `;

    const area = rows[0];

    if (!area) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            message: "Area spreadsheet tidak ditemukan di database",
          },
          {
            status: 404,
          },
        ),
      };
    }

    if (!area.is_active) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            message: "Area spreadsheet tidak aktif",
          },
          {
            status: 403,
          },
        ),
      };
    }

    if (!area.spreadsheet_id) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            message: "Area belum memiliki spreadsheet_id di database",
          },
          {
            status: 409,
          },
        ),
      };
    }

    if (area.spreadsheet_id !== spreadsheetId) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            message: "Spreadsheet ID tidak cocok dengan area di database",
          },
          {
            status: 403,
          },
        ),
      };
    }

    return {
      ok: true,
      context: {
        areaId: area.area_id,
        areaCode: area.area_code,
        spreadsheetId,
        spreadsheetUrl: area.spreadsheet_url,
        userEmail,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal memvalidasi request spreadsheet";

    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          message,
        },
        {
          status: 500,
        },
      ),
    };
  }
}

export function assertSpreadsheetAdminEmail(userEmail: string) {
  const normalizedEmail = userEmail.trim().toLowerCase();
  const ownerEmail = process.env.SPREADSHEET_OWNER_EMAIL?.trim().toLowerCase() ?? "";
  const superadminEmails = splitEmailList(process.env.SPREADSHEET_SUPERADMIN_EMAILS);

  if (!normalizedEmail) {
    throw new Error("Email Apps Script tidak terbaca");
  }

  if (normalizedEmail === ownerEmail || superadminEmails.includes(normalizedEmail)) {
    return;
  }

  throw new Error("Akses ditolak. Endpoint ini hanya untuk owner/superadmin spreadsheet");
}
