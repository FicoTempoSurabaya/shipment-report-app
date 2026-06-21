import { query } from "@/lib/db";

export type IndonesiaHoliday = {
  tanggal_libur: string;
  keterangan_libur: string;
};

type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  start?: {
    date?: string;
    dateTime?: string;
  };
};

type GoogleCalendarEventsResponse = {
  items?: GoogleCalendarEvent[];
  error?: {
    code?: number;
    message?: string;
  };
};

type LiburKalenderRow = {
  libur_id: number;
  tanggal_libur: string;
  keterangan_libur: string;
};

const DEFAULT_INDONESIA_HOLIDAY_CALENDAR_ID =
  "id.indonesian.official#holiday@group.v.calendar.google.com";

function getGoogleCalendarApiKey(): string {
  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_CALENDAR_API_KEY belum diisi di .env.local");
  }

  return apiKey;
}

export function getIndonesiaHolidayCalendarId(): string {
  return (
    process.env.GOOGLE_INDONESIA_HOLIDAY_CALENDAR_ID ||
    DEFAULT_INDONESIA_HOLIDAY_CALENDAR_ID
  );
}

function assertValidYear(year: number): void {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Tahun libur harus berupa angka 2000 sampai 2100");
  }
}

function getGoogleCalendarRange(year: number): {
  timeMin: string;
  timeMax: string;
} {
  assertValidYear(year);

  return {
    timeMin: `${year}-01-01T00:00:00Z`,
    timeMax: `${year + 1}-01-01T00:00:00Z`,
  };
}

function getEventDate(event: GoogleCalendarEvent): string | null {
  const value = event.start?.date ?? event.start?.dateTime;

  if (!value) {
    return null;
  }

  const date = value.slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return date;
}

function normalizeHolidaySummary(summary: string): string {
  return summary.trim().replace(/\s+/g, " ");
}

function isExcludedHolidaySummary(summary: string): boolean {
  const normalizedSummary = normalizeHolidaySummary(summary).toLowerCase();

  return (
    normalizedSummary.includes("cuti") ||
    normalizedSummary.includes("bersama")
  );
}

function normalizeGoogleCalendarItems(
  events: GoogleCalendarEvent[] | undefined,
): IndonesiaHoliday[] {
  const holidayMap = new Map<string, Set<string>>();

  for (const event of events ?? []) {
    const date = getEventDate(event);
    const summary = event.summary?.trim();

    if (!date || !summary) {
      continue;
    }

    if (isExcludedHolidaySummary(summary)) {
      continue;
    }

    const current = holidayMap.get(date) ?? new Set<string>();
    current.add(normalizeHolidaySummary(summary));
    holidayMap.set(date, current);
  }

  return Array.from(holidayMap.entries())
    .map(([tanggal_libur, names]) => ({
      tanggal_libur,
      keterangan_libur: Array.from(names).join(" / "),
    }))
    .sort((a, b) => a.tanggal_libur.localeCompare(b.tanggal_libur));
}

export async function fetchIndonesiaHolidaysFromGoogleCalendar(
  year: number,
): Promise<IndonesiaHoliday[]> {
  const apiKey = getGoogleCalendarApiKey();
  const calendarId = getIndonesiaHolidayCalendarId();
  const { timeMin, timeMax } = getGoogleCalendarRange(year);

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events`,
  );

  url.searchParams.set("key", apiKey);
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "2500");

  const response = await fetch(url, {
    cache: "no-store",
  });

  const payload = (await response.json()) as GoogleCalendarEventsResponse;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ||
        `Gagal mengambil data libur dari Google Calendar. Status ${response.status}`,
    );
  }

  return normalizeGoogleCalendarItems(payload.items);
}

export async function upsertLiburKalender(
  holidays: IndonesiaHoliday[],
): Promise<LiburKalenderRow[]> {
  if (holidays.length === 0) {
    return [];
  }

  const dates = holidays.map((holiday) => holiday.tanggal_libur);
  const descriptions = holidays.map((holiday) => holiday.keterangan_libur);

  return query<LiburKalenderRow>`
    WITH incoming AS (
      SELECT *
      FROM UNNEST(${dates}::date[], ${descriptions}::text[])
        AS item(tanggal_libur, keterangan_libur)
    )
    INSERT INTO libur_kalender (
      tanggal_libur,
      keterangan_libur
    )
    SELECT
      tanggal_libur,
      keterangan_libur
    FROM incoming
    ON CONFLICT (tanggal_libur)
    DO UPDATE SET
      keterangan_libur = EXCLUDED.keterangan_libur
    RETURNING
      libur_id::INT AS libur_id,
      tanggal_libur::TEXT AS tanggal_libur,
      keterangan_libur
  `;
}

async function deleteExcludedLiburKalenderByYear(
  year: number,
): Promise<LiburKalenderRow[]> {
  assertValidYear(year);

  const startDate = `${year}-01-01`;
  const endDate = `${year + 1}-01-01`;

  return query<LiburKalenderRow>`
    DELETE FROM libur_kalender
    WHERE tanggal_libur >= ${startDate}::date
      AND tanggal_libur < ${endDate}::date
      AND (
        keterangan_libur ILIKE '%cuti%'
        OR keterangan_libur ILIKE '%bersama%'
      )
    RETURNING
      libur_id::INT AS libur_id,
      tanggal_libur::TEXT AS tanggal_libur,
      keterangan_libur
  `;
}

export async function syncIndonesiaHolidayCalendar(year: number): Promise<{
  calendar_id: string;
  fetched_count: number;
  synced_count: number;
  removed_excluded_count: number;
  holidays: LiburKalenderRow[];
}> {
  assertValidYear(year);

  const holidays = await fetchIndonesiaHolidaysFromGoogleCalendar(year);
  const removedExcludedHolidays = await deleteExcludedLiburKalenderByYear(year);
  const savedHolidays = await upsertLiburKalender(holidays);

  return {
    calendar_id: getIndonesiaHolidayCalendarId(),
    fetched_count: holidays.length,
    synced_count: savedHolidays.length,
    removed_excluded_count: removedExcludedHolidays.length,
    holidays: savedHolidays,
  };
}