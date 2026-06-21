import { getInclusiveDateRange } from "@/lib/date";
import { query } from "@/lib/db";

export type ShipmentLockRow = {
  kunci_id: number;
  area_id: string;
  nik_kerja: string | null;
  tanggal_awal: string;
  tanggal_akhir: string;
  keterangan_kunci: string | null;
};

export type ShipmentLockInfo = {
  kunci_id: number;
  area_id: string;
  nik_kerja: string | null;
  keterangan_kunci: string | null;
};

export async function getRegularShipmentLock(params: {
  areaId: string;
  nikKerja: string;
  tanggalShipment: string;
}): Promise<ShipmentLockRow | null> {
  const rows = await query<ShipmentLockRow>`
    SELECT
      kunci_id,
      area_id,
      nik_kerja,
      tanggal_awal::TEXT AS tanggal_awal,
      tanggal_akhir::TEXT AS tanggal_akhir,
      keterangan_kunci
    FROM kunci_shipment
    WHERE area_id = ${params.areaId}
      AND tanggal_awal <= ${params.tanggalShipment}::DATE
      AND tanggal_akhir >= ${params.tanggalShipment}::DATE
      AND (
        nik_kerja IS NULL
        OR nik_kerja = ${params.nikKerja}
      )
    ORDER BY
      CASE WHEN nik_kerja IS NULL THEN 1 ELSE 0 END,
      tanggal_awal DESC,
      kunci_id DESC
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function getRegularShipmentLocksInRange(params: {
  areaId: string;
  nikKerja: string;
  startDate: string;
  endDate: string;
}): Promise<ShipmentLockRow[]> {
  return query<ShipmentLockRow>`
    SELECT
      kunci_id,
      area_id,
      nik_kerja,
      tanggal_awal::TEXT AS tanggal_awal,
      tanggal_akhir::TEXT AS tanggal_akhir,
      keterangan_kunci
    FROM kunci_shipment
    WHERE area_id = ${params.areaId}
      AND tanggal_awal <= ${params.endDate}::DATE
      AND tanggal_akhir >= ${params.startDate}::DATE
      AND (
        nik_kerja IS NULL
        OR nik_kerja = ${params.nikKerja}
      )
    ORDER BY
      tanggal_awal ASC,
      tanggal_akhir ASC,
      CASE WHEN nik_kerja IS NULL THEN 1 ELSE 0 END,
      kunci_id ASC
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
      const currentIsAreaLock = current?.nik_kerja === null;
      const nextIsUserLock = lock.nik_kerja !== null;

      if (!current || (currentIsAreaLock && nextIsUserLock)) {
        map.set(date, {
          kunci_id: lock.kunci_id,
          area_id: lock.area_id,
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
