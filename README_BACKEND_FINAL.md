# Backend Final - Spreadsheet Sync Setra

Paket ini berisi kode backend final untuk integrasi Google Spreadsheet `Master_Template_FINAL.xlsx`.

Perubahan utama:
- `alasan` shipment diproses sebagai teks biasa, bukan JSON wajib.
- Endpoint shipments pull mendukung incremental fetch: `updated_after`, `cursor`, `limit`.
- Endpoint shipments push mengembalikan `__shipment_id`, `__row_hash`, `__last_synced_at`, dan status sync.
- Endpoint baru `POST/DELETE /api/spreadsheet/shipments/bulk-delete` untuk hard delete permanen.
- Bulk delete memvalidasi area spreadsheet dan kunci shipment sebelum menghapus data.
- Migration SQL tersedia di `sql/20260623_shipments_alasan_text_incremental_sync.sql`.

Urutan pakai:
1. Jalankan migration SQL jika database masih memakai `alasan jsonb`.
2. Deploy backend.
3. Pasang Apps Script final ke spreadsheet.
4. Jalankan menu `Setra > Shipments > fetching` untuk sinkronisasi awal.
