# Setra Connect via Apps Script Web App v1

Paket ini mengubah fitur `Hubungkan` agar tidak lagi copy Google Sheet memakai Google Service Account.

Alur baru:

```txt
Frontend Hubungkan
→ Next.js backend `/api/admin/spreadsheet/connect`
→ Apps Script Web App
→ Apps Script copy Master_Template sebagai akun Google owner
→ Backend simpan spreadsheet_id/spreadsheet_url ke database
```

Ini menghindari error:

```txt
The user's Drive storage quota has been exceeded.
```

Error itu muncul karena copy memakai Service Account, bukan akun Google Drive personal pemilik folder.

## File yang diganti/ditambah

```txt
src/app/api/admin/spreadsheet/connect/route.ts
src/lib/google-apps-script-connect.ts
appscript/06_ConnectWebApp.gs
```

`src/lib/google-service.ts` boleh dibiarkan. File itu tidak dipakai oleh route connect baru.

## ENV baru di `.env.local` dan Vercel

Tambahkan:

```env
GOOGLE_APPS_SCRIPT_CONNECT_URL="https://script.google.com/macros/s/xxxxx/exec"
GOOGLE_APPS_SCRIPT_CONNECT_SECRET="secret-yang-sama-dengan-appscript"
```

Tetap pakai:

```env
GOOGLE_SPREADSHEET_TEMPLATE_ID="18HCO7DkAPeVz73H4gg05xX7Lk4d6s2WmYooB6dBkxMI"
GOOGLE_DRIVE_FOLDER_ID="id-folder-output"
NEXT_PUBLIC_APP_URL="https://shipment-report-app.vercel.app"
SPREADSHEET_OWNER_EMAIL="email-kamu"
SPREADSHEET_SUPERADMIN_EMAILS=""
```

Untuk fitur connect via Apps Script, ini tidak wajib lagi:

```env
GOOGLE_CLIENT_EMAIL=""
GOOGLE_PRIVATE_KEY=""
GOOGLE_PROJECT_ID=""
```

Boleh tetap disimpan untuk kemungkinan integrasi Google API lain, tapi route connect baru tidak memakainya.

## Cara pasang Apps Script Web App

1. Buka Google Sheet `Master_Template`.
2. Buka `Extensions → Apps Script`.
3. Tambahkan file baru: `06_ConnectWebApp.gs`.
4. Paste isi file dari paket ini.
5. Jalankan sekali:

```js
setSetraConnectSecret("secret-yang-sama-dengan-env-vercel");
```

Opsional, bisa juga simpan template/folder di Script Properties:

```js
setSetraConnectTemplateId("18HCO7DkAPeVz73H4gg05xX7Lk4d6s2WmYooB6dBkxMI");
setSetraConnectOutputFolderId("id-folder-output");
```

Namun backend sudah mengirim `GOOGLE_SPREADSHEET_TEMPLATE_ID` dan `GOOGLE_DRIVE_FOLDER_ID`, jadi dua function opsional ini tidak wajib.

## Deploy Apps Script

Klik:

```txt
Deploy → New deployment → Web app
```

Setting:

```txt
Execute as: Me
Who has access: Anyone
```

Ambil Web App URL yang berakhiran `/exec`, lalu masukkan ke Vercel:

```env
GOOGLE_APPS_SCRIPT_CONNECT_URL="https://script.google.com/macros/s/xxxxx/exec"
```

Setelah env Vercel diubah, lakukan redeploy.

## Checklist sebelum klik Hubungkan

```txt
[ ] Apps Script Web App sudah deploy `/exec`
[ ] GOOGLE_APPS_SCRIPT_CONNECT_URL sudah masuk Vercel
[ ] GOOGLE_APPS_SCRIPT_CONNECT_SECRET sama dengan setSetraConnectSecret()
[ ] GOOGLE_SPREADSHEET_TEMPLATE_ID berisi ID Master_Template
[ ] GOOGLE_DRIVE_FOLDER_ID berisi folder output
[ ] NEXT_PUBLIC_APP_URL berisi URL production Vercel
[ ] Vercel sudah redeploy setelah env diubah
```

## Setelah replace file

Jalankan di lokal:

```bash
npm run typecheck
npm run lint
npm run build
```
