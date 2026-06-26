export const AREA_TIMEZONE = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
] as const;

export type AreaTimezone = (typeof AREA_TIMEZONE)[number];

export type Area = {
  area_id: string;
  area_code: string;
  nama_area: string;
  sla_area: number;
  spreadsheet_id: string | null;
  spreadsheet_url: string | null;
  area_timezone: AreaTimezone;
  is_active: boolean;
};
