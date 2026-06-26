import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { validateSpreadsheetRequest } from "@/lib/spreadsheet-auth";
import {
  SYNC_ACTION,
  SYNC_STATUS,
  buildPushSummary,
  getDatabaseErrorCode,
  getSyncAction,
  isBlankSpreadsheetRow,
  makeResult,
  normalizeDate,
  toOptionalString,
  type SpreadsheetRow,
} from "@/lib/spreadsheet-sync";

type SpreadsheetLockingPayload = {
  rows?: SpreadsheetRow[];
};

type UserLookupRow = {
  user_id: string;
  nik_kerja: string;
  nama_lengkap: string;
};

type LockingDbRow = {
  kunci_id: string;
  area_id: string;
  user_id: string | null;
  nik_kerja: string | null;
  nama_lengkap: string | null;
  tanggal_awal: string;
  tanggal_akhir: string;
  keterangan_kunci: string;
};

const BUSINESS_HEADERS = ["nama_lengkap", "tanggal_awal", "tanggal_akhir", "keterangan_kunci"];

async function getUserByNik(params: { areaId: string; nikKerja: string }) {
  const rows = await query<UserLookupRow>`
    SELECT user_id::TEXT AS user_id, nik_kerja, nama_lengkap
    FROM users
    WHERE area_id = ${params.areaId}::BIGINT
      AND nik_kerja = ${params.nikKerja}
      AND user_role = 'regular'
      AND is_active = TRUE
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function getUserById(params: { areaId: string; userId: string }) {
  const rows = await query<UserLookupRow>`
    SELECT user_id::TEXT AS user_id, nik_kerja, nama_lengkap
    FROM users
    WHERE area_id = ${params.areaId}::BIGINT
      AND user_id = ${params.userId}::BIGINT
      AND user_role = 'regular'
      AND is_active = TRUE
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function getUsersByName(params: { areaId: string; namaLengkap: string }) {
  return query<UserLookupRow>`
    SELECT user_id::TEXT AS user_id, nik_kerja, nama_lengkap
    FROM users
    WHERE area_id = ${params.areaId}::BIGINT
      AND LOWER(nama_lengkap) = LOWER(${params.namaLengkap})
      AND user_role = 'regular'
      AND is_active = TRUE
    ORDER BY nik_kerja ASC
  `;
}

async function resolveUser(params: {
  areaId: string;
  userId: string | null;
  nikKerja: string | null;
  namaLengkap: string | null;
}) {
  if (!params.userId && !params.nikKerja && !params.namaLengkap) {
    return {
      user_id: null,
      nik_kerja: null,
      nama_lengkap: null,
    };
  }

  if (params.userId) {
    const user = await getUserById({ areaId: params.areaId, userId: params.userId });

    if (!user) {
      throw new Error("user_id tidak ditemukan pada users area ini");
    }

    return user;
  }

  if (params.nikKerja) {
    const user = await getUserByNik({ areaId: params.areaId, nikKerja: params.nikKerja });

    if (!user) {
      throw new Error("nik_kerja tidak ditemukan pada users area ini");
    }

    if (params.namaLengkap && user.nama_lengkap.trim().toLowerCase() !== params.namaLengkap.trim().toLowerCase()) {
      throw new Error("nik_kerja tidak cocok dengan nama_lengkap");
    }

    return user;
  }

  const users = await getUsersByName({ areaId: params.areaId, namaLengkap: params.namaLengkap ?? "" });

  if (users.length === 0) {
    throw new Error("nama_lengkap tidak ditemukan pada users area ini");
  }

  if (users.length > 1) {
    throw new Error("nama_lengkap tidak unik, gunakan data users yang valid");
  }

  return users[0];
}

function buildSheetValues(row: LockingDbRow) {
  return {
    area_id: row.area_id,
    nama_lengkap: row.nama_lengkap ?? "",
    tanggal_awal: row.tanggal_awal,
    tanggal_akhir: row.tanggal_akhir,
    keterangan_kunci: row.keterangan_kunci,
    __kunci_id: row.kunci_id,
    __user_id: row.user_id ?? "",
    __nik_kerja: row.nik_kerja ?? "",
    __sync_action: "UPSERT",
    __sync_status: "SYNCED",
    __sync_message: "Locking tersimpan",
  };
}

function getKeterangan(value: unknown) {
  return toOptionalString(value) ?? "Dikunci oleh spreadsheet";
}

export async function POST(request: Request) {
  const auth = await validateSpreadsheetRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const payload = (await request.json()) as SpreadsheetLockingPayload;
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
        const kunciId = toOptionalString(row.__kunci_id);

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
          if (!kunciId) {
            throw new Error("__kunci_id wajib ada untuk DELETE locking");
          }

          const deleted = await query<{ kunci_id: string }>`
            DELETE FROM kunci_shipment
            WHERE kunci_id = ${kunciId}::BIGINT
              AND area_id = ${auth.context.areaId}::BIGINT
            RETURNING kunci_id::TEXT AS kunci_id
          `;

          if (!deleted[0]) {
            throw new Error("Data kunci shipment tidak ditemukan pada area spreadsheet");
          }

          results.push(
            makeResult({
              row,
              status: SYNC_STATUS.SYNCED,
              message: "Locking dihapus",
              values: {
                __sync_action: "SKIP",
                __sync_status: "SYNCED",
                __sync_message: "Locking dihapus",
              },
            }),
          );
          continue;
        }

        const tanggalAwal = normalizeDate(row.tanggal_awal, "tanggal_awal");
        const tanggalAkhir = normalizeDate(row.tanggal_akhir, "tanggal_akhir");

        if (tanggalAkhir < tanggalAwal) {
          throw new Error("tanggal_akhir tidak boleh lebih kecil dari tanggal_awal");
        }

        const resolvedUser = await resolveUser({
          areaId: auth.context.areaId,
          userId: toOptionalString(row.__user_id),
          nikKerja: toOptionalString(row.__nik_kerja),
          namaLengkap: toOptionalString(row.nama_lengkap),
        });
        const keteranganKunci = getKeterangan(row.keterangan_kunci);

        const saved = kunciId
          ? await query<LockingDbRow>`
              UPDATE kunci_shipment k
              SET
                user_id = ${resolvedUser.user_id}::BIGINT,
                tanggal_awal = ${tanggalAwal}::DATE,
                tanggal_akhir = ${tanggalAkhir}::DATE,
                keterangan_kunci = ${keteranganKunci}
              WHERE k.kunci_id = ${kunciId}::BIGINT
                AND k.area_id = ${auth.context.areaId}::BIGINT
              RETURNING
                k.kunci_id::TEXT AS kunci_id,
                k.area_id::TEXT AS area_id,
                k.user_id::TEXT AS user_id,
                ${resolvedUser.nik_kerja}::TEXT AS nik_kerja,
                ${resolvedUser.nama_lengkap}::TEXT AS nama_lengkap,
                k.tanggal_awal::TEXT AS tanggal_awal,
                k.tanggal_akhir::TEXT AS tanggal_akhir,
                k.keterangan_kunci
            `
          : await query<LockingDbRow>`
              INSERT INTO kunci_shipment (
                area_id,
                user_id,
                tanggal_awal,
                tanggal_akhir,
                keterangan_kunci
              )
              VALUES (
                ${auth.context.areaId}::BIGINT,
                ${resolvedUser.user_id}::BIGINT,
                ${tanggalAwal}::DATE,
                ${tanggalAkhir}::DATE,
                ${keteranganKunci}
              )
              RETURNING
                kunci_id::TEXT AS kunci_id,
                area_id::TEXT AS area_id,
                user_id::TEXT AS user_id,
                ${resolvedUser.nik_kerja}::TEXT AS nik_kerja,
                ${resolvedUser.nama_lengkap}::TEXT AS nama_lengkap,
                tanggal_awal::TEXT AS tanggal_awal,
                tanggal_akhir::TEXT AS tanggal_akhir,
                keterangan_kunci
            `;

        const savedLock = saved[0];

        if (!savedLock) {
          throw new Error("Locking tidak ditemukan atau gagal disimpan");
        }

        results.push(
          makeResult({
            row,
            status: SYNC_STATUS.SYNCED,
            message: "Locking tersimpan",
            values: buildSheetValues(savedLock),
          }),
        );
      } catch (error) {
        const code = getDatabaseErrorCode(error);
        const message =
          code === "23514"
            ? "Tanggal akhir tidak boleh lebih kecil dari tanggal awal"
            : error instanceof Error
              ? error.message
              : "Gagal memproses locking";

        results.push(
          makeResult({
            row,
            status: SYNC_STATUS.ERROR,
            message,
          }),
        );
      }
    }

    return NextResponse.json(buildPushSummary({ label: "locking", total: rows.length, results }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal sync locking dari spreadsheet";

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
