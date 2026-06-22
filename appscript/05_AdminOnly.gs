/**
 * SETRA - Shipment Report Spreadsheet Integration
 * File: 05_AdminOnly.gs
 * Scope: function manual untuk owner/superadmin. Tidak masuk menu spreadsheet.
 */

function setraSyncAreaAdminOnly() {
  setraAssertOwnerOrSuperadmin_();
  const sheetName = SETRA.SHEETS.AREA;
  const sheet = setraGetSheet_(sheetName);
  setraAssertHeaders_(sheet, ['area_id', 'nama_area', 'sla_area', 'is_active', '__sync_action', '__sync_status', '__sync_message']);

  const rows = setraReadRowsAsObjects_(sheetName, ['area_id', 'nama_area', 'sla_area', 'is_active']);
  const payload = Object.assign(setraBuildBasePayload_(sheetName, 'area_push'), { rows: rows });
  const response = setraPostJson_(SETRA.ENDPOINTS.AREA_PUSH, payload);
  setraApplyPushResults_(sheetName, setraGetResultsArrayFromResponse_(response));
  setraAppendSyncLog_(sheetName, 'area_push', 'sheet_to_db', rows.length, Number(response.rows_success || rows.length), Number(response.rows_failed || 0), response.status || 'SUCCESS', response.message || '');

  SpreadsheetApp.getUi().alert('Sync area selesai.');
}

function setraSyncLiburKalenderAdminOnly() {
  setraAssertOwnerOrSuperadmin_();
  const sheetName = SETRA.SHEETS.LIBUR_KALENDER;
  const sheet = setraGetSheet_(sheetName);
  setraAssertHeaders_(sheet, ['tanggal_libur', 'keterangan_libur', '__source', '__sync_action', '__sync_status', '__sync_message']);

  const rows = setraReadRowsAsObjects_(sheetName, ['tanggal_libur', 'keterangan_libur']);
  const payload = Object.assign(setraBuildBasePayload_(sheetName, 'libur_kalender_push'), { rows: rows });
  const response = setraPostJson_(SETRA.ENDPOINTS.LIBUR_KALENDER_PUSH, payload);
  setraApplyPushResults_(sheetName, setraGetResultsArrayFromResponse_(response));
  setraAppendSyncLog_(sheetName, 'libur_kalender_push', 'sheet_to_db', rows.length, Number(response.rows_success || rows.length), Number(response.rows_failed || 0), response.status || 'SUCCESS', response.message || '');

  SpreadsheetApp.getUi().alert('Sync libur_kalender selesai.');
}

function setraAssertOwnerOrSuperadmin_() {
  const email = setraNormalizeKey_(setraGetCurrentUserEmail_());
  const ownerEmail = setraNormalizeKey_(setraGetConfigValue_(SETRA.CONFIG_KEYS.OWNER_EMAIL, ''));
  const superadminRaw = setraGetConfigValue_(SETRA.CONFIG_KEYS.SUPERADMIN_EMAILS, '');
  const superadminEmails = superadminRaw
    .split(',')
    .map(function (item) { return setraNormalizeKey_(item); })
    .filter(Boolean);

  if (!email) {
    throw new Error('Email user tidak terbaca oleh Apps Script. Tidak bisa menjalankan admin-only function.');
  }

  if (email === ownerEmail || superadminEmails.indexOf(email) !== -1) {
    return true;
  }

  throw new Error('Akses ditolak. Function ini hanya untuk owner/superadmin. Email aktif: ' + email);
}

function setraSetupBasicVisibilityAdminOnly() {
  setraAssertOwnerOrSuperadmin_();

  const spreadsheet = setraGetSpreadsheet_();
  const technicalSheets = [
    SETRA.SHEETS.CONFIG,
    SETRA.SHEETS.DROPDOWNS,
    SETRA.SHEETS.SYNC_LOG,
  ];

  technicalSheets.forEach(function (sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (sheet) sheet.hideSheet();
  });

  setraHideKnownTechnicalColumns_(SETRA.SHEETS.USERS, ['area_id', '__original_nik_kerja', '__user_role', '__sync_action', '__sync_status', '__sync_message', '__last_synced_at', '__row_hash']);
  setraHideKnownTechnicalColumns_(SETRA.SHEETS.LOCKING, ['area_id', '__kunci_id', '__nik_kerja', '__sync_action', '__sync_status', '__sync_message', '__last_synced_at', '__row_hash']);
  setraHideKnownTechnicalColumns_(SETRA.SHEETS.SHIPMENTS, ['area_id', '__shipment_id', '__nik_kerja', '__is_freelance', '__shipment_code_type', '__sync_action', '__sync_status', '__sync_message', '__last_synced_at', '__row_hash']);

  SpreadsheetApp.getUi().alert('Visibility dasar selesai. Proteksi detail akan kita finalkan pada tahap protection setup.');
}

function setraHideKnownTechnicalColumns_(sheetName, headersToHide) {
  const sheet = setraGetSheet_(sheetName);
  const map = setraGetHeaderMap_(sheet);

  headersToHide.forEach(function (header) {
    if (map[header]) {
      sheet.hideColumns(map[header]);
    }
  });
}
