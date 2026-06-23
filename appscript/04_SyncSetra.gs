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

/**
 * Push khusus shipments: sheet "shipments" -> database.
 * Dipanggil dari menu Setra > Shipments > update.
 */
function setraUpdateShipmentsToDatabase() {
  const cfg = SETRA.MANAGED.SHIPMENTS;
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(30000)) {
    SpreadsheetApp.getUi().alert('Setra sedang menjalankan proses lain. Coba lagi setelah proses sebelumnya selesai.');
    return;
  }

  try {
    const spreadsheet = setraGetSpreadsheet_();
    spreadsheet.toast('Setra: update shipments ke database dimulai...', 'Setra', 5);

    const sheet = setraGetSheet_(cfg.sheetName);
    setraAssertHeaders_(sheet, cfg.requiredHeaders);
    setraHydrateShipmentsBeforePush_();
    setraPrepareShipmentsSheet_();

    const rows = setraReadShipmentRowsForUpdate_();
    const beforeRowsByNumber = setraIndexRowsByNumber_(rows);

    if (rows.length === 0) {
      setraShowResultDialog_('Update Shipments', [
        ['Data baru berhasil diinput ke database', 0],
        ['Data berhasil diperbarui di database', 0],
        ['Data berhasil dihapus dari database', 0],
        ['Baris dilewati', 0],
        ['Baris gagal', 0],
      ], 'Tidak ada perubahan pada sheet shipments. Tidak ada data yang dikirim ke database.');
      return;
    }

    const pushPayload = Object.assign(setraBuildBasePayload_(cfg.sheetName, 'push'), {
      rows: rows,
    });

    const pushResponse = setraPostJson_(cfg.pushPath, pushPayload);
    const pushResults = setraGetResultsArrayFromResponse_(pushResponse);
    setraApplyPushResults_(cfg.sheetName, pushResults);
    setraPrepareShipmentsSheet_();
    setraHydrateShipmentsBeforePush_();
    setraFormatManagedSheet_(cfg.sheetName);

    const counts = setraCountShipmentPushResults_(pushResults, beforeRowsByNumber);
    const rowsFailed = Number(pushResponse.rows_failed || pushResponse.rowsFailed || counts.failed || 0);
    const rowsSuccess = Number(pushResponse.rows_success || pushResponse.rowsSuccess || counts.success || 0);
    const pushStatus = String(pushResponse.status || pushResponse.sync_status || (rowsFailed > 0 ? 'PARTIAL' : 'SUCCESS')).toUpperCase();

    setraAppendSyncLog_(cfg.sheetName, 'push', 'sheet_to_db_incremental', rows.length, rowsSuccess, rowsFailed, pushStatus, pushResponse.message || '');

    spreadsheet.toast('Setra: update shipments selesai.', 'Setra', 5);
    setraShowResultDialog_('Update Shipments', [
      ['Data baru berhasil diinput ke database', counts.created],
      ['Data berhasil diperbarui di database', counts.updated],
      ['Data berhasil dihapus dari database', counts.deleted],
      ['Baris dilewati', counts.skipped],
      ['Baris gagal', rowsFailed],
    ], rowsFailed > 0 ? 'Sebagian baris gagal. Cek kolom __sync_message pada sheet shipments.' : 'Update incremental dari sheet shipments ke database selesai.');
  } catch (error) {
    setraAppendSyncLog_(cfg.sheetName, 'push', 'sheet_to_db_incremental', 0, 0, 1, 'FAILED', error.message);
    setraGetSpreadsheet_().toast('Setra: update shipments gagal.', 'Setra', 8);
    setraShowResultDialog_('Update Shipments Gagal', [
      ['Status', 'FAILED'],
    ], error && error.message ? error.message : String(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Pull khusus shipments: database -> sheet "shipments".
 * Dipanggil dari menu Setra > Shipments > fetching.
 */
function setraFetchingShipmentsFromDatabase() {
  const cfg = SETRA.MANAGED.SHIPMENTS;
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(30000)) {
    SpreadsheetApp.getUi().alert('Setra sedang menjalankan proses lain. Coba lagi setelah proses sebelumnya selesai.');
    return;
  }

  try {
    const spreadsheet = setraGetSpreadsheet_();
    spreadsheet.toast('Setra: fetching shipments dari database dimulai...', 'Setra', 5);

    const sheet = setraGetSheet_(cfg.sheetName);
    setraAssertHeaders_(sheet, cfg.requiredHeaders);
    setraPrepareShipmentsSheet_();

    const lastFetchAt = setraGetShipmentsLastFetchAt_();
    const allPulledRows = [];
    let cursor = '';
    let pages = 0;
    let lastFetchAtFromBackend = '';

    do {
      const pullResponse = setraGetJson_(cfg.pullPath, {
        area_id: setraGetAreaId_(),
        spreadsheet_id: setraGetSpreadsheetId_(),
        updated_after: lastFetchAt,
        cursor: cursor,
        limit: 500,
      });

      const pulledRows = setraGetRowsArrayFromResponse_(pullResponse);
      allPulledRows.push.apply(allPulledRows, pulledRows);
      cursor = String(pullResponse.next_cursor || pullResponse.nextCursor || '');
      lastFetchAtFromBackend = String(pullResponse.fetched_at || pullResponse.fetchedAt || lastFetchAtFromBackend || '');
      pages += 1;
    } while (cursor && pages < 20);

    const counts = setraMergePulledShipmentRows_(allPulledRows);
    setraPrepareShipmentsSheet_();
    setraHydrateShipmentsBeforePush_();
    setraFormatManagedSheet_(cfg.sheetName);

    if (lastFetchAtFromBackend) {
      setraSetShipmentsLastFetchAt_(lastFetchAtFromBackend);
    } else {
      setraSetShipmentsLastFetchAt_(setraNowIso_());
    }

    setraAppendSyncLog_(cfg.sheetName, 'pull', 'db_to_sheet_incremental', allPulledRows.length, allPulledRows.length, 0, 'SUCCESS', 'Incremental fetching selesai');

    spreadsheet.toast('Setra: fetching shipments selesai.', 'Setra', 5);
    setraShowResultDialog_('Fetching Shipments', [
      ['Data baru yang masuk ke shipment', counts.created],
      ['Data shipment yang diperbarui', counts.updated],
      ['Data tidak berubah', counts.unchanged],
      ['Data konflik / tidak ditimpa', counts.conflict],
      ['Total data dari database', allPulledRows.length],
    ], 'Fetching incremental dari database ke sheet shipments selesai. Baris lokal yang belum disync tidak ditimpa.');
  } catch (error) {
    setraAppendSyncLog_(cfg.sheetName, 'pull', 'db_to_sheet_incremental', 0, 0, 1, 'FAILED', error.message);
    setraGetSpreadsheet_().toast('Setra: fetching shipments gagal.', 'Setra', 8);
    setraShowResultDialog_('Fetching Shipments Gagal', [
      ['Status', 'FAILED'],
    ], error && error.message ? error.message : String(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function setraReadAllRowsAsObjects_(sheetName) {
  const sheet = setraGetSheet_(sheetName);
  const headers = setraGetHeaders_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);

  if (lastRow < SETRA.DATA_START_ROW) {
    return [];
  }

  const rowCount = lastRow - SETRA.DATA_START_ROW + 1;
  const values = sheet.getRange(SETRA.DATA_START_ROW, 1, rowCount, headers.length).getValues();
  const rows = [];

  for (let i = 0; i < values.length; i += 1) {
    const obj = { __row_number: SETRA.DATA_START_ROW + i };

    for (let c = 0; c < headers.length; c += 1) {
      const header = headers[c];
      if (!header) continue;
      obj[header] = setraNormalizeCellValueForPayload_(values[i][c]);
    }

    rows.push(obj);
  }

  return rows;
}

function setraIndexRowsByNumber_(rows) {
  const index = {};
  (rows || []).forEach(function (row) {
    const rowNumber = Number(row.__row_number || 0);
    if (rowNumber > 0) {
      index[rowNumber] = row;
    }
  });
  return index;
}

function setraIndexRowsByKey_(rows, keyName) {
  const index = {};
  (rows || []).forEach(function (row) {
    const key = setraNormalizeText_(row[keyName]);
    if (key) {
      index[key] = row;
    }
  });
  return index;
}

function setraCountShipmentPushResults_(results, beforeRowsByNumber) {
  const counts = {
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
    success: 0,
  };

  (results || []).forEach(function (item) {
    const status = String(item.status || '').toUpperCase();
    const rowNumber = Number(item.row_number || item.__row_number || 0);
    const beforeRow = beforeRowsByNumber[rowNumber] || {};
    const action = String(beforeRow.__sync_action || 'UPSERT').toUpperCase();

    if (status === SETRA.SYNC_STATUS.ERROR) {
      counts.failed += 1;
      return;
    }

    if (status === SETRA.SYNC_STATUS.SKIPPED) {
      counts.skipped += 1;
      return;
    }

    if (status !== SETRA.SYNC_STATUS.SYNCED) {
      return;
    }

    counts.success += 1;

    if (action === SETRA.SYNC_ACTION.DELETE) {
      counts.deleted += 1;
      return;
    }

    const beforeShipmentId = setraNormalizeText_(beforeRow.__shipment_id);
    if (beforeShipmentId) {
      counts.updated += 1;
    } else {
      counts.created += 1;
    }
  });

  return counts;
}

function setraCountShipmentPullRows_(pulledRows, existingByShipmentId) {
  const counts = {
    created: 0,
    updated: 0,
    unchanged: 0,
  };

  (pulledRows || []).forEach(function (row) {
    const shipmentId = setraNormalizeText_(row.__shipment_id);

    if (!shipmentId || !existingByShipmentId[shipmentId]) {
      counts.created += 1;
      return;
    }

    const existingRow = existingByShipmentId[shipmentId];
    const incomingHash = setraNormalizeText_(row.__row_hash);
    const existingHash = setraNormalizeText_(existingRow.__row_hash);

    if (incomingHash && existingHash) {
      if (incomingHash === existingHash) {
        counts.unchanged += 1;
      } else {
        counts.updated += 1;
      }
      return;
    }

    if (setraBuildComparableShipmentText_(row) === setraBuildComparableShipmentText_(existingRow)) {
      counts.unchanged += 1;
    } else {
      counts.updated += 1;
    }
  });

  return counts;
}

function setraBuildComparableShipmentText_(row) {
  const keys = [
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
  ];

  return keys.map(function (key) {
    return setraNormalizeText_(row[key]);
  }).join('|');
}

function setraShowResultDialog_(title, rows, message) {
  const safeTitle = setraEscapeHtml_(title || 'Setra');
  const safeMessage = setraEscapeHtml_(message || '');
  const tableRows = (rows || []).map(function (row) {
    return '<tr><td>' + setraEscapeHtml_(row[0]) + '</td><td class="value">' + setraEscapeHtml_(row[1]) + '</td></tr>';
  }).join('');

  const html = HtmlService.createHtmlOutput(
    '<!doctype html><html><head><base target="_top"><style>' +
      'body{font-family:Arial,sans-serif;margin:0;background:#f8fafc;color:#0f172a;}' +
      '.wrap{padding:20px;}' +
      'h2{margin:0 0 12px;font-size:18px;}' +
      'p{margin:0 0 16px;color:#475569;line-height:1.45;font-size:13px;}' +
      'table{width:100%;border-collapse:collapse;border:1px solid #cbd5e1;background:white;}' +
      'td{padding:10px;border-bottom:1px solid #e2e8f0;font-size:13px;}' +
      'tr:last-child td{border-bottom:none;}' +
      '.value{text-align:right;font-weight:700;color:#0f172a;}' +
      '.btn{margin-top:16px;width:100%;border:0;background:#1d4ed8;color:white;padding:10px 14px;font-weight:700;cursor:pointer;}' +
      '</style></head><body><div class="wrap"><h2>' + safeTitle + '</h2><p>' + safeMessage + '</p><table>' + tableRows + '</table>' +
      '<button class="btn" onclick="google.script.host.close()">Tutup</button></div></body></html>'
  ).setWidth(430).setHeight(310);

  SpreadsheetApp.getUi().showModalDialog(html, title || 'Setra');
}

function setraEscapeHtml_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


const SETRA_SHIPMENTS_UI_ = Object.freeze({
  DELETE_COL: 2,
  DELETE_HEADER_A1: 'B1',
  DELETE_CHECKED_BG: '#f4cccc',
  DELETE_CHECKED_FG: '#990000',
  DELETE_HEADER_BG: '#ea4335',
  DELETE_HEADER_FG: '#ffffff',
  LAST_FETCH_PROP: 'SETRA_SHIPMENTS_LAST_FETCHED_AT',
  FAILURE_REASONS: ['Toko Tutup', 'Dobel/Salah Order', 'Tidak Cukup Waktu', 'Ditolak', 'Lainnya'],
});

function setraHandleShipmentsOnEdit_(e) {
  const range = e.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== SETRA.SHEETS.SHIPMENTS) return;
  if (range.getLastRow() < SETRA.DATA_START_ROW) return;

  const rowStart = Math.max(range.getRow(), SETRA.DATA_START_ROW);
  const rowEnd = range.getLastRow();
  const colStart = range.getColumn();
  const colEnd = range.getLastColumn();

  if (colStart <= SETRA_SHIPMENTS_UI_.DELETE_COL && colEnd >= SETRA_SHIPMENTS_UI_.DELETE_COL) {
    for (let row = rowStart; row <= rowEnd; row += 1) {
      setraApplyShipmentDeleteRowState_(sheet, row);
    }
    setraUpdateShipmentDeleteHeader_(sheet);
    return;
  }

  setraMarkShipmentRowsDirty_(sheet, rowStart, rowEnd, colStart, colEnd);
}

function setraPrepareShipmentsSheet_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const headers = setraGetHeaders_(sheet);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);
  const maxRows = Math.max(sheet.getMaxRows() - SETRA.DATA_START_ROW + 1, 1);

  sheet.setFrozenRows(1);
  sheet.getRange(SETRA_SHIPMENTS_UI_.DELETE_HEADER_A1)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setFontWeight('bold');

  if (lastRow >= SETRA.DATA_START_ROW) {
    const rowCount = lastRow - SETRA.DATA_START_ROW + 1;
    const deleteRange = sheet.getRange(SETRA.DATA_START_ROW, SETRA_SHIPMENTS_UI_.DELETE_COL, rowCount, 1);
    deleteRange.insertCheckboxes();

    const values = sheet.getRange(SETRA.DATA_START_ROW, 1, rowCount, headers.length).getValues();
    for (let i = 0; i < values.length; i += 1) {
      const rowNumber = SETRA.DATA_START_ROW + i;
      if (setraIsBlankBusinessRow_(headers, values[i], SETRA.MANAGED.SHIPMENTS.businessHeaders)) {
        sheet.getRange(rowNumber, SETRA_SHIPMENTS_UI_.DELETE_COL).clearContent().clearDataValidations();
      } else {
        const checkedValue = sheet.getRange(rowNumber, SETRA_SHIPMENTS_UI_.DELETE_COL).getValue();
        if (checkedValue !== true) {
          sheet.getRange(rowNumber, SETRA_SHIPMENTS_UI_.DELETE_COL).setValue(false);
        }
      }
      setraApplyShipmentDeleteRowState_(sheet, rowNumber);
    }
  }

  if (map.alasan) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(SETRA_SHIPMENTS_UI_.FAILURE_REASONS, true)
      .setAllowInvalid(true)
      .setHelpText('Boleh multi alasan. Gunakan format teks: Toko Tutup; Tidak Cukup Waktu; Lainnya: catatan')
      .build();
    sheet.getRange(SETRA.DATA_START_ROW, map.alasan, maxRows, 1).setDataValidation(rule).setWrap(true);
  }

  if (map.area_id) {
    try { sheet.hideColumns(map.area_id); } catch (error) {}
  }
  ['__shipment_id', '__is_freelance', '__shipment_code_type', '__sync_action', '__sync_status', '__sync_message', '__last_synced_at', '__row_hash'].forEach(function (header) {
    if (map[header]) {
      try { sheet.hideColumns(map[header]); } catch (error) {}
    }
  });

  setraProtectShipmentTechnicalColumns_(sheet, map);
  setraUpdateShipmentDeleteHeader_(sheet);
}

function setraProtectShipmentTechnicalColumns_(sheet, map) {
  try {
    const descriptionPrefix = 'Setra shipments technical columns';
    sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (protection) {
      if (String(protection.getDescription() || '').indexOf(descriptionPrefix) === 0) {
        protection.remove();
      }
    });

    const headersToProtect = ['area_id', '__shipment_id', '__is_freelance', '__shipment_code_type', '__sync_action', '__sync_status', '__sync_message', '__last_synced_at', '__row_hash'];
    headersToProtect.forEach(function (header) {
      const col = map[header];
      if (!col) return;
      const protection = sheet.getRange(1, col, sheet.getMaxRows(), 1).protect();
      protection.setDescription(descriptionPrefix + ': ' + header);
      protection.setWarningOnly(false);
    });
  } catch (error) {
    // Proteksi bisa gagal jika user bukan owner. Hide column tetap dijalankan.
  }
}

function setraApplyShipmentDeleteRowState_(sheet, rowNumber) {
  if (rowNumber < SETRA.DATA_START_ROW) return;

  const checked = sheet.getRange(rowNumber, SETRA_SHIPMENTS_UI_.DELETE_COL).getValue() === true;
  const lastColumn = sheet.getLastColumn();
  const rowRange = sheet.getRange(rowNumber, 1, 1, lastColumn);

  if (checked) {
    rowRange.setBackground(SETRA_SHIPMENTS_UI_.DELETE_CHECKED_BG).setFontColor(SETRA_SHIPMENTS_UI_.DELETE_CHECKED_FG);
  } else {
    rowRange.setBackground(null).setFontColor(null);
  }
}

function setraUpdateShipmentDeleteHeader_(sheet) {
  const lastRow = setraGetLastDataRow_(sheet);
  const header = sheet.getRange(SETRA_SHIPMENTS_UI_.DELETE_HEADER_A1);

  if (lastRow < SETRA.DATA_START_ROW) {
    header.setValue('Hapus').setBackground(null).setFontColor(null).setFontWeight('bold');
    return;
  }

  const values = sheet.getRange(SETRA.DATA_START_ROW, SETRA_SHIPMENTS_UI_.DELETE_COL, lastRow - SETRA.DATA_START_ROW + 1, 1).getValues();
  const checkedCount = values.filter(function (row) { return row[0] === true; }).length;

  if (checkedCount > 0) {
    header
      .setValue('Hapus ' + checkedCount + ' data')
      .setBackground(SETRA_SHIPMENTS_UI_.DELETE_HEADER_BG)
      .setFontColor(SETRA_SHIPMENTS_UI_.DELETE_HEADER_FG)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
  } else {
    header
      .setValue('Hapus')
      .setBackground(null)
      .setFontColor(null)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
  }
}

function setraMarkShipmentRowsDirty_(sheet, rowStart, rowEnd, colStart, colEnd) {
  const map = setraGetHeaderMap_(sheet);
  const dirtyColumns = SETRA.MANAGED.SHIPMENTS.businessHeaders
    .map(function (header) { return map[header] || 0; })
    .filter(Boolean);

  const intersectsBusinessColumn = dirtyColumns.some(function (col) {
    return colStart <= col && col <= colEnd;
  });

  if (!intersectsBusinessColumn) return;

  for (let row = rowStart; row <= rowEnd; row += 1) {
    if (map.__sync_action) sheet.getRange(row, map.__sync_action).setValue(SETRA.SYNC_ACTION.UPSERT);
    if (map.__sync_status) sheet.getRange(row, map.__sync_status).setValue(SETRA.SYNC_STATUS.PENDING);
    if (map.__sync_message) sheet.getRange(row, map.__sync_message).setValue('Belum diupdate ke database');
    if (map.__row_hash) sheet.getRange(row, map.__row_hash).setValue('');
  }
}

function setraReadShipmentRowsForUpdate_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const headers = setraGetHeaders_(sheet);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);

  if (lastRow < SETRA.DATA_START_ROW) return [];

  const rowCount = lastRow - SETRA.DATA_START_ROW + 1;
  const values = sheet.getRange(SETRA.DATA_START_ROW, 1, rowCount, headers.length).getValues();
  const rows = [];

  for (let i = 0; i < values.length; i += 1) {
    const rowNumber = SETRA.DATA_START_ROW + i;
    const rawValues = values[i];

    if (rawValues[SETRA_SHIPMENTS_UI_.DELETE_COL - 1] === true) {
      continue;
    }

    if (setraIsBlankBusinessRow_(headers, rawValues, SETRA.MANAGED.SHIPMENTS.businessHeaders)) {
      continue;
    }

    const shipmentId = map.__shipment_id ? setraNormalizeText_(rawValues[map.__shipment_id - 1]) : '';
    const syncStatus = map.__sync_status ? setraNormalizeText_(rawValues[map.__sync_status - 1]).toUpperCase() : '';
    const syncAction = map.__sync_action ? setraNormalizeText_(rawValues[map.__sync_action - 1]).toUpperCase() : '';

    const shouldSend = !shipmentId || syncAction === SETRA.SYNC_ACTION.DELETE || syncStatus !== SETRA.SYNC_STATUS.SYNCED;
    if (!shouldSend) continue;

    const obj = { __row_number: rowNumber };
    for (let c = 0; c < headers.length; c += 1) {
      const header = headers[c];
      if (!header) continue;
      obj[header] = setraNormalizeCellValueForPayload_(rawValues[c]);
    }
    rows.push(obj);
  }

  return rows;
}

function setraMergePulledShipmentRows_(pulledRows) {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const headers = setraGetHeaders_(sheet);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);
  const existingById = {};
  const counts = { created: 0, updated: 0, unchanged: 0, conflict: 0 };

  if (lastRow >= SETRA.DATA_START_ROW) {
    const rowCount = lastRow - SETRA.DATA_START_ROW + 1;
    const values = sheet.getRange(SETRA.DATA_START_ROW, 1, rowCount, headers.length).getValues();

    values.forEach(function (row, index) {
      const shipmentId = map.__shipment_id ? setraNormalizeText_(row[map.__shipment_id - 1]) : '';
      if (shipmentId) {
        existingById[shipmentId] = {
          rowNumber: SETRA.DATA_START_ROW + index,
          values: row,
        };
      }
    });
  }

  const appendRows = [];

  (pulledRows || []).forEach(function (incoming) {
    const shipmentId = setraNormalizeText_(incoming.__shipment_id);
    if (!shipmentId) return;

    const existing = existingById[shipmentId];
    const outputRow = headers.map(function (header, index) {
      if (index === SETRA_SHIPMENTS_UI_.DELETE_COL - 1) return false;
      if (!header) return '';
      return incoming[header] === undefined || incoming[header] === null ? '' : incoming[header];
    });

    if (!existing) {
      appendRows.push(outputRow);
      counts.created += 1;
      return;
    }

    const existingSyncStatus = map.__sync_status ? setraNormalizeText_(existing.values[map.__sync_status - 1]).toUpperCase() : '';
    const localDirty = existingSyncStatus && existingSyncStatus !== SETRA.SYNC_STATUS.SYNCED && existingSyncStatus !== SETRA.SYNC_STATUS.SKIPPED;

    if (localDirty) {
      if (map.__sync_status) sheet.getRange(existing.rowNumber, map.__sync_status).setValue(SETRA.SYNC_STATUS.CONFLICT);
      if (map.__sync_message) sheet.getRange(existing.rowNumber, map.__sync_message).setValue('Konflik: data database berubah saat baris lokal belum disync. Fetching tidak menimpa baris ini.');
      counts.conflict += 1;
      return;
    }

    const incomingHash = setraNormalizeText_(incoming.__row_hash);
    const existingHash = map.__row_hash ? setraNormalizeText_(existing.values[map.__row_hash - 1]) : '';

    if (incomingHash && existingHash && incomingHash === existingHash) {
      counts.unchanged += 1;
      return;
    }

    sheet.getRange(existing.rowNumber, 1, 1, headers.length).setValues([outputRow]);
    counts.updated += 1;
  });

  if (appendRows.length > 0) {
    const appendStart = Math.max(setraGetLastDataRow_(sheet) + 1, SETRA.DATA_START_ROW);
    sheet.getRange(appendStart, 1, appendRows.length, headers.length).setValues(appendRows);
  }

  return counts;
}

function setraGetShipmentsLastFetchAt_() {
  return PropertiesService.getDocumentProperties().getProperty(SETRA_SHIPMENTS_UI_.LAST_FETCH_PROP) || '';
}

function setraSetShipmentsLastFetchAt_(value) {
  PropertiesService.getDocumentProperties().setProperty(SETRA_SHIPMENTS_UI_.LAST_FETCH_PROP, value || setraNowIso_());
}

function setraDeleteCheckedShipments() {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  setraPrepareShipmentsSheet_();
  const count = setraGetCheckedShipmentRowNumbers_().length;

  if (count === 0) {
    SpreadsheetApp.getUi().alert('Tidak ada data shipment yang dicentang.');
    return;
  }

  const html = HtmlService.createHtmlOutput(
    '<!doctype html><html><head><base target="_top"><style>' +
    'body{font-family:Arial,sans-serif;margin:0;background:#fff;color:#111827;}' +
    '.wrap{padding:20px;}' +
    'h2{margin:0 0 12px;font-size:18px;color:#991b1b;}' +
    'p{font-size:13px;line-height:1.5;color:#374151;}' +
    '.warn{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:12px;border-radius:8px;margin:12px 0;}' +
    '.actions{display:flex;gap:8px;margin-top:16px;}' +
    'button{flex:1;padding:10px 12px;border:0;border-radius:6px;font-weight:700;cursor:pointer;}' +
    '.cancel{background:#e5e7eb;color:#111827;}' +
    '.delete{background:#dc2626;color:#fff;}' +
    '#result{white-space:pre-line;font-size:13px;margin-top:12px;color:#111827;}' +
    '</style></head><body><div class="wrap">' +
    '<h2>Hapus permanen data shipment</h2>' +
    '<p>Anda akan menghapus <b>' + count + '</b> data shipment.</p>' +
    '<div class="warn">Data akan dihapus permanen dari database terlebih dahulu. Jika berhasil, baris akan dihapus dari Google Spreadsheet. Aksi ini tidak bisa dibatalkan.</div>' +
    '<div id="result"></div>' +
    '<div class="actions"><button class="cancel" onclick="google.script.host.close()">Batalkan</button>' +
    '<button id="deleteBtn" class="delete" onclick="runDelete()">Hapus Permanen</button></div>' +
    '<script>' +
    'function runDelete(){var b=document.getElementById("deleteBtn");b.disabled=true;b.textContent="Menghapus...";google.script.run.withSuccessHandler(function(r){document.getElementById("result").textContent=r.message;b.textContent="Selesai";setTimeout(function(){google.script.host.close()},1600);}).withFailureHandler(function(e){document.getElementById("result").textContent=e.message||e;b.disabled=false;b.textContent="Hapus Permanen";}).setraExecuteDeleteCheckedShipments();}' +
    '</script></div></body></html>'
  ).setWidth(460).setHeight(360);

  SpreadsheetApp.getUi().showModalDialog(html, 'Hapus Shipment');
}

function setraExecuteDeleteCheckedShipments() {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const map = setraGetHeaderMap_(sheet);
  const selectedRows = setraGetCheckedShipmentRowNumbers_();

  if (selectedRows.length === 0) {
    return { ok: true, message: 'Tidak ada data yang dicentang.' };
  }

  const shipmentIds = [];
  const rowByShipmentId = {};
  const rowsWithoutId = [];

  selectedRows.forEach(function (rowNumber) {
    const shipmentId = map.__shipment_id ? setraNormalizeText_(sheet.getRange(rowNumber, map.__shipment_id).getValue()) : '';
    if (shipmentId) {
      shipmentIds.push(shipmentId);
      rowByShipmentId[shipmentId] = rowNumber;
    } else {
      rowsWithoutId.push(rowNumber);
    }
  });

  let deletedIds = [];
  let failedItems = [];

  if (shipmentIds.length > 0) {
    const response = setraPostJson_(SETRA.ENDPOINTS.SHIPMENTS_BULK_DELETE, Object.assign(setraBuildBasePayload_(SETRA.SHEETS.SHIPMENTS, 'bulk_delete'), {
      shipment_ids: shipmentIds,
    }));
    deletedIds = Array.isArray(response.deleted_ids) ? response.deleted_ids.map(String) : [];
    failedItems = Array.isArray(response.failed_items) ? response.failed_items : [];
  }

  failedItems.forEach(function (item) {
    const shipmentId = setraNormalizeText_(item.shipment_id);
    const rowNumber = rowByShipmentId[shipmentId];
    if (rowNumber && map.__sync_message) {
      sheet.getRange(rowNumber, map.__sync_message).setValue(item.message || 'Gagal hapus data');
    }
  });

  const deleteRows = rowsWithoutId.concat(deletedIds.map(function (id) { return rowByShipmentId[id]; }).filter(Boolean));
  deleteRows.sort(function (a, b) { return b - a; }).forEach(function (rowNumber) {
    sheet.deleteRow(rowNumber);
  });

  setraPrepareShipmentsSheet_();

  const message = 'Hapus shipment selesai.\n' +
    'Berhasil hapus database: ' + deletedIds.length + '\n' +
    'Berhasil hapus spreadsheet-only: ' + rowsWithoutId.length + '\n' +
    'Gagal: ' + failedItems.length;

  return { ok: failedItems.length === 0, message: message };
}

function setraGetCheckedShipmentRowNumbers_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const lastRow = setraGetLastDataRow_(sheet);
  if (lastRow < SETRA.DATA_START_ROW) return [];

  const values = sheet.getRange(SETRA.DATA_START_ROW, SETRA_SHIPMENTS_UI_.DELETE_COL, lastRow - SETRA.DATA_START_ROW + 1, 1).getValues();
  const rows = [];
  values.forEach(function (row, index) {
    if (row[0] === true) {
      rows.push(SETRA.DATA_START_ROW + index);
    }
  });
  return rows;
}
