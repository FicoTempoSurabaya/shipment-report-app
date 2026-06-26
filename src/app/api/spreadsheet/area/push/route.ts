import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { assertSpreadsheetAdminEmail, validateSpreadsheetRequest } from "@/lib/spreadsheet-auth";
import {
  SYNC_ACTION,
  SYNC_STATUS,
  buildPushSummary,
  getDatabaseErrorCode,
  getSyncAction,
  isBlankSpreadsheetRow,
  makeResult,
  toBoolean,
  toNonNegativeInteger,
  toOptionalString,
  toRequiredString,
  type SpreadsheetRow,
} from "@/lib/spreadsheet-sync";

// Area sheet masih boleh memakai header lama area_id sebagai kode area.
// Backend akan menyimpan kode tersebut ke area.area_code, sementara area.area_id tetap bigserial.
type SpreadsheetAreaPayload = {
  rows?: SpreadsheetRow[];
};

type AreaRow = {
  area_id: string;
  area_code: string;
  nama_area: string;
  sla_area: number;
  area_timezone: string;
  is_active: boolean;
};

const ALLOWED_AREA_TIMEZONES = new Set([
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
]);

const BUSINESS_HEADERS = ["area_code", "area_id", "nama_area", "sla_area", "area_timezone", "is_active"];

function toAreaTimezone(value: unknown): string {
  const text = String(value ?? "").trim();

  if (!text) {
    return "Asia/Jakarta";
  }

  if (!ALLOWED_AREA_TIMEZONES.has(text)) {
    throw new Error("area_timezone harus Asia/Jakarta, Asia/Makassar, atau Asia/Jayapura");
  }

  return text;
}

function isNumericId(value: string | null): value is string {
  return Boolean(value && /^\d+$/.test(value));
}

async function findArea(params: { areaId: string | null; areaCode: string }) {
  const rows = await query<{ area_id: string }>`
    SELECT area_id::TEXT AS area_id
    FROM area
    WHERE (
      ${isNumericId(params.areaId) ? params.areaId : null}::BIGINT IS NOT NULL
      AND area_id = ${isNumericId(params.areaId) ? params.areaId : null}::BIGINT
    )
      OR lower(area_code) = lower(${params.areaCode})
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function POST(request: Request) {
  const auth = await validateSpreadsheetRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    assertSpreadsheetAdminEmail(auth.context.userEmail);

    const payload = (await request.json()) as SpreadsheetAreaPayload;
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const results = [];

    for (const row of rows) {
      try {
        if (isBlankSpreadsheetRow(row, BUSINESS_HEADERS)) {
          results.push(
            makeResult({ row, status: SYNC_STATUS.SKIPPED, message: "Baris kosong dilewati" }),
          );
          continue;
        }

        const action = getSyncAction(row);
        const areaId = toOptionalString(row.area_id);
        const legacyAreaCode = areaId && !isNumericId(areaId) ? areaId : null;
        const areaCode = toOptionalString(row.area_code) ?? legacyAreaCode;

        if (!areaCode) {
          throw new Error("area_code wajib diisi. area_id sekarang adalah ID internal database.");
        }

        if (action === SYNC_ACTION.SKIP) {
          results.push(
            makeResult({ row, status: SYNC_STATUS.SKIPPED, message: "Baris dilewati karena __sync_action = SKIP" }),
          );
          continue;
        }

        if (action === SYNC_ACTION.DELETE) {
          const existing = await findArea({ areaId, areaCode });

          if (!existing) {
            throw new Error("Area tidak ditemukan");
          }

          const updated = await query<AreaRow>`
            UPDATE area
            SET is_active = FALSE
            WHERE area_id = ${existing.area_id}::BIGINT
            RETURNING area_id::TEXT AS area_id, area_code, nama_area, sla_area, area_timezone, is_active
          `;

          results.push(
            makeResult({
              row,
              status: SYNC_STATUS.SYNCED,
              message: "Area dinonaktifkan",
              values: {
                ...updated[0],
                __original_area_id: updated[0].area_id,
                __sync_action: "UPSERT",
                __sync_status: "SYNCED",
                __sync_message: "Area dinonaktifkan",
              },
            }),
          );
          continue;
        }

        const namaArea = toRequiredString(row.nama_area, "nama_area");
        const slaArea = toNonNegativeInteger(row.sla_area, "sla_area");
        const areaTimezone = toAreaTimezone(row.area_timezone);
        const isActive = toBoolean(row.is_active, true);
        const existing = await findArea({ areaId, areaCode });

        const saved = existing
          ? await query<AreaRow>`
              UPDATE area
              SET
                area_code = ${areaCode},
                nama_area = ${namaArea},
                sla_area = ${slaArea},
                area_timezone = ${areaTimezone},
                is_active = ${isActive}
              WHERE area_id = ${existing.area_id}::BIGINT
              RETURNING area_id::TEXT AS area_id, area_code, nama_area, sla_area, area_timezone, is_active
            `
          : await query<AreaRow>`
              INSERT INTO area (area_code, nama_area, sla_area, area_timezone, is_active)
              VALUES (${areaCode}, ${namaArea}, ${slaArea}, ${areaTimezone}, ${isActive})
              RETURNING area_id::TEXT AS area_id, area_code, nama_area, sla_area, area_timezone, is_active
            `;

        results.push(
          makeResult({
            row,
            status: SYNC_STATUS.SYNCED,
            message: "Area tersimpan",
            values: {
              ...saved[0],
              __original_area_id: saved[0].area_id,
              __sync_action: "UPSERT",
              __sync_status: "SYNCED",
              __sync_message: "Area tersimpan",
            },
          }),
        );
      } catch (error) {
        const code = getDatabaseErrorCode(error);
        const message =
          code === "23503" || code === "23514" || code === "23505"
            ? "Data area melanggar aturan database"
            : error instanceof Error
              ? error.message
              : "Gagal memproses area";

        results.push(makeResult({ row, status: SYNC_STATUS.ERROR, message }));
      }
    }

    return NextResponse.json(buildPushSummary({ label: "area", total: rows.length, results }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal sync area dari spreadsheet";

    return NextResponse.json(
      {
        ok: false,
        status: "FAILED",
        message,
        rows_total: 0,
        rows_success: 0,
        rows_failed: 0,
        results: [],
      },
      {
        status: message.startsWith("Akses ditolak") ? 403 : 500,
      },
    );
  }
}
