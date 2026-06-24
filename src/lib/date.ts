const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type DateCardStatus = "holiday" | "sunday" | "locked" | "filled" | "empty";

export type DateRangeItem = {
  date: string;
  is_sunday: boolean;
  is_holiday: boolean;
  holiday_note: string | null;
};

function buildValidDateOnly(year: number, month: number, day: number, fieldName: string): string {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} tidak valid`);
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeDateOnlyInput(value: unknown, fieldName = "Tanggal"): string {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} wajib diisi`);
  }

  const isoDate = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);

  if (isoDate) {
    return buildValidDateOnly(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]), fieldName);
  }

  const idDate = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

  if (idDate) {
    return buildValidDateOnly(Number(idDate[3]), Number(idDate[2]), Number(idDate[1]), fieldName);
  }

  throw new Error(`${fieldName} harus format YYYY-MM-DD atau DD/MM/YYYY`);
}

function assertDateString(value: string, fieldName: string): void {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`${fieldName} harus format YYYY-MM-DD`);
  }
}

export function parseDateString(value: string): Date {
  const normalized = normalizeDateOnlyInput(value, "Tanggal");
  assertDateString(normalized, "Tanggal");

  const [year, month, day] = normalized.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}


export function getLocalTodayDateOnly(): string {
  const now = new Date();

  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function formatDateOnlyId(dateString: string): string {
  const normalized = normalizeDateOnlyInput(dateString, "Tanggal");
  const [year, month, day] = normalized.split("-");

  return `${day}/${month}/${year}`;
}

export function isSunday(dateString: string): boolean {
  return parseDateString(dateString).getUTCDay() === 0;
}

export function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);

  return nextDate;
}

export function getInclusiveDateRange(startDate: string, endDate: string): string[] {
  const normalizedStartDate = normalizeDateOnlyInput(startDate, "Tanggal mulai");
  const normalizedEndDate = normalizeDateOnlyInput(endDate, "Tanggal selesai");
  assertDateString(normalizedStartDate, "Tanggal mulai");
  assertDateString(normalizedEndDate, "Tanggal selesai");

  const start = parseDateString(normalizedStartDate);
  const end = parseDateString(normalizedEndDate);

  if (start.getTime() > end.getTime()) {
    throw new Error("Tanggal mulai tidak boleh lebih besar dari tanggal selesai");
  }

  const dates: string[] = [];
  let cursor = start;

  while (cursor.getTime() <= end.getTime()) {
    dates.push(formatDateString(cursor));
    cursor = addDays(cursor, 1);
  }

  return dates;
}

export function buildHolidayMap(
  holidays: Array<{
    tanggal_libur: string;
    keterangan_libur: string;
  }>,
): Map<string, string> {
  const map = new Map<string, string>();

  for (const holiday of holidays) {
    const date = normalizeDateOnlyInput(holiday.tanggal_libur, "tanggal_libur");
    map.set(date, holiday.keterangan_libur);
  }

  return map;
}

export function buildDateRangeItems(
  startDate: string,
  endDate: string,
  holidays: Array<{
    tanggal_libur: string;
    keterangan_libur: string;
  }>,
): DateRangeItem[] {
  const dateRange = getInclusiveDateRange(startDate, endDate);
  const holidayMap = buildHolidayMap(holidays);

  return dateRange.map((date) => {
    const holidayNote = holidayMap.get(date) ?? null;

    return {
      date,
      is_sunday: isSunday(date),
      is_holiday: Boolean(holidayNote),
      holiday_note: holidayNote,
    };
  });
}

export function countWorkingDays(items: DateRangeItem[]): number {
  return items.filter((item) => !item.is_sunday && !item.is_holiday).length;
}
