/**
 * SETRA - Spreadsheet Database Sync
 * File: 05_Shipments.gs
 * Scope: Updating DB->Sheet, Fetching Sheet->DB, Deleting, dan onEdit shipments.
 */

const SETRA_SHIPMENTS = Object.freeze({
  DELETE_COL_HEADER: 'Hapus',
  DELETE_CHECKED_BG: '#f4cccc',
  DELETE_CHECKED_FG: '#990000',
  INVALID_BG: '#f4cccc',
});

function setraHandleOnEdit_(e) {
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();

  if (sheetName === SETRA.SHEETS.SHIPMENTS) {
    setraHandleShipmentsOnEdit_(e);
    return;
  }

  if (sheetName === SETRA.SHEETS.USERS) {
    setraMarkDirtyRowsForEdit_(sheet, e.range, SETRA.BUSINESS_HEADERS.USERS);
    return;
  }

  if (sheetName === SETRA.SHEETS.LOCKING) {
    setraHydrateLockingRows_();
    setraMarkDirtyRowsForEdit_(sheet, e.range, SETRA.BUSINESS_HEADERS.LOCKING);
  }
}

function setraPrepareShipmentsRuntime_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const map = setraAssertHeaders_(sheet, SETRA.REQUIRED_HEADERS.SHIPMENTS);
  sheet.setFrozenRows(1);

  const lastRow = Math.max(setraGetLastDataRow_(sheet), SETRA.DATA_START_ROW);
  const rowCount = Math.max(lastRow - SETRA.DATA_START_ROW + 1, 1);

  setraFormatShipmentRows_(sheet, map, SETRA.DATA_START_ROW, rowCount);
  setraFinalizeShipmentsAfterDataChange_();
}

function setraFormatShipmentRows_(sheet, map, rowStart, rowCount) {
  if (!rowCount || rowCount < 1) return;

  if (map.Hapus) {
    try {
      sheet.getRange(rowStart, map.Hapus, rowCount, 1).insertCheckboxes();
    } catch (error) {}
  }

  if (map.shipment_code) {
    sheet.getRange(rowStart, map.shipment_code, rowCount, 1).setNumberFormat('@');
  }
}

function setraFinalizeShipmentsAfterDataChange_() {
  setraRenumberShipments_();
  setraUpdateShipmentDeleteColors_();
  setraHideTechnicalColumns_(SETRA.SHEETS.SHIPMENTS, SETRA.TECHNICAL_HEADERS.SHIPMENTS);
}

function setraRenumberShipments_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const headers = setraGetHeaders_(sheet);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);
  if (!map.no || lastRow < SETRA.DATA_START_ROW) return;

  const rowCount = lastRow - SETRA.DATA_START_ROW + 1;
  const values = sheet.getRange(SETRA.DATA_START_ROW, 1, rowCount, headers.length).getValues();
  const numbers = [];
  let sequence = 1;

  values.forEach(function (rowValues) {
    const obj = {};
    headers.forEach(function (header, idx) { if (header) obj[header] = rowValues[idx]; });
    const hasShipmentId = map.__shipment_id && setraNormalizeText_(rowValues[map.__shipment_id - 1]);
    const hasBusinessData = !setraIsBlankBusinessRow_(obj, SETRA.BUSINESS_HEADERS.SHIPMENTS);

    if (hasShipmentId || hasBusinessData) {
      numbers.push([sequence]);
      sequence += 1;
    } else {
      numbers.push(['']);
    }
  });

  sheet.getRange(SETRA.DATA_START_ROW, map.no, rowCount, 1).setValues(numbers);
}

function setraHandleShipmentsOnEdit_(e) {
  const sheet = e.range.getSheet();
  const map = setraGetHeaderMap_(sheet);
  const rowStart = Math.max(e.range.getRow(), SETRA.DATA_START_ROW);
  const rowEnd = e.range.getLastRow();
  if (rowEnd < SETRA.DATA_START_ROW) return;

  const editedStartCol = e.range.getColumn();
  const editedEndCol = e.range.getLastColumn();

  if (map.Hapus && editedStartCol <= map.Hapus && editedEndCol >= map.Hapus) {
    setraApplyDeleteStateForRows_(rowStart, rowEnd);
    return;
  }

  if (map.shipment_code && editedStartCol <= map.shipment_code && editedEndCol >= map.shipment_code) {
    for (let row = rowStart; row <= rowEnd; row += 1) {
      setraValidateShipmentCodeCell_(sheet.getRange(row, map.shipment_code));
    }
  }

  setraHydrateShipmentRows_(rowStart, rowEnd);
  setraMarkDirtyRowsForEdit_(sheet, e.range, SETRA.BUSINESS_HEADERS.SHIPMENTS);
}

function setraMarkDirtyRowsForEdit_(sheet, range, businessHeaders) {
  const headers = setraGetHeaders_(sheet);
  const map = setraGetHeaderMap_(sheet);
  if (!map.__sync_action || !map.__sync_status || !map.__sync_snapshot) return;

  const editedStartCol = range.getColumn();
  const editedEndCol = range.getLastColumn();
  const businessCols = businessHeaders.map(function (header) { return map[header]; }).filter(Boolean);
  const touchesBusiness = businessCols.some(function (col) { return col >= editedStartCol && col <= editedEndCol; });
  if (!touchesBusiness) return;

  const rowStart = Math.max(range.getRow(), SETRA.DATA_START_ROW);
  const rowEnd = range.getLastRow();
  const rowCount = rowEnd - rowStart + 1;
  const values = sheet.getRange(rowStart, 1, rowCount, headers.length).getValues();

  const actions = [];
  const statuses = [];
  const messages = map.__sync_message ? [] : null;

  values.forEach(function (rowValues) {
    const obj = {};
    headers.forEach(function (header, idx) { if (header) obj[header] = rowValues[idx]; });
    const isBlank = setraIsBlankBusinessRow_(obj, businessHeaders);
    const oldSnapshot = setraNormalizeText_(rowValues[map.__sync_snapshot - 1]);
    const currentSnapshot = setraBuildSnapshot_(obj, businessHeaders);
    const oldAction = setraNormalizeText_(rowValues[map.__sync_action - 1]);

    if (isBlank) {
      actions.push(['']);
      statuses.push(['']);
      if (messages) messages.push(['']);
    } else if (!oldSnapshot || currentSnapshot !== oldSnapshot) {
      actions.push([oldAction === SETRA.SYNC_ACTION.DELETE ? SETRA.SYNC_ACTION.DELETE : SETRA.SYNC_ACTION.UPSERT]);
      statuses.push([SETRA.SYNC_STATUS.PENDING]);
      if (messages) messages.push(['Data berubah menunggu sync']);
    } else {
      actions.push([SETRA.SYNC_ACTION.SKIP]);
      statuses.push([SETRA.SYNC_STATUS.SYNCED]);
      if (messages) messages.push(['']);
    }
  });

  sheet.getRange(rowStart, map.__sync_action, rowCount, 1).setValues(actions);
  sheet.getRange(rowStart, map.__sync_status, rowCount, 1).setValues(statuses);
  if (messages && map.__sync_message) sheet.getRange(rowStart, map.__sync_message, rowCount, 1).setValues(messages);
}

function setraHydrateShipmentRows_(rowStart, rowEnd) {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const map = setraGetHeaderMap_(sheet);
  const usersByName = setraBuildUsersByNameIndex_();
  const rowCount = rowEnd - rowStart + 1;
  const values = sheet.getRange(rowStart, 1, rowCount, sheet.getLastColumn()).getValues();

  for (let i = 0; i < values.length; i += 1) {
    const rowValues = values[i];
    const rowNumber = rowStart + i;
    const statusKerja = setraNormalizeKey_(rowValues[(map.status_kerja || 0) - 1]);
    const isFreelance = statusKerja === 'freelance';
    const namaLengkap = setraNormalizeText_(rowValues[(map.nama_lengkap || 0) - 1]);
    const jumlahToko = Number(rowValues[(map.jumlah_toko || 0) - 1] || 0);
    const terkirim = Number(rowValues[(map.terkirim || 0) - 1] || 0);
    const shipmentCode = setraNormalizeText_(rowValues[(map.shipment_code || 0) - 1]);

    if (map.area_id) sheet.getRange(rowNumber, map.area_id).setValue(setraGetAreaId_());
    if (map.__is_freelance) sheet.getRange(rowNumber, map.__is_freelance).setValue(isFreelance ? true : false);
    if (map.__shipment_code_type) sheet.getRange(rowNumber, map.__shipment_code_type).setValue(shipmentCode ? (/^\d{10}$/.test(shipmentCode) ? 'AKTIF' : 'NON_AKTIF') : '');

    if (!isFreelance && namaLengkap && usersByName[namaLengkap.toLowerCase()]) {
      const user = usersByName[namaLengkap.toLowerCase()];
      if (map.nik_kerja && !setraNormalizeText_(sheet.getRange(rowNumber, map.nik_kerja).getValue())) sheet.getRange(rowNumber, map.nik_kerja).setValue(user.nik_kerja);
      if (map.__user_id) sheet.getRange(rowNumber, map.__user_id).setValue(user.user_id || '');
      if (map.__nik_kerja) sheet.getRange(rowNumber, map.__nik_kerja).setValue(user.nik_kerja || '');
    }

    if (map.gagal && (rowValues[(map.jumlah_toko || 0) - 1] !== '' || rowValues[(map.terkirim || 0) - 1] !== '')) {
      sheet.getRange(rowNumber, map.gagal).setValue(Math.max(jumlahToko - terkirim, 0));
    }
  }
}

function setraBuildUsersByNameIndex_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.USERS);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);
  const index = {};
  if (lastRow < SETRA.DATA_START_ROW || !map.nama_lengkap) return index;

  const values = sheet.getRange(SETRA.DATA_START_ROW, 1, lastRow - SETRA.DATA_START_ROW + 1, sheet.getLastColumn()).getValues();
  values.forEach(function (row) {
    const name = setraNormalizeText_(row[map.nama_lengkap - 1]);
    if (!name) return;
    index[name.toLowerCase()] = {
      user_id: map.user_id ? setraNormalizeText_(row[map.user_id - 1]) : '',
      nik_kerja: map.nik_kerja ? setraNormalizeText_(row[map.nik_kerja - 1]) : '',
    };
  });
  return index;
}

function setraValidateShipmentCodeCell_(cell) {
  const value = setraNormalizeText_(cell.getDisplayValue());

  cell.setNumberFormat('@');

  if (!value) {
    setraClearCellError_(cell);
    cell.setDataValidation(setraBuildDropdownRule_(SETRA.SHIPMENT_STATUS));
    return true;
  }

  if (/^\d{10}$/.test(value)) {
    setraClearCellError_(cell);
    cell.clearDataValidations();
    return true;
  }

  if (SETRA.SHIPMENT_STATUS.indexOf(value) >= 0) {
    setraClearCellError_(cell);
    cell.setDataValidation(setraBuildDropdownRule_(SETRA.SHIPMENT_STATUS));
    return true;
  }

  cell.clearContent();
  setraSetCellError_(cell, 'shipment_code harus 10 digit angka atau pilih status nonaktif dari dropdown. Teks AKTIF tidak dipakai.');
  setraGetSpreadsheet_().toast('shipment_code tidak valid. Gunakan 10 digit angka atau status nonaktif.', 'Input ditolak', 5);
  return false;
}

function setraApplyShipmentCodeDropdownForRange_(range) {
  const values = range.getDisplayValues();
  const rule = setraBuildDropdownRule_(SETRA.SHIPMENT_STATUS);
  for (let i = 0; i < values.length; i += 1) {
    const cell = range.getCell(i + 1, 1);
    const value = setraNormalizeText_(values[i][0]);
    if (!value || SETRA.SHIPMENT_STATUS.indexOf(value) >= 0) cell.setDataValidation(rule);
    if (/^\d{10}$/.test(value)) cell.clearDataValidations();
  }
}

function setraApplyDeleteStateForRows_(rowStart, rowEnd) {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const map = setraGetHeaderMap_(sheet);
  if (!map.Hapus) return;

  const rowCount = rowEnd - rowStart + 1;
  const checkedValues = sheet.getRange(rowStart, map.Hapus, rowCount, 1).getValues();

  for (let i = 0; i < rowCount; i += 1) {
    const row = rowStart + i;
    const checked = checkedValues[i][0] === true;
    if (checked) {
      if (map.__sync_action) sheet.getRange(row, map.__sync_action).setValue(SETRA.SYNC_ACTION.DELETE);
      if (map.__sync_status) sheet.getRange(row, map.__sync_status).setValue(SETRA.SYNC_STATUS.PENDING);
      if (map.__sync_message) sheet.getRange(row, map.__sync_message).setValue('Data ditandai untuk dihapus');
      sheet.getRange(row, 1, 1, sheet.getLastColumn()).setBackground(SETRA_SHIPMENTS.DELETE_CHECKED_BG).setFontColor(SETRA_SHIPMENTS.DELETE_CHECKED_FG);
    } else {
      sheet.getRange(row, 1, 1, sheet.getLastColumn()).setBackground(null).setFontColor(null);
      setraMarkDirtyRowsForEdit_(sheet, sheet.getRange(row, 1, 1, sheet.getLastColumn()), SETRA.BUSINESS_HEADERS.SHIPMENTS);
    }
  }
}

function setraUpdateShipmentDeleteColors_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);
  if (lastRow < SETRA.DATA_START_ROW || !map.Hapus) return;

  const rowCount = lastRow - SETRA.DATA_START_ROW + 1;
  const width = sheet.getLastColumn();
  const checkedValues = sheet.getRange(SETRA.DATA_START_ROW, map.Hapus, rowCount, 1).getValues();
  const checkedRows = [];

  checkedValues.forEach(function (row, index) {
    if (row[0] === true) checkedRows.push(SETRA.DATA_START_ROW + index);
  });

  setraColorShipmentRowsInGroups_(sheet, checkedRows, width, SETRA_SHIPMENTS.DELETE_CHECKED_BG, SETRA_SHIPMENTS.DELETE_CHECKED_FG);
}

function setraColorShipmentRowsInGroups_(sheet, rows, width, background, fontColor) {
  if (!rows || rows.length === 0) return;

  rows.sort(function (a, b) { return a - b; });
  let startRow = rows[0];
  let previousRow = rows[0];

  for (let i = 1; i <= rows.length; i += 1) {
    const row = rows[i];
    if (row === previousRow + 1) {
      previousRow = row;
      continue;
    }

    sheet.getRange(startRow, 1, previousRow - startRow + 1, width)
      .setBackground(background)
      .setFontColor(fontColor);

    startRow = row;
    previousRow = row;
  }
}


function setraShipmentsUpdating() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    SpreadsheetApp.getUi().alert('Setra sedang menjalankan proses lain. Coba lagi setelah proses sebelumnya selesai.');
    return;
  }

  try {
    const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
    setraAssertHeaders_(sheet, SETRA.REQUIRED_HEADERS.SHIPMENTS);

    const removed = setraRemoveDeletedDbShipmentsBatch_();
    const cursor = setraGetConfigValue_(SETRA.CONFIG_KEYS.SHIPMENTS_UPDATE_CURSOR, '');
    const lastFetchAt = setraGetConfigValue_(SETRA.CONFIG_KEYS.SHIPMENTS_UPDATE_LAST_FETCH_AT, '');

    const response = setraGetJson_(SETRA.ENDPOINTS.SHIPMENTS_PULL, {
      area_id: setraGetAreaId_(),
      spreadsheet_id: setraGetSpreadsheetId_(),
      updated_after: cursor ? '' : lastFetchAt,
      cursor: cursor,
      limit: SETRA.MAX_BATCH_ROWS,
    });

    const rows = Array.isArray(response.rows) ? response.rows : [];
    const counts = setraMergePulledShipments_(rows);
    const nextCursor = String(response.next_cursor || '');

    if (nextCursor) {
      setraSetConfigValue_(SETRA.CONFIG_KEYS.SHIPMENTS_UPDATE_CURSOR, nextCursor, 'cursor', 'Cursor lanjutan Updating shipments DB -> Sheet.');
      setraSetConfigValue_(SETRA.CONFIG_KEYS.SHIPMENTS_UPDATE_HAS_MORE, 'TRUE', 'boolean', 'Masih ada data DB yang belum ditarik.');
    } else {
      setraSetConfigValue_(SETRA.CONFIG_KEYS.SHIPMENTS_UPDATE_CURSOR, '', 'cursor', 'Cursor lanjutan Updating shipments DB -> Sheet.');
      setraSetConfigValue_(SETRA.CONFIG_KEYS.SHIPMENTS_UPDATE_LAST_FETCH_AT, response.fetched_at || setraNowIso_(), 'datetime', 'Checkpoint terakhir Updating shipments.');
      setraSetConfigValue_(SETRA.CONFIG_KEYS.SHIPMENTS_UPDATE_HAS_MORE, 'FALSE', 'boolean', 'Tidak ada sisa data DB pada batch ini.');
    }

    setraAppendSyncLog_(SETRA.SHEETS.SHIPMENTS, 'updating', 'db_to_sheet', rows.length, rows.length, 0, 'SUCCESS', response.message || 'Shipments Updating selesai');

    setraShowResultDialog_('Shipments Updating', [
      ['Data DB diterima', rows.length],
      ['Baris baru di spreadsheet', counts.created],
      ['Baris diperbarui', counts.updated],
      ['Baris konflik/lokal pending', counts.conflict],
      ['Shipment ID hilang dari DB dihapus dari sheet', removed],
      ['Masih ada batch berikutnya', nextCursor ? 'YA' : 'TIDAK'],
    ], rows.length === 0 && removed === 0 ? 'Tidak ada data baru dari database.' : 'Updating selesai. Klik lagi untuk mengambil batch berikutnya jika masih ada.');
  } catch (error) {
    setraAppendSyncLog_(SETRA.SHEETS.SHIPMENTS, 'updating', 'db_to_sheet', 0, 0, 1, 'FAILED', error.message || String(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function setraMergePulledShipments_(rows) {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const headers = setraGetHeaders_(sheet);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);
  const idToRow = {};
  const updates = [];
  const appends = [];
  let created = 0;
  let updated = 0;
  let conflict = 0;

  if (lastRow >= SETRA.DATA_START_ROW && map.__shipment_id) {
    const ids = sheet.getRange(SETRA.DATA_START_ROW, map.__shipment_id, lastRow - SETRA.DATA_START_ROW + 1, 1).getValues();
    ids.forEach(function (row, index) {
      const id = setraNormalizeText_(row[0]);
      if (id) idToRow[id] = SETRA.DATA_START_ROW + index;
    });
  }

  rows.forEach(function (row) {
    const id = setraNormalizeText_(row.__shipment_id);
    if (!id) return;

    const targetRow = idToRow[id];
    const line = headers.map(function (header) { return header ? setraValueForSheet_(header, row[header]) : ''; });
    if (map.__sync_action) line[map.__sync_action - 1] = SETRA.SYNC_ACTION.SKIP;
    if (map.__sync_status) line[map.__sync_status - 1] = SETRA.SYNC_STATUS.SYNCED;
    if (map.__sync_message) line[map.__sync_message - 1] = '';
    if (map.__last_synced_at) line[map.__last_synced_at - 1] = setraNowIso_();
    if (map.__sync_snapshot) line[map.__sync_snapshot - 1] = setraBuildSnapshot_(row, SETRA.BUSINESS_HEADERS.SHIPMENTS);
    if (map.Hapus) line[map.Hapus - 1] = false;

    if (targetRow) {
      const currentAction = map.__sync_action ? setraNormalizeText_(sheet.getRange(targetRow, map.__sync_action).getValue()).toUpperCase() : '';
      const currentStatus = map.__sync_status ? setraNormalizeText_(sheet.getRange(targetRow, map.__sync_status).getValue()).toUpperCase() : '';
      if ((currentAction === SETRA.SYNC_ACTION.UPSERT || currentAction === SETRA.SYNC_ACTION.DELETE) && (currentStatus === SETRA.SYNC_STATUS.PENDING || currentStatus === SETRA.SYNC_STATUS.ERROR)) {
        conflict += 1;
        return;
      }
      updates.push({ rowNumber: targetRow, values: line });
      updated += 1;
    } else {
      appends.push(line);
      created += 1;
    }
  });

  setraWriteShipmentUpdatesInGroups_(sheet, updates, headers.length);

  if (appends.length > 0) {
    const startRow = Math.max(sheet.getLastRow() + 1, SETRA.DATA_START_ROW);
    sheet.getRange(startRow, 1, appends.length, headers.length).setValues(appends).setBackground(null).setFontColor(null);
    setraFormatShipmentRows_(sheet, map, startRow, appends.length);
  }

  setraFinalizeShipmentsAfterDataChange_();
  return { created: created, updated: updated, conflict: conflict };
}

function setraWriteShipmentUpdatesInGroups_(sheet, updates, width) {
  if (!updates || updates.length === 0) return;

  updates.sort(function (a, b) { return a.rowNumber - b.rowNumber; });

  let groupStart = updates[0].rowNumber;
  let groupValues = [updates[0].values];
  let previousRow = updates[0].rowNumber;

  for (let i = 1; i < updates.length; i += 1) {
    const item = updates[i];
    if (item.rowNumber === previousRow + 1) {
      groupValues.push(item.values);
    } else {
      sheet.getRange(groupStart, 1, groupValues.length, width).setValues(groupValues).setBackground(null).setFontColor(null);
      groupStart = item.rowNumber;
      groupValues = [item.values];
    }
    previousRow = item.rowNumber;
  }

  sheet.getRange(groupStart, 1, groupValues.length, width).setValues(groupValues).setBackground(null).setFontColor(null);
}

function setraRemoveDeletedDbShipmentsBatch_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);
  if (lastRow < SETRA.DATA_START_ROW || !map.__shipment_id) return 0;

  let cursorRow = Number(setraGetConfigValue_(SETRA.CONFIG_KEYS.SHIPMENTS_EXISTENCE_ROW_CURSOR, String(SETRA.DATA_START_ROW)) || SETRA.DATA_START_ROW);
  if (!Number.isFinite(cursorRow) || cursorRow < SETRA.DATA_START_ROW || cursorRow > lastRow) cursorRow = SETRA.DATA_START_ROW;

  const maxRow = Math.min(lastRow, cursorRow + SETRA.MAX_BATCH_ROWS - 1);
  const rowCount = maxRow - cursorRow + 1;
  const values = sheet.getRange(cursorRow, map.__shipment_id, rowCount, 1).getValues();
  const shipmentIds = [];
  const rowById = {};

  values.forEach(function (row, index) {
    const id = setraNormalizeText_(row[0]);
    if (id) {
      shipmentIds.push(id);
      rowById[id] = cursorRow + index;
    }
  });

  let nextCursor = maxRow + 1;
  if (nextCursor > lastRow) nextCursor = SETRA.DATA_START_ROW;
  setraSetConfigValue_(SETRA.CONFIG_KEYS.SHIPMENTS_EXISTENCE_ROW_CURSOR, String(nextCursor), 'integer', 'Cursor cek shipment_id yang sudah hilang dari database.');

  if (shipmentIds.length === 0) return 0;

  const response = setraPostJson_(SETRA.ENDPOINTS.SHIPMENTS_EXISTENCE, Object.assign(setraBuildBasePayload_(SETRA.SHEETS.SHIPMENTS, 'existence_check'), { shipment_ids: shipmentIds }));
  const missingIds = Array.isArray(response.missing_ids) ? response.missing_ids.map(String) : [];
  const rowsToDelete = missingIds.map(function (id) { return rowById[id]; }).filter(Boolean);
  setraDeleteRowsInGroups_(sheet, rowsToDelete);
  return rowsToDelete.length;
}

function setraShipmentsFetching() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    SpreadsheetApp.getUi().alert('Setra sedang menjalankan proses lain. Coba lagi setelah proses sebelumnya selesai.');
    return;
  }

  try {
    const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
    setraAssertHeaders_(sheet, SETRA.REQUIRED_HEADERS.SHIPMENTS);
    const lastRow = setraGetLastDataRow_(sheet);
    if (lastRow >= SETRA.DATA_START_ROW) setraHydrateShipmentRows_(SETRA.DATA_START_ROW, lastRow);
    setraMarkDirtyRowsForSheet_(SETRA.SHEETS.SHIPMENTS, SETRA.BUSINESS_HEADERS.SHIPMENTS);

    const rows = setraReadRowsAsObjects_(SETRA.SHEETS.SHIPMENTS, SETRA.BUSINESS_HEADERS.SHIPMENTS, {
      pendingOnly: true,
      excludeDelete: true,
      limit: SETRA.MAX_BATCH_ROWS,
    });

    if (rows.length === 0) {
      setraShowResultDialog_('Shipments Fetching', [['Baris pending', 0]], 'Tidak ada perubahan shipment yang perlu dikirim ke database.');
      return;
    }

    const response = setraPostJson_(SETRA.ENDPOINTS.SHIPMENTS_PUSH, Object.assign(setraBuildBasePayload_(SETRA.SHEETS.SHIPMENTS, 'fetching'), { rows: rows }));
    const results = Array.isArray(response.results) ? response.results : [];
    setraApplyPushResults_(SETRA.SHEETS.SHIPMENTS, results, SETRA.BUSINESS_HEADERS.SHIPMENTS);
    setraFinalizeShipmentsAfterDataChange_();

    const success = Number(response.rows_success || 0);
    const failed = Number(response.rows_failed || 0);
    setraAppendSyncLog_(SETRA.SHEETS.SHIPMENTS, 'fetching', 'sheet_to_db', rows.length, success, failed, response.status || 'SUCCESS', response.message || 'Shipments Fetching selesai');

    setraShowResultDialog_('Shipments Fetching', [
      ['Baris dikirim', rows.length],
      ['Berhasil', success],
      ['Gagal', failed],
      ['Batas per klik', SETRA.MAX_BATCH_ROWS],
    ], failed > 0 ? 'Sebagian baris gagal. Cek kolom teknis __sync_message.' : 'Fetching selesai. Data spreadsheet berhasil dikirim ke database.');
  } catch (error) {
    setraAppendSyncLog_(SETRA.SHEETS.SHIPMENTS, 'fetching', 'sheet_to_db', 0, 0, 1, 'FAILED', error.message || String(error));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function setraShipmentsDeleting() {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const map = setraGetHeaderMap_(sheet);
  if (!map.Hapus || !map.__shipment_id) throw new Error('Kolom Hapus atau __shipment_id tidak ditemukan.');

  const selected = setraGetCheckedShipmentRows_();
  if (selected.length === 0) {
    SpreadsheetApp.getUi().alert('Tidak ada baris shipment yang dicentang.');
    return;
  }

  const withoutId = selected.filter(function (item) { return !item.shipment_id; });
  if (withoutId.length > 0) {
    SpreadsheetApp.getUi().alert('Ada ' + withoutId.length + ' baris dicentang tetapi belum punya __shipment_id. Jalankan Shipments > Updating terlebih dahulu atau kosongkan centang.');
    return;
  }

  const confirm = SpreadsheetApp.getUi().alert(
    'Hapus permanen shipment',
    'Anda akan menghapus ' + selected.length + ' data shipment dari database dan spreadsheet. Lanjutkan?',
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );
  if (confirm !== SpreadsheetApp.getUi().Button.YES) return;

  const shipmentIds = selected.map(function (item) { return item.shipment_id; });
  const rowById = {};
  selected.forEach(function (item) { rowById[item.shipment_id] = item.row_number; });

  const response = setraPostJson_(SETRA.ENDPOINTS.SHIPMENTS_BULK_DELETE, Object.assign(setraBuildBasePayload_(SETRA.SHEETS.SHIPMENTS, 'deleting'), { shipment_ids: shipmentIds }));
  const deletedIds = Array.isArray(response.deleted_ids) ? response.deleted_ids.map(String) : [];
  const failedItems = Array.isArray(response.failed_items) ? response.failed_items : [];

  failedItems.forEach(function (item) {
    const rowNumber = rowById[String(item.shipment_id || '')];
    if (rowNumber && map.__sync_message) sheet.getRange(rowNumber, map.__sync_message).setValue(item.message || 'Gagal hapus shipment');
    if (rowNumber && map.__sync_status) sheet.getRange(rowNumber, map.__sync_status).setValue(SETRA.SYNC_STATUS.ERROR);
  });

  const rowsToDelete = deletedIds.map(function (id) { return rowById[id]; }).filter(Boolean);
  setraDeleteRowsInGroups_(sheet, rowsToDelete);
  setraFinalizeShipmentsAfterDataChange_();

  setraAppendSyncLog_(SETRA.SHEETS.SHIPMENTS, 'deleting', 'sheet_and_db', shipmentIds.length, deletedIds.length, failedItems.length, response.status || 'SUCCESS', response.message || 'Deleting selesai');
  setraShowResultDialog_('Shipments Deleting', [
    ['Dipilih', selected.length],
    ['Berhasil dihapus', deletedIds.length],
    ['Gagal', failedItems.length],
  ], failedItems.length > 0 ? 'Sebagian data gagal dihapus. Cek __sync_message.' : 'Data berhasil dihapus dari database dan spreadsheet.');
}

function setraGetCheckedShipmentRows_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.SHIPMENTS);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);
  if (lastRow < SETRA.DATA_START_ROW || !map.Hapus || !map.__shipment_id) return [];

  const width = sheet.getLastColumn();
  const values = sheet.getRange(SETRA.DATA_START_ROW, 1, lastRow - SETRA.DATA_START_ROW + 1, width).getValues();
  const rows = [];
  values.forEach(function (row, index) {
    if (row[map.Hapus - 1] === true) {
      rows.push({
        row_number: SETRA.DATA_START_ROW + index,
        shipment_id: setraNormalizeText_(row[map.__shipment_id - 1]),
      });
    }
  });
  return rows;
}
