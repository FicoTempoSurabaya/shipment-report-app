import {
  FAILURE_REASONS,
  SHIPMENT_STATUS,
  type FailureReason,
  type ShipmentFailureReason,
  type ShipmentStatus,
} from "@/types/shipment";

export const ACTIVE_SHIPMENT_STATUS = "Aktif" satisfies ShipmentStatus;

const shipmentStatusSet = new Set<string>(SHIPMENT_STATUS);
const failureReasonSet = new Set<string>(FAILURE_REASONS);

export function isShipmentStatus(value: unknown): value is ShipmentStatus {
  return typeof value === "string" && shipmentStatusSet.has(value);
}

export function isFailureReason(value: unknown): value is FailureReason {
  return typeof value === "string" && failureReasonSet.has(value);
}

export function getShipmentStatusFromCode(
  shipmentCode: string | null | undefined,
): ShipmentStatus {
  if (!shipmentCode) {
    return ACTIVE_SHIPMENT_STATUS;
  }

  if (/^\d{10}$/.test(shipmentCode)) {
    return ACTIVE_SHIPMENT_STATUS;
  }

  if (isShipmentStatus(shipmentCode)) {
    return shipmentCode;
  }

  return ACTIVE_SHIPMENT_STATUS;
}

export function resolveShipmentCode(params: {
  status_shipment: ShipmentStatus;
  shipment_code?: string | null;
}) {
  if (params.status_shipment !== ACTIVE_SHIPMENT_STATUS) {
    return params.status_shipment;
  }

  const shipmentCode = params.shipment_code?.trim() ?? "";

  if (!/^\d{10}$/.test(shipmentCode)) {
    throw new Error("Kode shipment wajib 10 digit angka jika status Aktif");
  }

  return shipmentCode;
}

export function normalizeFailureReason(
  item: unknown,
): ShipmentFailureReason | null {
  if (isFailureReason(item)) {
    return { reason: item };
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const record = item as {
    reason?: unknown;
    note?: unknown;
  };

  if (!isFailureReason(record.reason)) {
    return null;
  }

  const note =
    typeof record.note === "string" && record.note.trim()
      ? record.note.trim()
      : undefined;

  return note
    ? { reason: record.reason, note }
    : { reason: record.reason };
}

export function parseShipmentFailureReasons(
  value: unknown,
): ShipmentFailureReason[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeFailureReason(item))
      .filter((item): item is ShipmentFailureReason => Boolean(item));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    if (isFailureReason(trimmed)) {
      return [{ reason: trimmed }];
    }

    try {
      return parseShipmentFailureReasons(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }

  return [];
}

export function resolveShipmentFailureReasonsForDb(params: {
  jumlah_toko: number;
  terkirim: number;
  alasan?: ShipmentFailureReason[] | null;
}) {
  const gagal = params.jumlah_toko - params.terkirim;

  if (gagal <= 0) {
    return null;
  }

  const normalizedAlasan = parseShipmentFailureReasons(params.alasan ?? []);
  return JSON.stringify(normalizedAlasan);
}
