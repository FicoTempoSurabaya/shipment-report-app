/**
 * SETRA - Spreadsheet Database Sync
 * File: 04_CoreSync.gs
 * Scope: setup runtime, Users Checking, dan Date Locking.
 */

function setraSetupRuntime_() {
  setraAutoFillConfig_();
  setraProtectAreaSheet_();
  setraHideTechnicalColumns_(SETRA.SHEETS.AREA, SETRA.TECHNICAL_HEADERS.AREA);
  setraHideTechnicalColumns_(SETRA.SHEETS.USERS, SETRA.TECHNICAL_HEADERS.USERS);
  setraHideTechnicalColumns_(SETRA.SHEETS.LOCKING, SETRA.TECHNICAL_HEADERS.LOCKING);
  setraHideTechnicalColumns_(SETRA.SHEETS.SHIPMENTS, SETRA.TECHNICAL_HEADERS.SHIPMENTS);
  setraHideTechnicalColumns_(SETRA.SHEETS.LIBUR_KALENDER, SETRA.TECHNICAL_HEADERS.LIBUR_KALENDER);
  setraPrepareShipmentsRuntime_();
}

function setraAutoFillConfig_() {
  const ss = setraGetSpreadsheet_();
  setraSetConfigValue_(SETRA.CONFIG_KEYS.SPREADSHEET_ID, ss.getId(), 'text', 'Otomatis dari file spreadsheet aktif.');
  setraSetConfigValue_(SETRA.CONFIG_KEYS.SPREADSHEET_URL, ss.getUrl(), 'url', 'Otomatis dari file spreadsheet aktif.');

  const currentEmail = setraGetCurrentUserEmail_();
  if (currentEmail && !setraGetConfigValue_(SETRA.CONFIG_KEYS.OWNER_EMAIL, '')) {
    setraSetConfigValue_(SETRA.CONFIG_KEYS.OWNER_EMAIL, currentEmail, 'email', 'Otomatis dari user yang membuka/menjalankan script pertama kali.');
  }

  const propApiBaseUrl = setraGetScriptProperty_(SETRA.SCRIPT_PROP_KEYS.API_BASE_URL);
  if (propApiBaseUrl) setraSetConfigValue_(SETRA.CONFIG_KEYS.API_BASE_URL, propApiBaseUrl.replace(/\/+$/, ''), 'url', 'Otomatis dari Script Property SETRA_API_BASE_URL.');

  const propWebhookSecret = setraGetScriptProperty_(SETRA.SCRIPT_PROP_KEYS.WEBHOOK_SECRET);
  if (propWebhookSecret) setraSetConfigValue_(SETRA.CONFIG_KEYS.WEBHOOK_SECRET, propWebhookSecret, 'secret', 'Otomatis dari Script Property SETRA_WEBHOOK_SECRET.');

  if (!setraGetConfigValue_(SETRA.CONFIG_KEYS.TIMEZONE, '')) {
    setraSetConfigValue_(SETRA.CONFIG_KEYS.TIMEZONE, ss.getSpreadsheetTimeZone() || 'Asia/Jakarta', 'enum', 'Timezone spreadsheet.');
  }

  if (!setraGetConfigValue_(SETRA.CONFIG_KEYS.SHIPMENTS_UPDATE_HAS_MORE, '')) {
    setraSetConfigValue_(SETRA.CONFIG_KEYS.SHIPMENTS_UPDATE_HAS_MORE, 'FALSE', 'boolean', 'Status paging menu Shipments > Updating.');
  }

  if (!setraGetConfigValue_(SETRA.CONFIG_KEYS.SHIPMENTS_EXISTENCE_ROW_CURSOR, '')) {
    setraSetConfigValue_(SETRA.CONFIG_KEYS.SHIPMENTS_EXISTENCE_ROW_CURSOR, String(SETRA.DATA_START_ROW), 'integer', 'Cursor cek shipment_id yang sudah hilang dari database.');
  }
}

function setraUsersChecking() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    SpreadsheetApp.getUi().alert('Setra sedang menjalankan proses lain. Coba lagi setelah proses sebelumnya selesai.');
    return;
  }

  try {
    const sheetName = SETRA.SHEETS.USERS;
    const sheet = setraGetSheet_(sheetName);
    setraAssertHeaders_(sheet, SETRA.REQUIRED_HEADERS.USERS);
    setraMarkDirtyRowsForSheet_(sheetName, SETRA.BUSINESS_HEADERS.USERS);

    const pushRows = setraReadRowsAsObjects_(sheetName, SETRA.BUSINESS_HEADERS.USERS, {
      pendingOnly: true,
      limit: SETRA.MAX_BATCH_ROWS,
    });

    let pushSuccess = 0;
    let pushFailed = 0;

    if (pushRows.length > 0) {
      const pushResponse = setraPostJson_(SETRA.ENDPOINTS.USERS_PUSH, Object.assign(setraBuildBasePayload_(sheetName, 'users_checking_push'), { rows: pushRows }));
      const results = Array.isArray(pushResponse.results) ? pushResponse.results : [];
      setraApplyPushResults_(sheetName, results, SETRA.BUSINESS_HEADERS.USERS);
      pushSuccess = Number(pushResponse.rows_success || 0);
      pushFailed = Number(pushResponse.rows_failed || 0);
      setraAppendSyncLog_(sheetName, 'push', 'sheet_to_db', pushRows.length, pushSuccess, pushFailed, pushResponse.status || 'SUCCESS', pushResponse.message || '');

      if (pushFailed > 0) {
        setraShowResultDialog_('Users Checking', [
          ['Data dikirim', pushRows.length],
          ['Berhasil', pushSuccess],
          ['Gagal', pushFailed],
        ], 'Sebagian data users gagal dikirim. Cek kolom teknis __sync_message.');
        return;
      }
    }

    const pullResponse = setraGetJson_(SETRA.ENDPOINTS.USERS_PULL, { area_id: setraGetAreaId_(), spreadsheet_id: setraGetSpreadsheetId_() });
    const pulledRows = Array.isArray(pullResponse.rows) ? pullResponse.rows : [];
    setraClearAndWriteObjects_(sheetName, pulledRows, SETRA.REQUIRED_HEADERS.USERS, SETRA.BUSINESS_HEADERS.USERS);
    setraHideTechnicalColumns_(sheetName, SETRA.TECHNICAL_HEADERS.USERS);
    setraAppendSyncLog_(sheetName, 'pull', 'db_to_sheet', pulledRows.length, pulledRows.length, 0, 'SUCCESS', pullResponse.message || '');

    setraShowResultDialog_('Users Checking', [
      ['Push pending ke database', pushRows.length],
      ['Push berhasil', pushSuccess],
      ['Data users dari database', pulledRows.length],
    ], 'Users Checking selesai. Data spreadsheet dan database sudah disinkronkan.');
  } catch (error) {
    setraAppendSyncLog_(SETRA.SHEETS.USERS, 'sync', 'two_way', 0, 0, 1, 'FAILED', error.message || String(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function setraDateLocking() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    SpreadsheetApp.getUi().alert('Setra sedang menjalankan proses lain. Coba lagi setelah proses sebelumnya selesai.');
    return;
  }

  try {
    const sheetName = SETRA.SHEETS.LOCKING;
    const sheet = setraGetSheet_(sheetName);
    setraAssertHeaders_(sheet, SETRA.REQUIRED_HEADERS.LOCKING);
    setraHydrateLockingRows_();
    setraMarkDirtyRowsForSheet_(sheetName, SETRA.BUSINESS_HEADERS.LOCKING);

    const pushRows = setraReadRowsAsObjects_(sheetName, SETRA.BUSINESS_HEADERS.LOCKING, {
      pendingOnly: true,
      limit: SETRA.MAX_BATCH_ROWS,
    });

    let pushSuccess = 0;
    let pushFailed = 0;

    if (pushRows.length > 0) {
      const pushResponse = setraPostJson_(SETRA.ENDPOINTS.LOCKING_PUSH, Object.assign(setraBuildBasePayload_(sheetName, 'date_locking_push'), { rows: pushRows }));
      const results = Array.isArray(pushResponse.results) ? pushResponse.results : [];
      setraApplyPushResults_(sheetName, results, SETRA.BUSINESS_HEADERS.LOCKING);
      pushSuccess = Number(pushResponse.rows_success || 0);
      pushFailed = Number(pushResponse.rows_failed || 0);
      setraAppendSyncLog_(sheetName, 'push', 'sheet_to_db', pushRows.length, pushSuccess, pushFailed, pushResponse.status || 'SUCCESS', pushResponse.message || '');

      if (pushFailed > 0) {
        setraShowResultDialog_('Date Locking', [
          ['Data dikirim', pushRows.length],
          ['Berhasil', pushSuccess],
          ['Gagal', pushFailed],
        ], 'Sebagian data locking gagal dikirim. Cek kolom teknis __sync_message.');
        return;
      }
    }

    const pullResponse = setraGetJson_(SETRA.ENDPOINTS.LOCKING_PULL, { area_id: setraGetAreaId_(), spreadsheet_id: setraGetSpreadsheetId_() });
    const pulledRows = Array.isArray(pullResponse.rows) ? pullResponse.rows : [];
    setraClearAndWriteObjects_(sheetName, pulledRows, SETRA.REQUIRED_HEADERS.LOCKING, SETRA.BUSINESS_HEADERS.LOCKING);
    setraHideTechnicalColumns_(sheetName, SETRA.TECHNICAL_HEADERS.LOCKING);
    setraAppendSyncLog_(sheetName, 'pull', 'db_to_sheet', pulledRows.length, pulledRows.length, 0, 'SUCCESS', pullResponse.message || '');

    setraShowResultDialog_('Date Locking', [
      ['Push pending ke database', pushRows.length],
      ['Push berhasil', pushSuccess],
      ['Data locking dari database', pulledRows.length],
    ], 'Date Locking selesai. Kunci/buka tanggal sudah sinkron database dan spreadsheet.');
  } catch (error) {
    setraAppendSyncLog_(SETRA.SHEETS.LOCKING, 'sync', 'two_way', 0, 0, 1, 'FAILED', error.message || String(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function setraMarkDirtyRowsForSheet_(sheetName, businessHeaders) {
  const sheet = setraGetSheet_(sheetName);
  const headers = setraGetHeaders_(sheet);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);

  if (lastRow < SETRA.DATA_START_ROW || !map.__sync_snapshot || !map.__sync_action || !map.__sync_status) return;

  const rowCount = lastRow - SETRA.DATA_START_ROW + 1;
  const values = sheet.getRange(SETRA.DATA_START_ROW, 1, rowCount, headers.length).getValues();
  const actionValues = [];
  const statusValues = [];
  const messageValues = map.__sync_message ? [] : null;
  let changed = false;

  values.forEach(function (rowValues) {
    const obj = {};
    headers.forEach(function (header, idx) { if (header) obj[header] = rowValues[idx]; });
    const isBlank = setraIsBlankBusinessRow_(obj, businessHeaders);
    const oldSnapshot = setraNormalizeText_(rowValues[map.__sync_snapshot - 1]);
    const newSnapshot = setraBuildSnapshot_(obj, businessHeaders);
    const oldAction = setraNormalizeText_(rowValues[map.__sync_action - 1]);
    const oldStatus = setraNormalizeText_(rowValues[map.__sync_status - 1]);

    let nextAction = oldAction;
    let nextStatus = oldStatus;
    let nextMessage = messageValues ? rowValues[map.__sync_message - 1] : '';

    if (isBlank) {
      nextAction = '';
      nextStatus = '';
      nextMessage = '';
    } else if (!oldSnapshot || newSnapshot !== oldSnapshot) {
      if (oldAction !== SETRA.SYNC_ACTION.DELETE) nextAction = SETRA.SYNC_ACTION.UPSERT;
      nextStatus = SETRA.SYNC_STATUS.PENDING;
      nextMessage = 'Data berubah menunggu sync';
    } else if (!oldAction || !oldStatus) {
      nextAction = SETRA.SYNC_ACTION.SKIP;
      nextStatus = SETRA.SYNC_STATUS.SYNCED;
    }

    actionValues.push([nextAction]);
    statusValues.push([nextStatus]);
    if (messageValues) messageValues.push([nextMessage]);
    if (nextAction !== oldAction || nextStatus !== oldStatus) changed = true;
  });

  if (changed) {
    sheet.getRange(SETRA.DATA_START_ROW, map.__sync_action, rowCount, 1).setValues(actionValues);
    sheet.getRange(SETRA.DATA_START_ROW, map.__sync_status, rowCount, 1).setValues(statusValues);
    if (messageValues && map.__sync_message) sheet.getRange(SETRA.DATA_START_ROW, map.__sync_message, rowCount, 1).setValues(messageValues);
  }
}

function setraHydrateLockingRows_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.LOCKING);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);
  if (lastRow < SETRA.DATA_START_ROW) return;

  const rowCount = lastRow - SETRA.DATA_START_ROW + 1;
  if (map.area_id) sheet.getRange(SETRA.DATA_START_ROW, map.area_id, rowCount, 1).setValue(setraGetAreaId_());
}
