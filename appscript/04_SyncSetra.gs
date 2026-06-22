/**
 * SETRA - Shipment Report Spreadsheet Integration
 * File: 04_SyncSetra.gs
 * Scope: sync utama untuk menu Setra: Users, Shipments, Locking.
 */

function setraSyncManagedSheet_(managedKey) {
  const cfg = SETRA.MANAGED[managedKey];
  if (!cfg) {
    throw new Error('Managed sheet tidak dikenal: ' + managedKey);
  }

  const ui = SpreadsheetApp.getUi();
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(30000)) {
    ui.alert('Setra sedang menjalankan sync lain. Coba lagi setelah proses sebelumnya selesai.');
    return;
  }

  try {
    setraGetSpreadsheet_().toast('Setra: sync ' + cfg.label + ' dimulai...', 'Setra', 5);

    const sheet = setraGetSheet_(cfg.sheetName);
    setraAssertHeaders_(sheet, cfg.requiredHeaders);
    setraHydrateSheetBeforePush_(cfg.key);

    const rows = setraReadRowsAsObjects_(cfg.sheetName, cfg.businessHeaders);
    const pushPayload = Object.assign(setraBuildBasePayload_(cfg.sheetName, 'push'), {
      rows: rows,
    });

    const pushResponse = setraPostJson_(cfg.pushPath, pushPayload);
    const pushResults = setraGetResultsArrayFromResponse_(pushResponse);
    setraApplyPushResults_(cfg.sheetName, pushResults);

    const pushStatus = String(pushResponse.status || pushResponse.sync_status || 'SUCCESS').toUpperCase();
    const rowsFailed = Number(pushResponse.rows_failed || pushResponse.rowsFailed || 0);
    const rowsSuccess = Number(pushResponse.rows_success || pushResponse.rowsSuccess || rows.length - rowsFailed);

    setraAppendSyncLog_(cfg.sheetName, 'push', 'sheet_to_db', rows.length, rowsSuccess, rowsFailed, pushStatus, pushResponse.message || '');

    if (pushStatus === 'FAILED' || pushStatus === 'PARTIAL' || rowsFailed > 0) {
      setraGetSpreadsheet_().toast('Setra: sync ' + cfg.label + ' gagal/parsial. Cek kolom __sync_message.', 'Setra', 8);
      ui.alert('Sync ' + cfg.label + ' gagal atau parsial. Cek kolom __sync_message pada sheet ' + cfg.sheetName + '.');
      return;
    }

    const pullResponse = setraGetJson_(cfg.pullPath, {
      area_id: setraGetAreaId_(),
      spreadsheet_id: setraGetSpreadsheetId_(),
    });

    const pulledRows = setraGetRowsArrayFromResponse_(pullResponse);
    setraWriteObjectsToSheet_(cfg.sheetName, pulledRows);
    setraHydrateSheetAfterPull_(cfg.key);
    setraFormatManagedSheet_(cfg.sheetName);

    setraAppendSyncLog_(cfg.sheetName, 'pull', 'db_to_sheet', pulledRows.length, pulledRows.length, 0, 'SUCCESS', pullResponse.message || '');

    setraGetSpreadsheet_().toast('Setra: sync ' + cfg.label + ' selesai.', 'Setra', 5);
    ui.alert('Sync ' + cfg.label + ' selesai. Data sudah dikirim ke database dan diperbarui kembali ke spreadsheet.');
  } catch (error) {
    setraAppendSyncLog_(cfg.sheetName, 'sync', 'two_way', 0, 0, 1, 'FAILED', error.message);
    setraGetSpreadsheet_().toast('Setra: sync ' + cfg.label + ' gagal.', 'Setra', 8);
    ui.alert('Sync ' + cfg.label + ' gagal:\n\n' + error.message);
  } finally {
    lock.releaseLock();
  }
}

function setraHydrateSheetBeforePush_(managedKey) {
  if (managedKey === 'USERS') {
    setraHydrateUsersBeforePush_();
    return;
  }

  if (managedKey === 'SHIPMENTS') {
    setraHydrateShipmentsBeforePush_();
    return;
  }

  if (managedKey === 'LOCKING') {
    setraHydrateLockingBeforePush_();
  }
}

function setraHydrateSheetAfterPull_(managedKey) {
  setraHydrateSheetBeforePush_(managedKey);
}

function setraHydrateUsersBeforePush_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.USERS);
  const headers = setraGetHeaders_(sheet);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);
  const areaId = setraGetAreaId_();

  if (lastRow < SETRA.DATA_START_ROW) return;

  const values = sheet.getRange(SETRA.DATA_START_ROW, 1, lastRow - SETRA.DATA_START_ROW + 1, headers.length).getValues();

  values.forEach(function (row, index) {
    const rowNumber = SETRA.DATA_START_ROW + index;
    if (setraIsBlankBusinessRow_(headers, row, SETRA.MANAGED.USERS.businessHeaders)) return;

    setraSetCellByHeader_(sheet, rowNumber, map, 'area_id', areaId);
    setraSetCellByHeader_(sheet, rowNumber, map, '__user_role', 'regular');
    setraEnsureDefaultSyncFields_(sheet, rowNumber, map);
  });
}

function setraHydrateShipmentsBeforePush_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const headers = setraGetHeaders_(sheet);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);
  const areaId = setraGetAreaId_();
  const usersNameMap = setraGetUsersNameMap_();

  if (lastRow < SETRA.DATA_START_ROW) return;

  const values = sheet.getRange(SETRA.DATA_START_ROW, 1, lastRow - SETRA.DATA_START_ROW + 1, headers.length).getValues();

  values.forEach(function (row, index) {
    const rowNumber = SETRA.DATA_START_ROW + index;
    if (setraIsBlankBusinessRow_(headers, row, SETRA.MANAGED.SHIPMENTS.businessHeaders)) return;

    const statusKerja = setraNormalizeKey_(row[(map.status_kerja || 0) - 1]);
    const namaLengkap = setraNormalizeText_(row[(map.nama_lengkap || 0) - 1]);
    const jumlahToko = Number(row[(map.jumlah_toko || 0) - 1] || 0);
    const terkirim = Number(row[(map.terkirim || 0) - 1] || 0);
    const shipmentCode = setraNormalizeText_(row[(map.shipment_code || 0) - 1]);

    const isFreelance = statusKerja === 'freelance';
    const nikKerja = isFreelance ? '' : setraResolveNikByName_(namaLengkap, usersNameMap);
    const gagal = jumlahToko || terkirim ? jumlahToko - terkirim : '';
    const shipmentCodeType = shipmentCode ? (/^\d{10}$/.test(shipmentCode) ? 'AKTIF' : 'NON_AKTIF') : '';

    setraSetCellByHeader_(sheet, rowNumber, map, 'area_id', areaId);
    setraSetCellByHeader_(sheet, rowNumber, map, 'nik_kerja', nikKerja);
    setraSetCellByHeader_(sheet, rowNumber, map, '__nik_kerja', nikKerja); // aman jika kolom lama masih ada
    setraSetCellByHeader_(sheet, rowNumber, map, 'gagal', gagal);
    setraSetCellByHeader_(sheet, rowNumber, map, '__is_freelance', isFreelance);
    setraSetCellByHeader_(sheet, rowNumber, map, '__shipment_code_type', shipmentCodeType);
    setraEnsureDefaultSyncFields_(sheet, rowNumber, map);
  });
}

function setraHydrateLockingBeforePush_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.LOCKING);
  const headers = setraGetHeaders_(sheet);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);
  const areaId = setraGetAreaId_();
  const usersNameMap = setraGetUsersNameMap_();

  if (lastRow < SETRA.DATA_START_ROW) return;

  const values = sheet.getRange(SETRA.DATA_START_ROW, 1, lastRow - SETRA.DATA_START_ROW + 1, headers.length).getValues();

  values.forEach(function (row, index) {
    const rowNumber = SETRA.DATA_START_ROW + index;
    if (setraIsBlankBusinessRow_(headers, row, SETRA.MANAGED.LOCKING.businessHeaders)) return;

    const namaLengkap = setraNormalizeText_(row[(map.nama_lengkap || 0) - 1]);
    const nikKerja = setraResolveNikByName_(namaLengkap, usersNameMap);

    setraSetCellByHeader_(sheet, rowNumber, map, 'area_id', areaId);
    setraSetCellByHeader_(sheet, rowNumber, map, '__nik_kerja', nikKerja);
    setraEnsureDefaultSyncFields_(sheet, rowNumber, map);
  });
}

function setraEnsureDefaultSyncFields_(sheet, rowNumber, map) {
  const currentAction = setraGetCellByHeader_(sheet, rowNumber, map, '__sync_action');
  const currentStatus = setraGetCellByHeader_(sheet, rowNumber, map, '__sync_status');

  if (!currentAction) {
    setraSetCellByHeader_(sheet, rowNumber, map, '__sync_action', SETRA.SYNC_ACTION.UPSERT);
  }

  if (!currentStatus) {
    setraSetCellByHeader_(sheet, rowNumber, map, '__sync_status', SETRA.SYNC_STATUS.PENDING);
  }
}
