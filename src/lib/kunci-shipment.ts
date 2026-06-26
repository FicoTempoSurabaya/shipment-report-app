import { getInclusiveDateRange } from "@/lib/date";
import { query } from "@/lib/db";

export type ShipmentLockRow = {
  kunci_id: number;
  area_id: string;
  user_id: string | null;
  nik_kerja: string | null;
  tanggal_awal: string;
  tanggal_akhir: string;
  keterangan_kunci: string | null;
};

export type ShipmentLockInfo = {
  kunci_id: number;
  area_id: string;
  user_id: string | null;
  nik_kerja: string | null;
  keterangan_kunci: string | null;
};

export async function getRegularShipmentLock(params: {
  areaId: string;
  userId: string;
  tanggalShipment: string;
}): Promise<ShipmentLockRow | null> {
  const rows = await query<ShipmentLockRow>`
    SELECT
      k.kunci_id,
      k.area_id::TEXT AS area_id,
      k.user_id::TEXT AS user_id,
      u.nik_kerja,
      k.tanggal_awal::TEXT AS tanggal_awal,
      k.tanggal_akhir::TEXT AS tanggal_akhir,
      k.keterangan_kunci
    FROM kunci_shipment k
    LEFT JOIN users u ON u.user_id = k.user_id
    WHERE k.area_id = ${params.areaId}::BIGINT
      AND k.tanggal_awal <= ${params.tanggalShipment}::DATE
      AND k.tanggal_akhir >= ${params.tanggalShipment}::DATE
      AND (
        k.user_id IS NULL
        OR k.user_id = ${params.userId}::BIGINT
      )
    ORDER BY
      CASE WHEN k.user_id IS NULL THEN 1 ELSE 0 END,
      k.tanggal_awal DESC,
      k.kunci_id DESC
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function getRegularShipmentLocksInRange(params: {
  areaId: string;
  userId: string;
  startDate: string;
  endDate: string;
}): Promise<ShipmentLockRow[]> {
  return query<ShipmentLockRow>`
    SELECT
      k.kunci_id,
      k.area_id::TEXT AS area_id,
      k.user_id::TEXT AS user_id,
      u.nik_kerja,
      k.tanggal_awal::TEXT AS tanggal_awal,
      k.tanggal_akhir::TEXT AS tanggal_akhir,
      k.keterangan_kunci
    FROM kunci_shipment k
    LEFT JOIN users u ON u.user_id = k.user_id
    WHERE k.area_id = ${params.areaId}::BIGINT
      AND k.tanggal_awal <= ${params.endDate}::DATE
      AND k.tanggal_akhir >= ${params.startDate}::DATE
      AND (
        k.user_id IS NULL
        OR k.user_id = ${params.userId}::BIGINT
      )
    ORDER BY
      k.tanggal_awal ASC,
      k.tanggal_akhir ASC,
      CASE WHEN k.user_id IS NULL THEN 1 ELSE 0 END,
      k.kunci_id ASC
  `;
}

export function buildShipmentLockMap(params: {
  locks: ShipmentLockRow[];
  startDate: string;
  endDate: string;
}): Map<string, ShipmentLockInfo> {
  const map = new Map<string, ShipmentLockInfo>();

  for (const lock of params.locks) {
    const lockStart = lock.tanggal_awal.slice(0, 10);
    const lockEnd = lock.tanggal_akhir.slice(0, 10);
    const startDate = lockStart > params.startDate ? lockStart : params.startDate;
    const endDate = lockEnd < params.endDate ? lockEnd : params.endDate;
    const dateRange = getInclusiveDateRange(startDate, endDate);

    for (const date of dateRange) {
      const current = map.get(date);
      const currentIsAreaLock = current?.user_id === null;
      const nextIsUserLock = lock.user_id !== null;

      if (!current || (currentIsAreaLock && nextIsUserLock)) {
        map.set(date, {
          kunci_id: lock.kunci_id,
          area_id: lock.area_id,
          user_id: lock.user_id,
          nik_kerja: lock.nik_kerja,
          keterangan_kunci: lock.keterangan_kunci,
        });
      }
    }
  }

  return map;
}

export function getShipmentLockMessage(lock: ShipmentLockInfo | ShipmentLockRow) {
  return lock.keterangan_kunci?.trim() || "Tanggal shipment dikunci";
}
