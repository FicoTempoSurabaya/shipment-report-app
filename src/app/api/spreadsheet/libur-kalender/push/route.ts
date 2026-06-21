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
  normalizeDate,
  toRequiredString,
  type SpreadsheetRow,
} from "@/lib/spreadsheet-sync";

type SpreadsheetLiburPayload = {
  rows?: SpreadsheetRow[];
};

type LiburRow = {
  tanggal_libur: string;
  keterangan_libur: string;
};

const BUSINESS_HEADERS = ["tanggal_libur", "keterangan_libur"];

export async function POST(request: Request) {
  const auth = await validateSpreadsheetRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    assertSpreadsheetAdminEmail(auth.context.userEmail);

    const payload = (await request.json()) as SpreadsheetLiburPayload;
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
        const tanggalLibur = normalizeDate(row.tanggal_libur, "tanggal_libur");

        if (action === SYNC_ACTION.SKIP) {
          results.push(
            makeResult({ row, status: SYNC_STATUS.SKIPPED, message: "Baris dilewati karena __sync_action = SKIP" }),
          );
          continue;
        }

        if (action === SYNC_ACTION.DELETE) {
          const deleted = await query<{ tanggal_libur: string }>`
            DELETE FROM libur_kalender
            WHERE tanggal_libur = ${tanggalLibur}::DATE
            RETURNING tanggal_libur::TEXT AS tanggal_libur
          `;

          if (!deleted[0]) {
            throw new Error("Tanggal libur tidak ditemukan");
          }

          results.push(
            makeResult({
              row,
              status: SYNC_STATUS.SYNCED,
              message: "Tanggal libur dihapus",
              values: {
                __sync_action: "SKIP",
                __sync_status: "SYNCED",
                __sync_message: "Tanggal libur dihapus",
              },
            }),
          );
          continue;
        }

        const keteranganLibur = toRequiredString(row.keterangan_libur, "keterangan_libur");

        const saved = await query<LiburRow>`
          INSERT INTO libur_kalender (tanggal_libur, keterangan_libur)
          VALUES (${tanggalLibur}::DATE, ${keteranganLibur})
          ON CONFLICT (tanggal_libur)
          DO UPDATE SET keterangan_libur = EXCLUDED.keterangan_libur
          RETURNING tanggal_libur::TEXT AS tanggal_libur, keterangan_libur
        `;

        results.push(
          makeResult({
            row,
            status: SYNC_STATUS.SYNCED,
            message: "Tanggal libur tersimpan",
            values: {
              ...saved[0],
              __original_tanggal_libur: saved[0].tanggal_libur,
              __source: "manual",
              __sync_action: "UPSERT",
              __sync_status: "SYNCED",
              __sync_message: "Tanggal libur tersimpan",
            },
          }),
        );
      } catch (error) {
        const code = getDatabaseErrorCode(error);
        const message =
          code === "23505" || code === "23514"
            ? "Data libur kalender melanggar aturan database"
            : error instanceof Error
              ? error.message
              : "Gagal memproses libur kalender";

        results.push(makeResult({ row, status: SYNC_STATUS.ERROR, message }));
      }
    }

    return NextResponse.json(buildPushSummary({ label: "libur_kalender", total: rows.length, results }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal sync libur_kalender dari spreadsheet";

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
