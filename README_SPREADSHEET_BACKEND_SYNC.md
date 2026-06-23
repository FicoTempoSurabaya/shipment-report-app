# SETRA Spreadsheet Backend Sync v1

Tambahan backend untuk sinkronisasi Google Spreadsheet <-> PostgreSQL.

## File baru

```txt
src/lib/spreadsheet-auth.ts
src/lib/spreadsheet-sync.ts
src/app/api/spreadsheet/users/push/route.ts
src/app/api/spreadsheet/users/pull/route.ts
src/app/api/spreadsheet/shipments/push/route.ts
src/app/api/spreadsheet/shipments/pull/route.ts
src/app/api/spreadsheet/locking/push/route.ts
src/app/api/spreadsheet/locking/pull/route.ts
src/app/api/spreadsheet/area/push/route.ts
src/app/api/spreadsheet/libur-kalender/push/route.ts
```

## Environment variables wajib

```env
SPREADSHEET_WEBHOOK_SECRET="ISI_SECRET_YANG_SAMA_DENGAN_SCRIPT_PROPERTIES"
SPREADSHEET_OWNER_EMAIL="email-owner@example.com"
SPREADSHEET_SUPERADMIN_EMAILS="superadmin1@example.com,superadmin2@example.com"
```

`SPREADSHEET_WEBHOOK_SECRET` harus sama dengan value yang diset di Apps Script:

```js
setSetraWebhookSecret("SECRET_YANG_SAMA")
```

## Header request dari Apps Script

Semua endpoint spreadsheet wajib menerima header:

```txt
X-Setra-Webhook-Secret
X-Setra-Spreadsheet-Id
X-Setra-Area-Id
X-Setra-User-Email
```

Backend memvalidasi:

1. Secret cocok dengan `SPREADSHEET_WEBHOOK_SECRET`.
2. `X-Setra-Area-Id` ada di tabel `area`.
3. `X-Setra-Spreadsheet-Id` cocok dengan `area.spreadsheet_id`.
4. Area masih aktif.

## Endpoint menu Setra

```txt
POST /api/spreadsheet/users/push
GET  /api/spreadsheet/users/pull
POST /api/spreadsheet/shipments/push
GET  /api/spreadsheet/shipments/pull
POST /api/spreadsheet/locking/push
GET  /api/spreadsheet/locking/pull
```

## Endpoint admin-only tanpa menu

```txt
POST /api/spreadsheet/area/push
POST /api/spreadsheet/libur-kalender/push
```

Endpoint admin-only mewajibkan `X-Setra-User-Email` cocok dengan `SPREADSHEET_OWNER_EMAIL` atau salah satu email di `SPREADSHEET_SUPERADMIN_EMAILS`.

## Catatan perilaku

- `users` push:
  - User baru wajib punya password.
  - User lama dengan password kosong berarti password tidak diubah.
  - `DELETE` tidak hard delete; user diset `is_active=false`.
  - `user_role` selalu `regular`.

- `shipments` push:
  - `area_id` selalu dari spreadsheet config/header, bukan input admin.
  - `regular` wajib punya `nik_kerja` valid atau `nama_lengkap` yang bisa resolve unik ke sheet/database users.
  - `freelance` wajib punya `nama_freelance`; `nik_kerja` diset null.
  - `shipment_code` harus 10 digit angka atau status non-aktif valid.
  - `jam_pulang >= jam_berangkat` divalidasi backend.
  - `terkirim <= jumlah_toko` divalidasi backend.
  - Jika `gagal > 0`, `alasan` wajib diisi.
  - Kolom spreadsheet `alasan` memakai teks biasa, bukan JSON mentah.
    Contoh: `Toko Tutup; Tidak Cukup Waktu; Lainnya: Jalan ditutup`.
  - Backend mengubah teks `alasan` dari spreadsheet menjadi `jsonb` untuk database,
    lalu saat pull dari database mengubah `jsonb` kembali menjadi teks biasa.
  - `DELETE` memerlukan `__shipment_id`.

- `locking` push:
  - `nama_lengkap` di-resolve menjadi `nik_kerja`.
  - Jika nama kosong dan `__nik_kerja` kosong, lock dianggap area-wide (`nik_kerja=null`).
  - `tanggal_akhir >= tanggal_awal` divalidasi backend.
  - `DELETE` memerlukan `__kunci_id`.

## Typecheck

Saya mencoba menjalankan:

```bash
npm run typecheck
```

Namun folder ekstrak tidak memiliki `node_modules`, sehingga error yang muncul adalah dependency missing (`next`, `react`, `zod`, `@neondatabase/serverless`, dll), bukan hasil typecheck valid terhadap kode baru.

Jalankan ulang di project lokal setelah dependencies tersedia:

```bash
npm install
npm run typecheck
npm run lint
```
