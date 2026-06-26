/**
 * SETRA - Spreadsheet Database Sync
 * File: 00_Config.gs
 * Scope: konstanta global, struktur sheet, config, dan enum runtime.
 */

const SETRA = Object.freeze({
  MENU_NAME: 'Setra',
  TEMPLATE_VERSION: '1.2.0-db-sync',
  HEADER_ROW: 1,
  DATA_START_ROW: 2,
  MAX_BATCH_ROWS: 500,

  SHEETS: Object.freeze({
    CONFIG: '_config',
    SCHEMA: '_schema',
    SYNC_LOG: '_sync_log',
    AREA: 'area',
    USERS: 'users',
    SHIPMENTS: 'shipments',
    LOCKING: 'kunci_shipment',
    LIBUR_KALENDER: 'libur_kalender',
  }),

  CONFIG_KEYS: Object.freeze({
    TEMPLATE_VERSION: 'TEMPLATE_VERSION',
    AREA_ID: 'AREA_ID',
    AREA_CODE: 'AREA_CODE',
    AREA_NAME: 'AREA_NAME',
    TIMEZONE: 'TIMEZONE',
    API_BASE_URL: 'API_BASE_URL',
    SPREADSHEET_ID: 'SPREADSHEET_ID',
    SPREADSHEET_URL: 'SPREADSHEET_URL',
    OWNER_EMAIL: 'OWNER_EMAIL',
    SUPERADMIN_EMAILS: 'SUPERADMIN_EMAILS',
    WEBHOOK_SECRET: 'WEBHOOK_SECRET',
    SHIPMENTS_UPDATE_LAST_FETCH_AT: 'SHIPMENTS_UPDATE_LAST_FETCH_AT',
    SHIPMENTS_UPDATE_CURSOR: 'SHIPMENTS_UPDATE_CURSOR',
    SHIPMENTS_UPDATE_HAS_MORE: 'SHIPMENTS_UPDATE_HAS_MORE',
    SHIPMENTS_EXISTENCE_ROW_CURSOR: 'SHIPMENTS_EXISTENCE_ROW_CURSOR',
  }),

  SCRIPT_PROP_KEYS: Object.freeze({
    API_BASE_URL: 'SETRA_API_BASE_URL',
    WEBHOOK_SECRET: 'SETRA_WEBHOOK_SECRET',
  }),

  ENDPOINTS: Object.freeze({
    USERS_PUSH: '/api/spreadsheet/users/push',
    USERS_PULL: '/api/spreadsheet/users/pull',
    SHIPMENTS_PUSH: '/api/spreadsheet/shipments/push',
    SHIPMENTS_PULL: '/api/spreadsheet/shipments/pull',
    SHIPMENTS_BULK_DELETE: '/api/spreadsheet/shipments/bulk-delete',
    SHIPMENTS_EXISTENCE: '/api/spreadsheet/shipments/existence',
    LOCKING_PUSH: '/api/spreadsheet/locking/push',
    LOCKING_PULL: '/api/spreadsheet/locking/pull',
  }),

  SYNC_ACTION: Object.freeze({
    UPSERT: 'UPSERT',
    DELETE: 'DELETE',
    SKIP: 'SKIP',
  }),

  SYNC_STATUS: Object.freeze({
    PENDING: 'PENDING',
    SYNCED: 'SYNCED',
    ERROR: 'ERROR',
    SKIPPED: 'SKIPPED',
    CONFLICT: 'CONFLICT',
  }),

  STATUS_KERJA: Object.freeze(['regular', 'freelance']),
  AREA_TIMEZONES: Object.freeze(['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']),
  USER_JABATAN: Object.freeze(['Team Leader', 'Field Coordinator', 'Driver']),
  USER_ROLE: Object.freeze(['super_admin', 'admin', 'regular']),
  BOOLEAN_VALUES: Object.freeze(['TRUE', 'FALSE']),
  SHIPMENT_STATUS: Object.freeze([
    'Sakit',
    'Izin',
    'Alpha',
    'Cuti',
    'SO',
    'Service',
    'Loading Sore',
    'Libur Nasional',
    'Kirim Ulang',
    'Kiur Unit',
    'Standby',
    'OFF',
  ]),
  FAILURE_REASONS: Object.freeze([
    'Toko Tutup',
    'Dobel/Salah Order',
    'Tidak Cukup Waktu',
    'Ditolak Toko',
    'Lainnya',
  ]),

  BUSINESS_HEADERS: Object.freeze({
    USERS: Object.freeze(['nik_kerja', 'area_code', 'nama_lengkap', 'jabatan', 'username', 'password', 'is_active']),
    LOCKING: Object.freeze(['area_id', 'nama_lengkap', 'tanggal_awal', 'tanggal_akhir', 'keterangan_kunci']),
    SHIPMENTS: Object.freeze([
      'area_id',
      'status_kerja',
      'nik_kerja',
      'nama_lengkap',
      'nama_freelance',
      'tanggal_shipment',
      'shipment_code',
      'jam_berangkat',
      'jam_pulang',
      'jumlah_toko',
      'terkirim',
      'gagal',
      'alasan',
    ]),
  }),

  TECHNICAL_HEADERS: Object.freeze({
    AREA: Object.freeze(['area_id', 'spreadsheet_id', 'spreadsheet_url', 'created_at', 'updated_at', '__sync_action', '__sync_status', '__sync_message', '__last_synced_at', '__sync_snapshot']),
    USERS: Object.freeze(['user_id', 'area_id', '__original_nik_kerja', '__user_role', '__sync_action', '__sync_status', '__sync_message', '__last_synced_at', '__sync_snapshot']),
    LOCKING: Object.freeze(['area_id', '__kunci_id', '__user_id', '__nik_kerja', '__sync_action', '__sync_status', '__sync_message', '__last_synced_at', '__sync_snapshot']),
    SHIPMENTS: Object.freeze(['area_id', '__shipment_id', '__user_id', '__nik_kerja', '__is_freelance', '__shipment_code_type', '__sync_action', '__sync_status', '__sync_message', '__last_synced_at', '__sync_snapshot']),
    LIBUR_KALENDER: Object.freeze(['libur_id', '__sync_action', '__sync_status', '__sync_message', '__last_synced_at', '__sync_snapshot']),
  }),

  REQUIRED_HEADERS: Object.freeze({
    USERS: Object.freeze(['user_id', 'nik_kerja', 'area_id', 'area_code', 'nama_lengkap', 'jabatan', 'username', 'password', 'is_active', '__original_nik_kerja', '__user_role', '__sync_action', '__sync_status', '__sync_message', '__last_synced_at', '__sync_snapshot']),
    LOCKING: Object.freeze(['area_id', 'nama_lengkap', 'tanggal_awal', 'tanggal_akhir', 'keterangan_kunci', '__kunci_id', '__user_id', '__nik_kerja', '__sync_action', '__sync_status', '__sync_message', '__last_synced_at', '__sync_snapshot']),
    SHIPMENTS: Object.freeze(['no', 'Hapus', 'area_id', 'status_kerja', 'nik_kerja', 'nama_lengkap', 'nama_freelance', 'tanggal_shipment', 'shipment_code', 'jam_berangkat', 'jam_pulang', 'jumlah_toko', 'terkirim', 'gagal', 'alasan', '__shipment_id', '__user_id', '__nik_kerja', '__is_freelance', '__shipment_code_type', '__sync_action', '__sync_status', '__sync_message', '__last_synced_at', '__sync_snapshot']),
  }),
});

function setraGetSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function setraGetSheet_(sheetName) {
  const sheet = setraGetSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet tidak ditemukan: ' + sheetName);
  return sheet;
}

function setraGetScriptProperty_(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

function setraGetCurrentUserEmail_() {
  return String(Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
}

function setraGetConfigValue_(key, fallbackValue) {
  const sheet = setraGetSheet_(SETRA.SHEETS.CONFIG);
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i += 1) {
    const configKey = String(values[i][0] || '').trim();
    if (configKey === key) {
      const value = values[i][1];
      if (value === '' || value === null || value === undefined) return fallbackValue || '';
      return String(value).trim();
    }
  }

  return fallbackValue || '';
}

function setraSetConfigValue_(key, value, valueType, description) {
  const sheet = setraGetSheet_(SETRA.SHEETS.CONFIG);
  const values = sheet.getDataRange().getValues();
  const textValue = value === null || value === undefined ? '' : String(value);

  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][0] || '').trim() === key) {
      sheet.getRange(i + 1, 2).setValue(textValue);
      if (valueType) sheet.getRange(i + 1, 3).setValue(valueType);
      if (description) sheet.getRange(i + 1, 4).setValue(description);
      return;
    }
  }

  sheet.appendRow([key, textValue, valueType || 'text', description || 'Auto-created by Setra Apps Script']);
}

function setraGetApiBaseUrl_() {
  const prop = setraGetScriptProperty_(SETRA.SCRIPT_PROP_KEYS.API_BASE_URL);
  const raw = prop || setraGetConfigValue_(SETRA.CONFIG_KEYS.API_BASE_URL, '');
  const value = raw.replace(/\/+$/, '');
  if (!value) throw new Error('API_BASE_URL belum tersedia. Isi Script Property SETRA_API_BASE_URL atau hubungkan dari web app.');
  return value;
}

function setraGetWebhookSecret_() {
  const prop = setraGetScriptProperty_(SETRA.SCRIPT_PROP_KEYS.WEBHOOK_SECRET);
  const value = prop || setraGetConfigValue_(SETRA.CONFIG_KEYS.WEBHOOK_SECRET, '');
  if (!value) throw new Error('WEBHOOK_SECRET belum tersedia. Isi Script Property SETRA_WEBHOOK_SECRET atau hubungkan dari web app.');
  return value;
}

function setraGetAreaId_() {
  const areaId = setraGetConfigValue_(SETRA.CONFIG_KEYS.AREA_ID, '');
  if (!areaId) throw new Error('_config.AREA_ID masih kosong. Hubungkan spreadsheet ke area terlebih dahulu.');
  return areaId;
}

function setraGetAreaCode_() {
  return setraGetConfigValue_(SETRA.CONFIG_KEYS.AREA_CODE, '');
}

function setraGetTimezone_() {
  return setraGetConfigValue_(SETRA.CONFIG_KEYS.TIMEZONE, Session.getScriptTimeZone() || 'Asia/Jakarta') || 'Asia/Jakarta';
}

function setraGetSpreadsheetId_() {
  return setraGetSpreadsheet_().getId();
}

function setraGetSuperadminEmails_() {
  const text = setraGetConfigValue_(SETRA.CONFIG_KEYS.SUPERADMIN_EMAILS, '');
  return text.split(',').map(function (email) { return String(email || '').trim().toLowerCase(); }).filter(Boolean);
}

function setraIsSuperadmin_() {
  const email = setraGetCurrentUserEmail_();
  return Boolean(email && setraGetSuperadminEmails_().indexOf(email) >= 0);
}

function setraNowIso_() {
  return Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
}

function setraNormalizeText_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function setraNormalizeKey_(value) {
  return setraNormalizeText_(value).toLowerCase();
}
