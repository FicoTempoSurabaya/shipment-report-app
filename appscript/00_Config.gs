/**
 * SETRA - Shipment Report Spreadsheet Integration
 * File: 00_Config.gs
 * Scope: konfigurasi global, nama sheet, endpoint, dan helper config.
 */

const SETRA = Object.freeze({
  MENU_NAME: 'Setra',
  TEMPLATE_VERSION: '1.0.0',
  HEADER_ROW: 1,
  DATA_START_ROW: 2,
  MAX_DATA_ROWS: 5000,

  SHEETS: Object.freeze({
    CONFIG: '_config',
    DROPDOWNS: '_dropdowns',
    SCHEMA: '_schema',
    SYNC_LOG: '_sync_log',
    AREA: 'area',
    LIBUR_KALENDER: 'libur_kalender',
    USERS: 'users',
    SHIPMENTS: 'shipments',
    LOCKING: 'kunci_shipment',
  }),

  CONFIG_KEYS: Object.freeze({
    AREA_ID: 'AREA_ID',
    AREA_NAME: 'AREA_NAME',
    API_BASE_URL: 'API_BASE_URL',
    SPREADSHEET_ID: 'SPREADSHEET_ID',
    SPREADSHEET_URL: 'SPREADSHEET_URL',
    OWNER_EMAIL: 'OWNER_EMAIL',
    SUPERADMIN_EMAILS: 'SUPERADMIN_EMAILS',
  }),

  SCRIPT_PROP_KEYS: Object.freeze({
    WEBHOOK_SECRET: 'SETRA_WEBHOOK_SECRET',
  }),

  ENDPOINTS: Object.freeze({
    USERS_PUSH: '/api/spreadsheet/users/push',
    USERS_PULL: '/api/spreadsheet/users/pull',
    SHIPMENTS_PUSH: '/api/spreadsheet/shipments/push',
    SHIPMENTS_PULL: '/api/spreadsheet/shipments/pull',
    LOCKING_PUSH: '/api/spreadsheet/locking/push',
    LOCKING_PULL: '/api/spreadsheet/locking/pull',
    AREA_PUSH: '/api/spreadsheet/area/push',
    LIBUR_KALENDER_PUSH: '/api/spreadsheet/libur-kalender/push',
  }),

  MANAGED: Object.freeze({
    USERS: Object.freeze({
      key: 'USERS',
      label: 'Users',
      sheetName: 'users',
      pushPath: '/api/spreadsheet/users/push',
      pullPath: '/api/spreadsheet/users/pull',
      requiredHeaders: [
        'nik_kerja',
        'area_id',
        'nama_lengkap',
        'jabatan',
        'username',
        'password',
        'is_active',
        '__sync_action',
        '__sync_status',
        '__sync_message',
        '__last_synced_at',
      ],
      businessHeaders: ['nik_kerja', 'nama_lengkap', 'jabatan', 'username', 'password', 'is_active'],
    }),

    SHIPMENTS: Object.freeze({
      key: 'SHIPMENTS',
      label: 'Shipments',
      sheetName: 'shipments',
      pushPath: '/api/spreadsheet/shipments/push',
      pullPath: '/api/spreadsheet/shipments/pull',
      requiredHeaders: [
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
        '__shipment_id',
        '__is_freelance',
        '__shipment_code_type',
        '__sync_action',
        '__sync_status',
        '__sync_message',
        '__last_synced_at',
      ],
      businessHeaders: [
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
      ],
    }),

    LOCKING: Object.freeze({
      key: 'LOCKING',
      label: 'Locking',
      sheetName: 'kunci_shipment',
      pushPath: '/api/spreadsheet/locking/push',
      pullPath: '/api/spreadsheet/locking/pull',
      requiredHeaders: [
        'area_id',
        'nama_lengkap',
        'tanggal_awal',
        'tanggal_akhir',
        'keterangan_kunci',
        '__kunci_id',
        '__nik_kerja',
        '__sync_action',
        '__sync_status',
        '__sync_message',
        '__last_synced_at',
      ],
      businessHeaders: ['nama_lengkap', 'tanggal_awal', 'tanggal_akhir', 'keterangan_kunci'],
    }),
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
  }),
});

function setraGetSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function setraGetSheet_(sheetName) {
  const sheet = setraGetSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet tidak ditemukan: ' + sheetName);
  }
  return sheet;
}

function setraGetConfigValue_(key, fallbackValue) {
  const sheet = setraGetSheet_(SETRA.SHEETS.CONFIG);
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    const configKey = String(values[i][0] || '').trim();
    if (configKey === key) {
      const value = values[i][1];
      if (value === '' || value === null || value === undefined) {
        return fallbackValue || '';
      }
      return String(value).trim();
    }
  }

  return fallbackValue || '';
}

function setraSetConfigValue_(key, value) {
  const sheet = setraGetSheet_(SETRA.SHEETS.CONFIG);
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    const configKey = String(values[i][0] || '').trim();
    if (configKey === key) {
      sheet.getRange(i + 1, 2).setValue(value || '');
      return;
    }
  }

  sheet.appendRow([key, value || '', 'text', 'Auto-created by Setra Apps Script']);
}

function setraGetAreaId_() {
  const areaId = setraGetConfigValue_(SETRA.CONFIG_KEYS.AREA_ID, '');
  if (!areaId) {
    throw new Error('_config.AREA_ID masih kosong. Hubungkan spreadsheet ke area terlebih dahulu.');
  }
  return areaId;
}

function setraGetAreaName_() {
  return setraGetConfigValue_(SETRA.CONFIG_KEYS.AREA_NAME, '');
}

function setraGetApiBaseUrl_() {
  const baseUrl = setraGetConfigValue_(SETRA.CONFIG_KEYS.API_BASE_URL, '');
  if (!baseUrl) {
    throw new Error('_config.API_BASE_URL masih kosong. Isi URL backend web app terlebih dahulu.');
  }
  return baseUrl.replace(/\/$/, '');
}

function setraGetWebhookSecret_() {
  const secret = PropertiesService.getScriptProperties().getProperty(SETRA.SCRIPT_PROP_KEYS.WEBHOOK_SECRET);
  if (!secret) {
    throw new Error('Script Property SETRA_WEBHOOK_SECRET belum diset. Jalankan setSetraWebhookSecret("SECRET_ANDA") dari Apps Script editor.');
  }
  return secret;
}

function setraGetCurrentUserEmail_() {
  return Session.getActiveUser().getEmail() || '';
}

function setraGetSpreadsheetUrl_() {
  return setraGetSpreadsheet_().getUrl();
}

function setraGetSpreadsheetId_() {
  return setraGetSpreadsheet_().getId();
}

function setraNowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function setraNormalizeText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function setraNormalizeKey_(value) {
  return setraNormalizeText_(value).toLowerCase();
}
