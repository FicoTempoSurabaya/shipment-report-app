import { NextResponse } from "next/server";

import { validateSpreadsheetRequest } from "@/lib/spreadsheet-auth";
import { query } from "@/lib/db";
import {
  SYNC_ACTION,
  SYNC_STATUS,
  buildPushSummary,
  getDatabaseErrorCode,
  getSyncAction,
  isBlankSpreadsheetRow,
  makeResult,
  normalizeJabatan,
  toBoolean,
  toOptionalString,
  toRequiredString,
  type SpreadsheetRow,
} from "@/lib/spreadsheet-sync";
import type { UserJabatan } from "@/types/user";

type SpreadsheetUsersPayload = {
  rows?: SpreadsheetRow[];
};

type ExistingUserRow = {
  nik_kerja: string;
  area_id: string | null;
  user_role: string;
  password: string;
};

type SpreadsheetUserRow = {
  nik_kerja: string;
  area_id: string;
  nama_lengkap: string;
  jabatan: UserJabatan;
  username: string;
  password: string;
  is_active: boolean;
};

const BUSINESS_HEADERS = ["nik_kerja", "nama_lengkap", "jabatan", "username", "password", "is_active"];

export async function POST(request: Request) {
  const auth = await validateSpreadsheetRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const payload = (await request.json()) as SpreadsheetUsersPayload;
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const results = [];

    for (const row of rows) {
      try {
        if (isBlankSpreadsheetRow(row, BUSINESS_HEADERS)) {
          results.push(
            makeResult({
              row,
              status: SYNC_STATUS.SKIPPED,
              message: "Baris kosong dilewati",
            }),
          );
          continue;
        }

        const action = getSyncAction(row);

        if (action === SYNC_ACTION.SKIP) {
          results.push(
            makeResult({
              row,
              status: SYNC_STATUS.SKIPPED,
              message: "Baris dilewati karena __sync_action = SKIP",
            }),
          );
          continue;
        }

        if (action === SYNC_ACTION.DELETE) {
          const nikKerja = toRequiredString(row.nik_kerja, "nik_kerja");
          const updated = await query<SpreadsheetUserRow>`
            UPDATE users
            SET is_active = FALSE
            WHERE nik_kerja = ${nikKerja}
              AND area_id = ${auth.context.areaId}
              AND user_role = 'regular'
            RETURNING
              nik_kerja,
              area_id,
              nama_lengkap,
              jabatan,
              username,
              ''::TEXT AS password,
              is_active
          `;

          if (!updated[0]) {
            throw new Error("User regular tidak ditemukan pada area spreadsheet");
          }

          results.push(
            makeResult({
              row,
              status: SYNC_STATUS.SYNCED,
              message: "User dinonaktifkan",
              values: {
                ...updated[0],
                __original_nik_kerja: updated[0].nik_kerja,
                __user_role: "regular",
                __sync_action: "UPSERT",
                __sync_status: "SYNCED",
                __sync_message: "User dinonaktifkan",
              },
            }),
          );
          continue;
        }

        const nikKerja = toRequiredString(row.nik_kerja, "nik_kerja");
        const namaLengkap = toRequiredString(row.nama_lengkap, "nama_lengkap");
        const jabatan = normalizeJabatan(row.jabatan);
        const username = toRequiredString(row.username, "username");
        const password = toOptionalString(row.password);
        const isActive = toBoolean(row.is_active, true);

        const existing = await query<ExistingUserRow>`
          SELECT nik_kerja, area_id, user_role, password
          FROM users
          WHERE nik_kerja = ${nikKerja}
          LIMIT 1
        `;

        const existingUser = existing[0];

        if (existingUser && existingUser.area_id !== auth.context.areaId) {
          throw new Error("nik_kerja sudah digunakan oleh area lain");
        }

        if (existingUser && existingUser.user_role !== "regular") {
          throw new Error("User bukan regular sehingga tidak boleh dikelola dari spreadsheet");
        }

        if (!existingUser && !password) {
          throw new Error("password wajib diisi untuk user baru");
        }

        const finalPassword = password ?? existingUser?.password ?? "";

        const saved = existingUser
          ? await query<SpreadsheetUserRow>`
              UPDATE users
              SET
                nama_lengkap = ${namaLengkap},
                jabatan = ${jabatan},
                username = ${username},
                password = ${finalPassword},
                is_active = ${isActive}
              WHERE nik_kerja = ${nikKerja}
                AND area_id = ${auth.context.areaId}
                AND user_role = 'regular'
              RETURNING
                nik_kerja,
                area_id,
                nama_lengkap,
                jabatan,
                username,
                ''::TEXT AS password,
                is_active
            `
          : await query<SpreadsheetUserRow>`
              INSERT INTO users (
                nik_kerja,
                area_id,
                nama_lengkap,
                jabatan,
                user_role,
                username,
                password,
                is_active
              )
              VALUES (
                ${nikKerja},
                ${auth.context.areaId},
                ${namaLengkap},
                ${jabatan},
                'regular',
                ${username},
                ${finalPassword},
                ${isActive}
              )
              RETURNING
                nik_kerja,
                area_id,
                nama_lengkap,
                jabatan,
                username,
                ''::TEXT AS password,
                is_active
            `;

        const savedUser = saved[0];

        if (!savedUser) {
          throw new Error("User gagal disimpan");
        }

        results.push(
          makeResult({
            row,
            status: SYNC_STATUS.SYNCED,
            message: "User tersimpan",
            values: {
              ...savedUser,
              __original_nik_kerja: savedUser.nik_kerja,
              __user_role: "regular",
              __sync_action: "UPSERT",
              __sync_status: "SYNCED",
              __sync_message: "User tersimpan",
            },
          }),
        );
      } catch (error) {
        const code = getDatabaseErrorCode(error);
        const message =
          code === "23505"
            ? "nik_kerja atau username sudah digunakan"
            : error instanceof Error
              ? error.message
              : "Gagal memproses user";

        results.push(
          makeResult({
            row,
            status: SYNC_STATUS.ERROR,
            message,
          }),
        );
      }
    }

    return NextResponse.json(buildPushSummary({ label: "users", total: rows.length, results }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal sync users dari spreadsheet";

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
        status: 500,
      },
    );
  }
}
