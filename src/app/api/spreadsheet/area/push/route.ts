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
  toRequiredString,
  type SpreadsheetRow,
} from "@/lib/spreadsheet-sync";

type SpreadsheetAreaPayload = {
  rows?: SpreadsheetRow[];
};

type AreaRow = {
  area_id: string;
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

const BUSINESS_HEADERS = ["area_id", "nama_area", "sla_area", "area_timezone", "is_active"];

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
        const areaId = toRequiredString(row.area_id, "area_id");

        if (action === SYNC_ACTION.SKIP) {
          results.push(
            makeResult({ row, status: SYNC_STATUS.SKIPPED, message: "Baris dilewati karena __sync_action = SKIP" }),
          );
          continue;
        }

        if (action === SYNC_ACTION.DELETE) {
          const updated = await query<AreaRow>`
            UPDATE area
            SET is_active = FALSE
            WHERE area_id = ${areaId}
            RETURNING area_id, nama_area, sla_area, area_timezone, is_active
          `;

          if (!updated[0]) {
            throw new Error("Area tidak ditemukan");
          }

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

        const saved = await query<AreaRow>`
          INSERT INTO area (area_id, nama_area, sla_area, area_timezone, is_active)
          VALUES (${areaId}, ${namaArea}, ${slaArea}, ${areaTimezone}, ${isActive})
          ON CONFLICT (area_id)
          DO UPDATE SET
            nama_area = EXCLUDED.nama_area,
            sla_area = EXCLUDED.sla_area,
            area_timezone = EXCLUDED.area_timezone,
            is_active = EXCLUDED.is_active
          RETURNING area_id, nama_area, sla_area, area_timezone, is_active
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
          code === "23503" || code === "23514"
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
