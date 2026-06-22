# SETRA Spreadsheet Connect + Sync Final v3

Paket ini menyempurnakan alur `Hubungkan` dan menu `Setra` agar tidak perlu lagi set `SETRA_WEBHOOK_SECRET` manual di setiap spreadsheet hasil copy.

## Masalah yang diselesaikan

Sebelumnya, spreadsheet hasil tombol `Hubungkan` bisa menampilkan error:

```txt
Script Property SETRA_WEBHOOK_SECRET belum diset
```

Penyebabnya: Script Properties di Apps Script `Master_Template` tidak otomatis menjadi Script Properties di spreadsheet hasil copy.

## Solusi final

1. Backend `/api/admin/spreadsheet/connect` memanggil Apps Script Web App.
2. Backend mengirim `SPREADSHEET_WEBHOOK_SECRET` sebagai `webhook_secret` ke Apps Script Connect.
3. Apps Script Connect copy `Master_Template`, isi `_config`, dan menulis key `WEBHOOK_SECRET` ke `_config` spreadsheet hasil copy.
4. Menu `Setra` membaca secret dengan urutan:
   - Script Property `SETRA_WEBHOOK_SECRET`, jika ada.
   - `_config.WEBHOOK_SECRET`, jika Script Property tidak ada.
5. Hasilnya: setiap spreadsheet hasil `Hubungkan` langsung bisa memakai menu `Setra > Users`, `Setra > Shipments`, dan `Setra > Locking` tanpa setup secret ulang.

## File backend yang diganti / ditambah

```txt
src/app/api/admin/spreadsheet/connect/route.ts
src/lib/google-apps-script-connect.ts
```

## File Apps Script final

```txt
appscript/00_Config.gs
appscript/01_Menu.gs
appscript/02_ApiClient.gs
appscript/03_SheetUtils.gs
appscript/04_SyncSetra.gs
appscript/05_AdminOnly.gs
appscript/06_ConnectWebApp.gs
```

Paste semua file Apps Script ini ke Apps Script project pada `Master_Template`.

## Script Properties yang tetap dipakai

Tetap pakai Script Properties, tapi hanya untuk Apps Script Web App Connect di `Master_Template`:

```txt
SETRA_CONNECT_SECRET
SETRA_TEMPLATE_SPREADSHEET_ID
SETRA_OUTPUT_FOLDER_ID
```

Nilainya:

```txt
SETRA_CONNECT_SECRET = sama dengan GOOGLE_APPS_SCRIPT_CONNECT_SECRET di Vercel/.env.local
SETRA_TEMPLATE_SPREADSHEET_ID = sama dengan GOOGLE_SPREADSHEET_TEMPLATE_ID
SETRA_OUTPUT_FOLDER_ID = sama dengan GOOGLE_DRIVE_FOLDER_ID
```

Tidak perlu lagi mengisi `SETRA_WEBHOOK_SECRET` manual pada spreadsheet hasil copy.

## Env backend / Vercel wajib

```env
NEXT_PUBLIC_APP_URL="https://domain-vercel-kamu.vercel.app"
SPREADSHEET_WEBHOOK_SECRET="secret-sync"
GOOGLE_APPS_SCRIPT_CONNECT_URL="https://script.google.com/macros/s/xxxxx/exec"
GOOGLE_APPS_SCRIPT_CONNECT_SECRET="secret-connect"
GOOGLE_SPREADSHEET_TEMPLATE_ID="18HCO7DkAPeVz73H4gg05xX7Lk4d6s2WmYooB6dBkxMI"
GOOGLE_DRIVE_FOLDER_ID="folder-output-id"
SPREADSHEET_OWNER_EMAIL="email-kamu"
SPREADSHEET_SUPERADMIN_EMAILS=""
```

`GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, dan `GOOGLE_PROJECT_ID` tidak dipakai untuk strategi connect via Apps Script Web App.

## Deploy minimal

1. Replace dua file backend.
2. Paste semua Apps Script final ke `Master_Template`.
3. Apps Script: `Deploy > Manage deployments > Edit > New version > Deploy`.
4. Vercel: redeploy sekali.
5. Untuk area yang sudah sempat dibuat dengan script lama, buat ulang koneksinya atau update Apps Script di spreadsheet area secara manual.

## Catatan template

Struktur `shipments` final yang didukung kode ini:

```txt
area_id, status_kerja, nik_kerja, nama_lengkap, nama_freelance,
tanggal_shipment, shipment_code, jam_berangkat, jam_pulang,
jumlah_toko, terkirim, gagal, alasan,
__shipment_id, __is_freelance, __shipment_code_type,
__sync_action, __sync_status, __sync_message,
__last_synced_at, __row_hash
```

Kolom `nik_kerja` visible untuk kebutuhan laporan admin, tapi tetap otomatis diisi dari `nama_lengkap` pada status `regular`.

## Kenapa tidak hardcode secret di kode?

Secret sync otomatis ditanam ke `_config` saat connect. Ini lebih rapi daripada hardcode, karena:

- Tidak perlu edit kode setiap ganti secret.
- Tidak perlu set property di setiap spreadsheet area.
- Tetap satu kali setup di `Master_Template` untuk connect secret.

Kalau tetap ingin hardcode penuh, bisa, tapi tidak saya sarankan karena setiap rotasi secret harus edit kode Apps Script dan redeploy ulang.
