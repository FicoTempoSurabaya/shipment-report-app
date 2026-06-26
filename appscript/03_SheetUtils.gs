/**
 * SETRA - Spreadsheet Database Sync
 * File: 03_SheetUtils.gs
 * Scope: helper sheet, snapshot, proteksi, log, dan dialog.
 */

function setraGetHeaders_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(SETRA.HEADER_ROW, 1, 1, lastColumn).getValues()[0].map(function (header) {
    return setraNormalizeText_(header);
  });
}

function setraGetHeaderMap_(sheet) {
  const headers = setraGetHeaders_(sheet);
  const map = {};
  headers.forEach(function (header, index) {
    if (header) map[header] = index + 1;
  });
  return map;
}

function setraAssertHeaders_(sheet, requiredHeaders) {
  const map = setraGetHeaderMap_(sheet);
  const missing = requiredHeaders.filter(function (header) { return !map[header]; });
  if (missing.length > 0) throw new Error('Sheet ' + sheet.getName() + ' kurang header: ' + missing.join(', '));
  return map;
}

function setraGetLastDataRow_(sheet) {
  return sheet.getLastRow();
}

function setraIsBlankBusinessRow_(rowObject, businessHeaders) {
  return businessHeaders.every(function (header) {
    return !setraNormalizeText_(rowObject[header]);
  });
}

function setraNormalizeForSnapshot_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, setraGetTimezone_(), 'yyyy-MM-dd');
  }
  if (value === true) return 'TRUE';
  if (value === false) return 'FALSE';
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

function setraBuildSnapshot_(rowObject, businessHeaders) {
  return businessHeaders.map(function (header) {
    return setraNormalizeForSnapshot_(rowObject[header]);
  }).join('|');
}

function setraBuildSnapshotFromRowValues_(headers, rowValues, businessHeaders) {
  const obj = {};
  headers.forEach(function (header, index) {
    if (header) obj[header] = rowValues[index];
  });
  return setraBuildSnapshot_(obj, businessHeaders);
}

function setraReadRowsAsObjects_(sheetName, businessHeaders, options) {
  options = options || {};
  const sheet = setraGetSheet_(sheetName);
  const headers = setraGetHeaders_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);
  if (lastRow < SETRA.DATA_START_ROW) return [];

  const rowCount = lastRow - SETRA.DATA_START_ROW + 1;
  const values = sheet.getRange(SETRA.DATA_START_ROW, 1, rowCount, headers.length).getValues();
  const rows = [];

  values.forEach(function (rowValues, index) {
    const rowNumber = SETRA.DATA_START_ROW + index;
    const obj = { __row_number: rowNumber };
    headers.forEach(function (header, colIndex) {
      if (!header) return;
      obj[header] = rowValues[colIndex];
    });

    if (options.pendingOnly) {
      const action = setraNormalizeText_(obj.__sync_action).toUpperCase();
      const status = setraNormalizeText_(obj.__sync_status).toUpperCase();
      const validAction = action === SETRA.SYNC_ACTION.UPSERT || action === SETRA.SYNC_ACTION.DELETE;
      const validStatus = status === SETRA.SYNC_STATUS.PENDING || status === SETRA.SYNC_STATUS.ERROR;
      if (!validAction || !validStatus) return;
    }

    if (options.excludeDelete && setraNormalizeText_(obj.__sync_action).toUpperCase() === SETRA.SYNC_ACTION.DELETE) return;
    if (businessHeaders && setraIsBlankBusinessRow_(obj, businessHeaders)) return;
    rows.push(obj);
  });

  if (options.limit && rows.length > options.limit) return rows.slice(0, options.limit);
  return rows;
}

function setraClearAndWriteObjects_(sheetName, rows, requiredHeaders, businessHeaders) {
  const sheet = setraGetSheet_(sheetName);
  const headers = setraGetHeaders_(sheet);
  const map = setraAssertHeaders_(sheet, requiredHeaders);
  const lastRow = sheet.getLastRow();
  const width = headers.length;

  if (lastRow >= SETRA.DATA_START_ROW) {
    sheet.getRange(SETRA.DATA_START_ROW, 1, lastRow - SETRA.DATA_START_ROW + 1, width).clearContent().clearNote().setBackground(null);
  }

  if (!rows || rows.length === 0) return { created: 0, updated: 0 };

  const values = rows.map(function (row) {
    const line = headers.map(function (header) {
      return header ? setraValueForSheet_(header, row[header]) : '';
    });
    if (map.__sync_action) line[map.__sync_action - 1] = SETRA.SYNC_ACTION.SKIP;
    if (map.__sync_status) line[map.__sync_status - 1] = SETRA.SYNC_STATUS.SYNCED;
    if (map.__last_synced_at) line[map.__last_synced_at - 1] = setraNowIso_();
    if (map.__sync_snapshot && businessHeaders) {
      const obj = {};
      headers.forEach(function (header, idx) { if (header) obj[header] = line[idx]; });
      line[map.__sync_snapshot - 1] = setraBuildSnapshot_(obj, businessHeaders);
    }
    return line;
  });

  sheet.getRange(SETRA.DATA_START_ROW, 1, values.length, width).setValues(values);
  return { created: values.length, updated: 0 };
}

function setraValueForSheet_(header, value) {
  if (value === null || value === undefined) return '';
  if (header.indexOf('tanggal_') === 0 && value instanceof Date) return Utilities.formatDate(value, setraGetTimezone_(), 'yyyy-MM-dd');
  return value;
}

function setraApplyPushResults_(sheetName, results, businessHeaders) {
  if (!Array.isArray(results) || results.length === 0) return;
  const sheet = setraGetSheet_(sheetName);
  const headers = setraGetHeaders_(sheet);
  const map = setraGetHeaderMap_(sheet);
  const syncedAt = setraNowIso_();

  results.forEach(function (item) {
    const rowNumber = Number(item.row_number || 0);
    if (!rowNumber || rowNumber < SETRA.DATA_START_ROW) return;

    const status = String(item.status || '').toUpperCase();
    const values = item.values || {};

    Object.keys(values).forEach(function (header) {
      if (!map[header]) return;
      sheet.getRange(rowNumber, map[header]).setValue(setraValueForSheet_(header, values[header]));
    });

    if (map.__sync_message) sheet.getRange(rowNumber, map.__sync_message).setValue(item.message || '');
    if (map.__last_synced_at) sheet.getRange(rowNumber, map.__last_synced_at).setValue(syncedAt);

    if (status === SETRA.SYNC_STATUS.SYNCED) {
      if (map.__sync_action) sheet.getRange(rowNumber, map.__sync_action).setValue(SETRA.SYNC_ACTION.SKIP);
      if (map.__sync_status) sheet.getRange(rowNumber, map.__sync_status).setValue(SETRA.SYNC_STATUS.SYNCED);
      if (map.__sync_snapshot && businessHeaders) {
        const rowValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
        sheet.getRange(rowNumber, map.__sync_snapshot).setValue(setraBuildSnapshotFromRowValues_(headers, rowValues, businessHeaders));
      }
      sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).setBackground(null);
    } else if (status === SETRA.SYNC_STATUS.ERROR) {
      if (map.__sync_status) sheet.getRange(rowNumber, map.__sync_status).setValue(SETRA.SYNC_STATUS.ERROR);
      if (map.__sync_action && !setraNormalizeText_(sheet.getRange(rowNumber, map.__sync_action).getValue())) {
        sheet.getRange(rowNumber, map.__sync_action).setValue(SETRA.SYNC_ACTION.UPSERT);
      }
    }
  });
}

function setraAppendSyncLog_(sheetName, operation, direction, total, success, failed, status, message) {
  const sheet = setraGetSheet_(SETRA.SHEETS.SYNC_LOG);
  sheet.appendRow([
    Utilities.getUuid(),
    setraNowIso_(),
    setraGetCurrentUserEmail_(),
    sheetName,
    operation,
    direction,
    Number(total || 0),
    Number(success || 0),
    Number(failed || 0),
    status || '',
    message || '',
  ]);
}

function setraShowResultDialog_(title, rows, message) {
  let html = '<!doctype html><html><head><base target="_top"><style>body{font-family:Arial,sans-serif;margin:0;padding:18px;color:#111827}.msg{font-size:13px;margin-bottom:12px;line-height:1.45}table{border-collapse:collapse;width:100%;font-size:13px}td{border:1px solid #e5e7eb;padding:8px}.k{font-weight:700;background:#f9fafb;width:58%}button{margin-top:14px;padding:8px 14px;border:0;border-radius:6px;background:#111827;color:white;font-weight:700;cursor:pointer}</style></head><body>';
  html += '<div class="msg">' + setraEscapeHtml_(message || '') + '</div><table>';
  (rows || []).forEach(function (row) {
    html += '<tr><td class="k">' + setraEscapeHtml_(row[0]) + '</td><td>' + setraEscapeHtml_(row[1]) + '</td></tr>';
  });
  html += '</table><button onclick="google.script.host.close()">Tutup</button></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(430).setHeight(330), title);
}

function setraEscapeHtml_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setraDeleteRowsInGroups_(sheet, rowNumbers) {
  const rows = Array.from(new Set(rowNumbers || [])).filter(function (row) { return row >= SETRA.DATA_START_ROW; }).sort(function (a, b) { return b - a; });
  if (rows.length === 0) return;

  let groupStart = rows[0];
  let groupEnd = rows[0];

  for (let i = 1; i <= rows.length; i += 1) {
    const row = rows[i];
    if (row === groupEnd - 1) {
      groupEnd = row;
      continue;
    }
    sheet.deleteRows(groupEnd, groupStart - groupEnd + 1);
    groupStart = row;
    groupEnd = row;
  }
}

function setraHideTechnicalColumns_(sheetName, headers) {
  const sheet = setraGetSheet_(sheetName);
  const map = setraGetHeaderMap_(sheet);
  headers.forEach(function (header) {
    if (map[header]) {
      try { sheet.hideColumns(map[header]); } catch (error) {}
    }
  });
}

function setraProtectTechnicalColumns_(sheetName, headers) {
  const sheet = setraGetSheet_(sheetName);
  const map = setraGetHeaderMap_(sheet);
  const superadmins = setraGetSuperadminEmails_();

  headers.forEach(function (header) {
    const col = map[header];
    if (!col) return;
    try {
      const protection = sheet.getRange(1, col, sheet.getMaxRows(), 1).protect().setDescription('Setra technical column: ' + header);
      protection.setWarningOnly(false);
      if (superadmins.length > 0) {
        protection.removeEditors(protection.getEditors());
        protection.addEditors(superadmins);
      }
    } catch (error) {}
  });
}

function setraProtectAreaSheet_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.AREA);
  const superadmins = setraGetSuperadminEmails_();

  try { sheet.hideSheet(); } catch (error) {}

  try {
    const protection = sheet.protect().setDescription('Setra area sheet - superadmin only');
    protection.setWarningOnly(false);
    if (superadmins.length > 0) {
      protection.removeEditors(protection.getEditors());
      protection.addEditors(superadmins);
    }
  } catch (error) {}
}

function setraBuildDropdownRule_(values) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).build();
}

function setraSetCellError_(cell, message) {
  cell.setBackground('#f4cccc');
  cell.setNote(message || 'Input tidak valid.');
}

function setraClearCellError_(cell) {
  cell.setBackground(null);
  cell.clearNote();
}
