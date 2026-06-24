/**
 * SETRA - Shipment Report Spreadsheet Integration
 * File: 03_SheetUtils.gs
 * Scope: helper baca/tulis sheet, header map, format, status sync.
 */

function setraGetHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return [];
  return sheet.getRange(SETRA.HEADER_ROW, 1, 1, lastColumn).getValues()[0].map(function (header) {
    return setraNormalizeText_(header);
  });
}

function setraGetHeaderMap_(sheet) {
  const headers = setraGetHeaders_(sheet);
  const map = {};
  headers.forEach(function (header, index) {
    if (header) {
      map[header] = index + 1;
    }
  });
  return map;
}

function setraAssertHeaders_(sheet, requiredHeaders) {
  const map = setraGetHeaderMap_(sheet);
  const missing = requiredHeaders.filter(function (header) {
    return !map[header];
  });

  if (missing.length > 0) {
    throw new Error('Header wajib belum ada di sheet ' + sheet.getName() + ': ' + missing.join(', '));
  }
}

function setraGetLastDataRow_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < SETRA.DATA_START_ROW) return SETRA.HEADER_ROW;
  return lastRow;
}

function setraReadRowsAsObjects_(sheetName, businessHeaders) {
  const sheet = setraGetSheet_(sheetName);
  const headers = setraGetHeaders_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);

  if (lastRow < SETRA.DATA_START_ROW) {
    return [];
  }

  const rowCount = lastRow - SETRA.DATA_START_ROW + 1;
  const values = sheet.getRange(SETRA.DATA_START_ROW, 1, rowCount, headers.length).getValues();
  const rows = [];

  for (let i = 0; i < values.length; i++) {
    const rowNumber = SETRA.DATA_START_ROW + i;
    const rawValues = values[i];

    if (setraIsBlankBusinessRow_(headers, rawValues, businessHeaders)) {
      continue;
    }

    const obj = { __row_number: rowNumber };
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      if (!header) continue;
      obj[header] = setraNormalizeCellValueForPayload_(rawValues[c], header);
    }
    rows.push(obj);
  }

  return rows;
}

function setraIsBlankBusinessRow_(headers, rowValues, businessHeaders) {
  const checkHeaders = businessHeaders && businessHeaders.length > 0 ? businessHeaders : headers;

  for (let i = 0; i < checkHeaders.length; i++) {
    const header = checkHeaders[i];
    const colIndex = headers.indexOf(header);
    if (colIndex === -1) continue;
    const value = rowValues[colIndex];
    if (value !== '' && value !== null && value !== undefined) {
      return false;
    }
  }

  return true;
}

function setraNormalizeCellValueForPayload_(value, headerName) {
  if (value === null || value === undefined) return '';

  if (setraIsDateOnlyHeader_(headerName)) {
    return setraNormalizeDateOnlyForPayload_(value, headerName);
  }

  if (setraIsTimeOnlyHeader_(headerName)) {
    return setraNormalizeTimeOnlyForPayload_(value, headerName);
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, setraGetTimezone_(), "yyyy-MM-dd'T'HH:mm:ssXXX");
  }

  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;

  return String(value).trim();
}

function setraIsDateOnlyHeader_(headerName) {
  return ['tanggal_shipment', 'tanggal_awal', 'tanggal_akhir', 'tanggal_libur'].indexOf(String(headerName || '')) >= 0;
}

function setraIsTimeOnlyHeader_(headerName) {
  return ['jam_berangkat', 'jam_pulang'].indexOf(String(headerName || '')) >= 0;
}

function setraNormalizeDateOnlyForPayload_(value, headerName) {
  if (value === null || value === undefined || value === '') return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, setraGetTimezone_(), 'yyyy-MM-dd');
  }

  if (typeof value === 'number' && value > 0) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      return Utilities.formatDate(date, setraGetTimezone_(), 'yyyy-MM-dd');
    }
  }

  const text = String(value || '').trim();
  if (!text) return '';

  let match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[T\s].*)?$/);
  if (match) {
    return setraBuildDateOnlyKey_(Number(match[1]), Number(match[2]), Number(match[3]), headerName);
  }

  match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) {
    return setraBuildDateOnlyKey_(Number(match[3]), Number(match[2]), Number(match[1]), headerName);
  }

  throw new Error('Format ' + headerName + ' tidak valid: ' + text + '. Gunakan dd/mm/yyyy.');
}

function setraBuildDateOnlyKey_(year, month, day, headerName) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('Nilai ' + headerName + ' tidak valid.');
  }
  return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function setraNormalizeTimeOnlyForPayload_(value, headerName) {
  if (value === null || value === undefined || value === '') return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, setraGetTimezone_(), 'HH:mm');
  }

  const text = String(value || '').trim();
  if (!text) return '';

  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    throw new Error('Format ' + headerName + ' tidak valid. Gunakan HH:mm.');
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('Nilai ' + headerName + ' tidak valid.');
  }

  return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}

function setraValueForSheet_(headerName, value) {
  if (value === null || value === undefined || value === '') return '';

  if (setraIsDateOnlyHeader_(headerName)) {
    const key = setraNormalizeDateOnlyForPayload_(value, headerName);
    if (!key) return '';
    const parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  return value;
}


function setraClearDataRows_(sheet, columnCount) {
  const maxRows = sheet.getMaxRows();
  if (maxRows < SETRA.DATA_START_ROW) return;
  sheet.getRange(SETRA.DATA_START_ROW, 1, maxRows - SETRA.DATA_START_ROW + 1, columnCount).clearContent();
}

function setraWriteObjectsToSheet_(sheetName, rows) {
  const sheet = setraGetSheet_(sheetName);
  const headers = setraGetHeaders_(sheet);
  const columnCount = headers.length;
  const dataRows = Array.isArray(rows) ? rows : [];

  setraClearDataRows_(sheet, columnCount);

  if (dataRows.length === 0) {
    return;
  }

  const output = dataRows.map(function (row) {
    return headers.map(function (header) {
      if (!header) return '';
      return setraValueForSheet_(header, row[header]);
    });
  });

  sheet.getRange(SETRA.DATA_START_ROW, 1, output.length, columnCount).setValues(output);
}

function setraSetCellByHeader_(sheet, rowNumber, headerMap, headerName, value) {
  const columnNumber = headerMap[headerName];
  if (!columnNumber) return;
  sheet.getRange(rowNumber, columnNumber).setValue(value);
}

function setraGetCellByHeader_(sheet, rowNumber, headerMap, headerName) {
  const columnNumber = headerMap[headerName];
  if (!columnNumber) return '';
  return sheet.getRange(rowNumber, columnNumber).getValue();
}

function setraSetSyncStatus_(sheetName, rowNumber, status, message) {
  const sheet = setraGetSheet_(sheetName);
  const map = setraGetHeaderMap_(sheet);
  setraSetCellByHeader_(sheet, rowNumber, map, '__sync_status', status || '');
  setraSetCellByHeader_(sheet, rowNumber, map, '__sync_message', message || '');
  setraSetCellByHeader_(sheet, rowNumber, map, '__last_synced_at', setraNowIso_());
}

function setraApplyPushResults_(sheetName, results) {
  if (!Array.isArray(results) || results.length === 0) return;

  const sheet = setraGetSheet_(sheetName);
  const map = setraGetHeaderMap_(sheet);

  results.forEach(function (item) {
    const rowNumber = Number(item.row_number || item.__row_number || 0);
    if (!rowNumber || rowNumber < SETRA.DATA_START_ROW) return;

    const status = item.status || item.__sync_status || '';
    const message = item.message || item.__sync_message || '';

    if (map.__sync_status) sheet.getRange(rowNumber, map.__sync_status).setValue(status);
    if (map.__sync_message) sheet.getRange(rowNumber, map.__sync_message).setValue(message);
    if (map.__last_synced_at) sheet.getRange(rowNumber, map.__last_synced_at).setValue(setraNowIso_());

    const values = item.values || item.updated_values || {};
    Object.keys(values).forEach(function (header) {
      if (map[header]) {
        sheet.getRange(rowNumber, map[header]).setValue(setraValueForSheet_(header, values[header]));
      }
    });
  });
}

function setraAppendSyncLog_(sheetName, operation, direction, rowsTotal, rowsSuccess, rowsFailed, status, message) {
  const sheet = setraGetSheet_(SETRA.SHEETS.SYNC_LOG);
  const logId = Utilities.getUuid();

  sheet.appendRow([
    logId,
    setraNowIso_(),
    setraGetCurrentUserEmail_(),
    sheetName,
    operation,
    direction,
    Number(rowsTotal || 0),
    Number(rowsSuccess || 0),
    Number(rowsFailed || 0),
    status || '',
    message || '',
  ]);
}

function setraFormatManagedSheet_(sheetName) {
  const sheet = setraGetSheet_(sheetName);
  const map = setraGetHeaderMap_(sheet);
  const maxRows = Math.max(sheet.getMaxRows() - SETRA.DATA_START_ROW + 1, 1);

  if (map.tanggal_shipment) sheet.getRange(SETRA.DATA_START_ROW, map.tanggal_shipment, maxRows, 1).setNumberFormat('dd/mm/yyyy');
  if (map.tanggal_awal) sheet.getRange(SETRA.DATA_START_ROW, map.tanggal_awal, maxRows, 1).setNumberFormat('dd/mm/yyyy');
  if (map.tanggal_akhir) sheet.getRange(SETRA.DATA_START_ROW, map.tanggal_akhir, maxRows, 1).setNumberFormat('dd/mm/yyyy');
  if (map.jam_berangkat) sheet.getRange(SETRA.DATA_START_ROW, map.jam_berangkat, maxRows, 1).setNumberFormat('hh:mm');
  if (map.jam_pulang) sheet.getRange(SETRA.DATA_START_ROW, map.jam_pulang, maxRows, 1).setNumberFormat('hh:mm');
  if (map.jumlah_toko) sheet.getRange(SETRA.DATA_START_ROW, map.jumlah_toko, maxRows, 1).setNumberFormat('0');
  if (map.terkirim) sheet.getRange(SETRA.DATA_START_ROW, map.terkirim, maxRows, 1).setNumberFormat('0');
  if (map.gagal) sheet.getRange(SETRA.DATA_START_ROW, map.gagal, maxRows, 1).setNumberFormat('0');
}

function setraGetUsersNameMap_() {
  const sheet = setraGetSheet_(SETRA.SHEETS.USERS);
  const headers = setraGetHeaders_(sheet);
  const map = setraGetHeaderMap_(sheet);
  const lastRow = setraGetLastDataRow_(sheet);
  const result = {};

  if (!map.nama_lengkap || !map.nik_kerja || lastRow < SETRA.DATA_START_ROW) {
    return result;
  }

  const values = sheet.getRange(SETRA.DATA_START_ROW, 1, lastRow - SETRA.DATA_START_ROW + 1, headers.length).getValues();

  values.forEach(function (row) {
    const name = setraNormalizeText_(row[map.nama_lengkap - 1]);
    const nik = setraNormalizeText_(row[map.nik_kerja - 1]);
    if (!name || !nik) return;

    const key = setraNormalizeKey_(name);
    if (!result[key]) {
      result[key] = { nik: nik, count: 0 };
    }
    result[key].count += 1;
  });

  return result;
}

function setraResolveNikByName_(name, usersNameMap) {
  const key = setraNormalizeKey_(name);
  if (!key || !usersNameMap[key]) return '';
  if (usersNameMap[key].count !== 1) return '';
  return usersNameMap[key].nik || '';
}

function setraGetRowsArrayFromResponse_(response) {
  if (!response) return [];
  if (Array.isArray(response.rows)) return response.rows;
  if (Array.isArray(response.data)) return response.data;
  if (response.result && Array.isArray(response.result.rows)) return response.result.rows;
  return [];
}

function setraGetResultsArrayFromResponse_(response) {
  if (!response) return [];
  if (Array.isArray(response.results)) return response.results;
  if (Array.isArray(response.row_results)) return response.row_results;
  if (response.result && Array.isArray(response.result.results)) return response.result.results;
  return [];
}
