import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { validateSpreadsheetRequest } from "@/lib/spreadsheet-auth";
import {
  SYNC_ACTION,
  SYNC_STATUS,
  assertEndTimeAfterStartTime,
  buildPushSummary,
  formatFailureReasonsForSheet,
  getDatabaseErrorCode,
  getSyncAction,
  isBlankSpreadsheetRow,
  makeResult,
  normalizeDate,
  normalizeFailureReasonsForDb,
  normalizeStatusKerja,
  normalizeTime,
  resolveStatusShipmentFromShipmentCode,
  toNonNegativeInteger,
  toOptionalString,
  toRequiredString,
  type SpreadsheetRow,
} from "@/lib/spreadsheet-sync";
import type { ShipmentStatus } from "@/types/shipment";

type SpreadsheetShipmentsPayload = {
  rows?: SpreadsheetRow[];
};

type UserLookupRow = {
  user_id: string;
  nik_kerja: string;
  nama_lengkap: string;
};

type ShipmentDbRow = {
  shipment_id: string;
  area_id: string;
  user_id: string | null;
  nik_kerja: string | null;
  nama_lengkap: string | null;
  is_freelance: boolean;
  nama_freelance: string | null;
  tanggal_shipment: string;
  status_shipment: ShipmentStatus;
  shipment_code: string;
  jam_berangkat: string | null;
  jam_pulang: string | null;
  jumlah_toko: number;
  terkirim: number;
  gagal: number;
  alasan: string | null;
};

const BUSINESS_HEADERS = [
  "status_kerja",
  "nik_kerja",
  "nama_lengkap",
  "nama_freelance",
  "tanggal_shipment",
  "shipment_code",
  "jam_berangkat",
  "jam_pulang",
  "jumlah_toko",
  "terkirim",
  "alasan",
];

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

async function resolveRegularUser(params: {
  areaId: string;
  userId: string | null;
  nikKerja: string | null;
  namaLengkap: string | null;
}) {
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

  if (!params.namaLengkap) {
    throw new Error("nama_lengkap atau nik_kerja wajib diisi untuk regular");
  }

  const users = await getUsersByName({ areaId: params.areaId, namaLengkap: params.namaLengkap });

  if (users.length === 0) {
    throw new Error("nama_lengkap tidak ditemukan pada users area ini");
  }

  if (users.length > 1) {
    throw new Error("nama_lengkap tidak unik, gunakan data users yang valid");
  }

  return users[0];
}

function buildShipmentSnapshot(row: ShipmentDbRow) {
  const statusKerja = row.is_freelance ? "freelance" : "regular";

  return [
    row.area_id,
    statusKerja,
    row.nik_kerja ?? "",
    row.is_freelance ? "" : row.nama_lengkap ?? "",
    row.is_freelance ? row.nama_freelance ?? "" : "",
    row.tanggal_shipment,
    row.shipment_code,
    row.jam_berangkat ?? "",
    row.jam_pulang ?? "",
    String(row.jumlah_toko),
    String(row.terkirim),
    String(row.gagal),
    formatFailureReasonsForSheet(row.alasan),
  ].join("|");
}


function buildSheetValues(row: ShipmentDbRow, operation: "created" | "updated") {
  const statusKerja = row.is_freelance ? "freelance" : "regular";
  const shipmentCodeType = /^\d{10}$/.test(row.shipment_code) ? "AKTIF" : "NON_AKTIF";
  const syncedAt = new Date().toISOString();

  return {
    area_id: row.area_id,
    status_kerja: statusKerja,
    nik_kerja: row.nik_kerja ?? "",
    nama_lengkap: row.is_freelance ? "" : row.nama_lengkap ?? "",
    nama_freelance: row.is_freelance ? row.nama_freelance ?? "" : "",
    tanggal_shipment: row.tanggal_shipment,
    shipment_code: row.shipment_code,
    jam_berangkat: row.jam_berangkat ?? "",
    jam_pulang: row.jam_pulang ?? "",
    jumlah_toko: row.jumlah_toko,
    terkirim: row.terkirim,
    gagal: row.gagal,
    alasan: formatFailureReasonsForSheet(row.alasan),
    __shipment_id: row.shipment_id,
    __user_id: row.user_id ?? "",
    __is_freelance: row.is_freelance,
    __shipment_code_type: shipmentCodeType,
    __sync_action: "UPSERT",
    __sync_status: "SYNCED",
    __sync_message: operation === "created" ? "Shipment baru tersimpan" : "Shipment diperbarui",
    __last_synced_at: syncedAt,
    __sync_snapshot: buildShipmentSnapshot(row),
    __operation: operation,
  };
}

export async function POST(request: Request) {
  const auth = await validateSpreadsheetRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const payload = (await request.json()) as SpreadsheetShipmentsPayload;
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
        const shipmentId = toOptionalString(row.__shipment_id);

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
          if (!shipmentId) {
            throw new Error("__shipment_id wajib ada untuk DELETE shipment");
          }

          const deleted = await query<{ shipment_id: string }>`
            DELETE FROM shipments
            WHERE shipment_id = ${shipmentId}::BIGINT
              AND area_id = ${auth.context.areaId}::BIGINT
            RETURNING shipment_id::TEXT AS shipment_id
          `;

          if (!deleted[0]) {
            throw new Error("Shipment tidak ditemukan pada area spreadsheet");
          }

          results.push(
            makeResult({
              row,
              status: SYNC_STATUS.SYNCED,
              message: "Shipment dihapus",
              values: {
                __sync_action: "SKIP",
                __sync_status: "SYNCED",
                __sync_message: "Shipment dihapus",
              },
            }),
          );
          continue;
        }

        const statusKerja = normalizeStatusKerja(row.status_kerja);
        const tanggalShipment = normalizeDate(row.tanggal_shipment, "tanggal_shipment");
        const { shipment_code: shipmentCode } = resolveStatusShipmentFromShipmentCode(row.shipment_code);
        const jamBerangkat = normalizeTime(row.jam_berangkat, "jam_berangkat");
        const jamPulang = normalizeTime(row.jam_pulang, "jam_pulang");
        const jumlahToko = toNonNegativeInteger(row.jumlah_toko, "jumlah_toko");
        const terkirim = toNonNegativeInteger(row.terkirim, "terkirim");

        assertEndTimeAfterStartTime({ jamBerangkat, jamPulang });

        if (terkirim > jumlahToko) {
          throw new Error("terkirim tidak boleh lebih besar dari jumlah_toko");
        }

        const gagal = jumlahToko - terkirim;
        const alasanForDb = normalizeFailureReasonsForDb({ gagal, alasan: row.alasan });
        let saved: ShipmentDbRow[];

        if (statusKerja === "regular") {
          const user = await resolveRegularUser({
            areaId: auth.context.areaId,
            userId: toOptionalString(row.__user_id),
            nikKerja: toOptionalString(row.nik_kerja),
            namaLengkap: toOptionalString(row.nama_lengkap),
          });

          saved = shipmentId
            ? await query<ShipmentDbRow>`
                UPDATE shipments s
                SET
                  user_id = ${user.user_id}::BIGINT,
                  is_freelance = FALSE,
                  nama_freelance = NULL,
                  tanggal_shipment = ${tanggalShipment}::DATE,
                  shipment_code = ${shipmentCode},
                  jam_berangkat = ${jamBerangkat}::TIME,
                  jam_pulang = ${jamPulang}::TIME,
                  jumlah_toko = ${jumlahToko},
                  terkirim = ${terkirim},
                  gagal = ${gagal},
                  alasan = ${alasanForDb},
                  updated_at = NOW()
                WHERE s.shipment_id = ${shipmentId}::BIGINT
                  AND s.area_id = ${auth.context.areaId}::BIGINT
                RETURNING
                  s.shipment_id::TEXT AS shipment_id,
                  s.area_id::TEXT AS area_id,
                  s.user_id::TEXT AS user_id,
                  ${user.nik_kerja}::TEXT AS nik_kerja,
                  ${user.nama_lengkap}::TEXT AS nama_lengkap,
                  s.is_freelance,
                  s.nama_freelance,
                  s.tanggal_shipment::TEXT AS tanggal_shipment,
                  CASE WHEN s.shipment_code ~ '^[0-9]{10}$' THEN 'Aktif' ELSE s.shipment_code END AS status_shipment,
                  s.shipment_code,
                  s.jam_berangkat::TEXT AS jam_berangkat,
                  s.jam_pulang::TEXT AS jam_pulang,
                  s.jumlah_toko,
                  s.terkirim,
                  s.gagal,
                  COALESCE(s.alasan, '') AS alasan
              `
            : await query<ShipmentDbRow>`
                INSERT INTO shipments (
                  area_id,
                  user_id,
                  is_freelance,
                  nama_freelance,
                  tanggal_shipment,
                  shipment_code,
                  jam_berangkat,
                  jam_pulang,
                  jumlah_toko,
                  terkirim,
                  gagal,
                  alasan
                )
                VALUES (
                  ${auth.context.areaId}::BIGINT,
                  ${user.user_id}::BIGINT,
                  FALSE,
                  NULL,
                  ${tanggalShipment}::DATE,
                  ${shipmentCode},
                  ${jamBerangkat}::TIME,
                  ${jamPulang}::TIME,
                  ${jumlahToko},
                  ${terkirim},
                  ${gagal},
                  ${alasanForDb}
                )
                RETURNING
                  shipment_id::TEXT AS shipment_id,
                  area_id::TEXT AS area_id,
                  user_id::TEXT AS user_id,
                  ${user.nik_kerja}::TEXT AS nik_kerja,
                  ${user.nama_lengkap}::TEXT AS nama_lengkap,
                  is_freelance,
                  nama_freelance,
                  tanggal_shipment::TEXT AS tanggal_shipment,
                  CASE WHEN shipment_code ~ '^[0-9]{10}$' THEN 'Aktif' ELSE shipment_code END AS status_shipment,
                  shipment_code,
                  jam_berangkat::TEXT AS jam_berangkat,
                  jam_pulang::TEXT AS jam_pulang,
                  jumlah_toko,
                  terkirim,
                  gagal,
                  COALESCE(alasan, '') AS alasan
              `;
        } else {
          const namaFreelance = toRequiredString(row.nama_freelance, "nama_freelance");

          saved = shipmentId
            ? await query<ShipmentDbRow>`
                UPDATE shipments
                SET
                  user_id = NULL,
                  is_freelance = TRUE,
                  nama_freelance = ${namaFreelance},
                  tanggal_shipment = ${tanggalShipment}::DATE,
                  shipment_code = ${shipmentCode},
                  jam_berangkat = ${jamBerangkat}::TIME,
                  jam_pulang = ${jamPulang}::TIME,
                  jumlah_toko = ${jumlahToko},
                  terkirim = ${terkirim},
                  gagal = ${gagal},
                  alasan = ${alasanForDb},
                  updated_at = NOW()
                WHERE shipment_id = ${shipmentId}::BIGINT
                  AND area_id = ${auth.context.areaId}::BIGINT
                RETURNING
                  shipment_id::TEXT AS shipment_id,
                  area_id::TEXT AS area_id,
                  user_id::TEXT AS user_id,
                  NULL::TEXT AS nik_kerja,
                  NULL::TEXT AS nama_lengkap,
                  is_freelance,
                  nama_freelance,
                  tanggal_shipment::TEXT AS tanggal_shipment,
                  CASE WHEN shipment_code ~ '^[0-9]{10}$' THEN 'Aktif' ELSE shipment_code END AS status_shipment,
                  shipment_code,
                  jam_berangkat::TEXT AS jam_berangkat,
                  jam_pulang::TEXT AS jam_pulang,
                  jumlah_toko,
                  terkirim,
                  gagal,
                  COALESCE(alasan, '') AS alasan
              `
            : await query<ShipmentDbRow>`
                INSERT INTO shipments (
                  area_id,
                  user_id,
                  is_freelance,
                  nama_freelance,
                  tanggal_shipment,
                  shipment_code,
                  jam_berangkat,
                  jam_pulang,
                  jumlah_toko,
                  terkirim,
                  gagal,
                  alasan
                )
                VALUES (
                  ${auth.context.areaId}::BIGINT,
                  NULL,
                  TRUE,
                  ${namaFreelance},
                  ${tanggalShipment}::DATE,
                  ${shipmentCode},
                  ${jamBerangkat}::TIME,
                  ${jamPulang}::TIME,
                  ${jumlahToko},
                  ${terkirim},
                  ${gagal},
                  ${alasanForDb}
                )
                RETURNING
                  shipment_id::TEXT AS shipment_id,
                  area_id::TEXT AS area_id,
                  user_id::TEXT AS user_id,
                  NULL::TEXT AS nik_kerja,
                  NULL::TEXT AS nama_lengkap,
                  is_freelance,
                  nama_freelance,
                  tanggal_shipment::TEXT AS tanggal_shipment,
                  CASE WHEN shipment_code ~ '^[0-9]{10}$' THEN 'Aktif' ELSE shipment_code END AS status_shipment,
                  shipment_code,
                  jam_berangkat::TEXT AS jam_berangkat,
                  jam_pulang::TEXT AS jam_pulang,
                  jumlah_toko,
                  terkirim,
                  gagal,
                  COALESCE(alasan, '') AS alasan
              `;
        }

        const savedShipment = saved[0];

        if (!savedShipment) {
          throw new Error("Shipment tidak ditemukan atau gagal disimpan");
        }

        results.push(
          makeResult({
            row,
            status: SYNC_STATUS.SYNCED,
            message: "Shipment tersimpan",
            values: buildSheetValues(savedShipment, shipmentId ? "updated" : "created"),
          }),
        );
      } catch (error) {
        const code = getDatabaseErrorCode(error);
        const message =
          code === "23505"
            ? "Data shipment sudah ada pada tanggal tersebut"
            : code === "23514"
              ? "Data shipment melanggar aturan validasi database"
              : error instanceof Error
                ? error.message
                : "Gagal memproses shipment";

        results.push(
          makeResult({
            row,
            status: SYNC_STATUS.ERROR,
            message,
          }),
        );
      }
    }

    return NextResponse.json(buildPushSummary({ label: "shipments", total: rows.length, results }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal sync shipments dari spreadsheet";

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
