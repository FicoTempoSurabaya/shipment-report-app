# Database Refactor Notes

Refactor ini menyesuaikan aplikasi ke skema database terbaru:

- `area.area_id` menjadi `BIGSERIAL` internal.
- `area.area_code` menjadi kode area user-facing.
- `users.user_id` menjadi primary key internal.
- `users.nik_kerja` tetap user-facing dan unique.
- `shipments.user_id` menggantikan relasi lama berbasis `nik_kerja`.
- `kunci_shipment.user_id` menggantikan relasi lama berbasis `nik_kerja`.
- `user_role` menggunakan `super_admin`, `admin`, `regular`.
- `jabatan` menggunakan `Team Leader`, `Field Coordinator`, `Driver`.
- `shipments.gagal` dihitung backend saat insert/update.
- `alasan` tetap disimpan sebagai `TEXT`.

## File penting yang diubah

- `sql/database.sql`
- `src/types/*`
- `src/lib/auth.ts`
- `src/proxy.ts`
- `src/lib/validation.ts`
- `src/lib/kunci-shipment.ts`
- `src/lib/spreadsheet-auth.ts`
- `src/lib/spreadsheet-sync.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/area/route.ts`
- `src/app/api/admin/*`
- `src/app/api/regular/*`
- `src/app/api/freelance/shipments/route.ts`
- `src/app/api/spreadsheet/*`
- halaman frontend admin, regular, login, freelance, dan kunci shipment

## Catatan migrasi data

Migrasi data lama ke schema baru tetap perlu dilakukan manual sesuai keputusan project.
Rekomendasi mapping:

- `area_id` lama -> `area.area_code`
- `area.area_id` baru -> auto `BIGSERIAL`
- `users.nik_kerja` lama tetap ke `users.nik_kerja`
- `shipments.nik_kerja` lama harus di-resolve ke `users.user_id`
- `kunci_shipment.nik_kerja` lama harus di-resolve ke `users.user_id`
- role lama `superadmin` -> `super_admin`
- jabatan lama `Team_Leader` -> `Team Leader`
- jabatan lama `Fico` -> `Field Coordinator`

## Verifikasi lokal

Syntax TypeScript sudah dicek menggunakan parser TypeScript via `transpileModule` dan tidak ada error syntax.
`npm run typecheck` belum bisa menjadi validasi penuh di sandbox karena folder `node_modules` tidak tersedia, sehingga module seperti `next`, `react`, dan `zod` tidak bisa di-resolve.
