export const SHIPMENT_STATUS = [
  "Aktif",
  "Sakit",
  "Izin",
  "Alpha",
  "Cuti",
  "SO",
  "Service",
  "Loading Sore",
  "Libur Nasional",
  "Kirim Ulang",
  "Kiur Unit",
  "Standby",
] as const;

export const FAILURE_REASONS = [
  "Toko Tutup",
  "Dobel/Salah Order",
  "Tidak Cukup Waktu",
  "Ditolak Toko",
  "Lainnya",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUS)[number];
export type FailureReason = (typeof FAILURE_REASONS)[number];

export type ShipmentFailureReason = {
  reason: FailureReason;
  note?: string;
};

export type Shipment = {
  shipment_id: number;
  area_id: string;
  nik_kerja: string | null;
  is_freelance: boolean;
  nama_freelance: string | null;
  tanggal_shipment: string;
  status_shipment: ShipmentStatus;
  shipment_code: string | null;
  jam_berangkat: string | null;
  jam_pulang: string | null;
  jumlah_toko: number;
  terkirim: number;
  gagal: number;
  alasan: ShipmentFailureReason[];
};