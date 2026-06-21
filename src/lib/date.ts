const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type DateCardStatus = "holiday" | "sunday" | "locked" | "filled" | "empty";

export type DateRangeItem = {
  date: string;
  is_sunday: boolean;
  is_holiday: boolean;
  holiday_note: string | null;
};

function assertDateString(value: string, fieldName: string): void {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`${fieldName} harus format YYYY-MM-DD`);
  }
}

export function parseDateString(value: string): Date {
  assertDateString(value, "Tanggal");

  const [year, month, day] = value.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
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
  assertDateString(startDate, "Tanggal mulai");
  assertDateString(endDate, "Tanggal selesai");

  const start = parseDateString(startDate);
  const end = parseDateString(endDate);

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
    const date = holiday.tanggal_libur.slice(0, 10);
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