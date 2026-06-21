import { FAILURE_REASONS, SHIPMENT_STATUS, type ShipmentFailureReason, type ShipmentStatus } from "@/types/shipment";
import { USER_JABATAN, type UserJabatan } from "@/types/user";

export const SYNC_STATUS = {
  SYNCED: "SYNCED",
  ERROR: "ERROR",
  SKIPPED: "SKIPPED",
} as const;

export const SYNC_ACTION = {
  UPSERT: "UPSERT",
  DELETE: "DELETE",
  SKIP: "SKIP",
} as const;

export type SyncStatus = (typeof SYNC_STATUS)[keyof typeof SYNC_STATUS];
export type SyncAction = (typeof SYNC_ACTION)[keyof typeof SYNC_ACTION];

export type SpreadsheetRow = Record<string, unknown> & {
  __row_number?: unknown;
  __sync_action?: unknown;
};

export type PushResult = {
  row_number: number;
  status: SyncStatus;
  message: string;
  values?: Record<string, unknown>;
};

export type PushSummary = {
  ok: boolean;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  message: string;
  rows_total: number;
  rows_success: number;
  rows_failed: number;
  results: PushResult[];
};

const shipmentStatusSet = new Set<string>(SHIPMENT_STATUS);
const failureReasonSet = new Set<string>(FAILURE_REASONS);
const userJabatanSet = new Set<string>(USER_JABATAN);

export function buildPushSummary(params: {
  label: string;
  total: number;
  results: PushResult[];
}): PushSummary {
  const rowsFailed = params.results.filter((item) => item.status === SYNC_STATUS.ERROR).length;
  const rowsSuccess = params.results.filter((item) => item.status === SYNC_STATUS.SYNCED).length;
  const rowsSkipped = params.results.filter((item) => item.status === SYNC_STATUS.SKIPPED).length;
  const status = rowsFailed === 0 ? "SUCCESS" : rowsSuccess > 0 || rowsSkipped > 0 ? "PARTIAL" : "FAILED";

  return {
    ok: rowsFailed === 0,
    status,
    message:
      rowsFailed === 0
        ? `Sync ${params.label} berhasil`
        : `Sync ${params.label} selesai dengan ${rowsFailed} baris gagal`,
    rows_total: params.total,
    rows_success: rowsSuccess,
    rows_failed: rowsFailed,
    results: params.results,
  };
}

export function makeResult(params: {
  row: SpreadsheetRow;
  status: SyncStatus;
  message: string;
  values?: Record<string, unknown>;
}): PushResult {
  return {
    row_number: getRowNumber(params.row),
    status: params.status,
    message: params.message,
    values: params.values,
  };
}

export function getRowNumber(row: SpreadsheetRow): number {
  const value = Number(row.__row_number);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function getSyncAction(row: SpreadsheetRow): SyncAction {
  const value = toOptionalString(row.__sync_action)?.toUpperCase();

  if (value === SYNC_ACTION.DELETE || value === SYNC_ACTION.SKIP) {
    return value;
  }

  return SYNC_ACTION.UPSERT;
}

export function toOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

export function toRequiredString(value: unknown, label: string): string {
  const text = toOptionalString(value);

  if (!text) {
    throw new Error(`${label} wajib diisi`);
  }

  return text;
}

export function toBoolean(value: unknown, defaultValue = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const text = String(value ?? "").trim().toLowerCase();

  if (["true", "1", "yes", "y", "aktif"].includes(text)) {
    return true;
  }

  if (["false", "0", "no", "n", "nonaktif"].includes(text)) {
    return false;
  }

  return defaultValue;
}

export function toNonNegativeInteger(value: unknown, label: string): number {
  const number = Number(value ?? 0);

  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} harus angka bulat minimal 0`);
  }

  return number;
}

export function normalizeDate(value: unknown, label: string): string {
  const text = toRequiredString(value, label);
  const normalized = text.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${label} harus format YYYY-MM-DD`);
  }

  return normalized;
}

export function normalizeOptionalDate(value: unknown, label: string): string | null {
  const text = toOptionalString(value);

  if (!text) {
    return null;
  }

  return normalizeDate(text, label);
}

export function normalizeTime(value: unknown, label: string): string | null {
  const text = toOptionalString(value);

  if (!text) {
    return null;
  }

  const hhmm = text.match(/^(\d{2}:\d{2})/)?.[1] ?? null;

  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) {
    throw new Error(`${label} harus format HH:mm`);
  }

  const [hourRaw, minuteRaw] = hhmm.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`${label} tidak valid`);
  }

  return hhmm;
}

export function assertEndTimeAfterStartTime(params: {
  jamBerangkat: string | null;
  jamPulang: string | null;
}) {
  if (!params.jamBerangkat || !params.jamPulang) {
    return;
  }

  if (params.jamPulang < params.jamBerangkat) {
    throw new Error("jam_pulang harus lebih besar atau sama dengan jam_berangkat");
  }
}

export function normalizeJabatan(value: unknown): UserJabatan {
  const jabatan = toRequiredString(value, "jabatan");

  if (!userJabatanSet.has(jabatan)) {
    throw new Error(`jabatan tidak valid: ${jabatan}`);
  }

  return jabatan as UserJabatan;
}

export function normalizeStatusKerja(value: unknown): "regular" | "freelance" {
  const statusKerja = toRequiredString(value, "status_kerja").toLowerCase();

  if (statusKerja !== "regular" && statusKerja !== "freelance") {
    throw new Error("status_kerja harus regular atau freelance");
  }

  return statusKerja;
}

export function resolveStatusShipmentFromShipmentCode(value: unknown): {
  status_shipment: ShipmentStatus;
  shipment_code: string;
  shipment_code_type: "AKTIF" | "NON_AKTIF";
} {
  const shipmentCode = toRequiredString(value, "shipment_code");

  if (/^\d{10}$/.test(shipmentCode)) {
    return {
      status_shipment: "Aktif",
      shipment_code: shipmentCode,
      shipment_code_type: "AKTIF",
    };
  }

  if (shipmentStatusSet.has(shipmentCode) && shipmentCode !== "Aktif") {
    return {
      status_shipment: shipmentCode as ShipmentStatus,
      shipment_code: shipmentCode,
      shipment_code_type: "NON_AKTIF",
    };
  }

  throw new Error("shipment_code harus 10 digit angka atau status non-aktif yang valid");
}

export function normalizeFailureReasonsForDb(params: {
  gagal: number;
  alasan: unknown;
}): string | null {
  if (params.gagal <= 0) {
    return null;
  }

  const text = toRequiredString(params.alasan, "alasan");

  if (failureReasonSet.has(text)) {
    return JSON.stringify([{ reason: text }]);
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    const normalized = normalizeFailureReasonsArray(parsed);

    if (normalized.length > 0) {
      return JSON.stringify(normalized);
    }
  } catch {
    // Fallback ke Lainnya di bawah.
  }

  return JSON.stringify([{ reason: "Lainnya", note: text }]);
}

export function formatFailureReasonsForSheet(value: unknown): string {
  if (!value) {
    return "";
  }

  const normalized = normalizeFailureReasonsArray(value);

  if (normalized.length === 0) {
    return "";
  }

  return normalized
    .map((item) => (item.note ? `${item.reason}: ${item.note}` : item.reason))
    .join("; ");
}

function normalizeFailureReasonsArray(value: unknown): ShipmentFailureReason[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string" && failureReasonSet.has(item)) {
      return [{ reason: item as ShipmentFailureReason["reason"] }];
    }

    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as {
      reason?: unknown;
      note?: unknown;
    };
    const reason = toOptionalString(record.reason);

    if (!reason || !failureReasonSet.has(reason)) {
      return [];
    }

    const note = toOptionalString(record.note) ?? undefined;
    return note
      ? [{ reason: reason as ShipmentFailureReason["reason"], note }]
      : [{ reason: reason as ShipmentFailureReason["reason"] }];
  });
}

export function isBlankSpreadsheetRow(row: SpreadsheetRow, headers: string[]): boolean {
  return headers.every((header) => !toOptionalString(row[header]));
}

export function getDatabaseErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}
