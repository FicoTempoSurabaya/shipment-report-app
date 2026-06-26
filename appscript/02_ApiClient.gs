/**
 * SETRA - Spreadsheet Database Sync
 * File: 02_ApiClient.gs
 * Scope: HTTP client ke backend.
 */

function setraBuildApiUrl_(path, queryParams) {
  const cleanPath = path.charAt(0) === '/' ? path : '/' + path;
  let url = setraGetApiBaseUrl_() + cleanPath;

  if (queryParams && Object.keys(queryParams).length > 0) {
    const query = Object.keys(queryParams)
      .filter(function (key) { return queryParams[key] !== undefined && queryParams[key] !== null && queryParams[key] !== ''; })
      .map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(String(queryParams[key])); })
      .join('&');
    if (query) url += '?' + query;
  }

  return url;
}

function setraBuildApiHeaders_() {
  return {
    'Content-Type': 'application/json',
    'X-Setra-Webhook-Secret': setraGetWebhookSecret_(),
    'X-Setra-Spreadsheet-Id': setraGetSpreadsheetId_(),
    'X-Setra-Area-Id': setraGetAreaId_(),
    'X-Setra-User-Email': setraGetCurrentUserEmail_(),
  };
}

function setraBuildBasePayload_(sheetName, operation) {
  return {
    source: 'google_sheets',
    operation: operation,
    sheet_name: sheetName,
    area_id: setraGetAreaId_(),
    area_code: setraGetAreaCode_(),
    spreadsheet_id: setraGetSpreadsheetId_(),
    spreadsheet_url: setraGetSpreadsheet_().getUrl(),
    user_email: setraGetCurrentUserEmail_(),
  };
}

function setraGetJson_(path, queryParams) {
  const response = UrlFetchApp.fetch(setraBuildApiUrl_(path, queryParams), {
    method: 'get',
    headers: setraBuildApiHeaders_(),
    muteHttpExceptions: true,
  });
  return setraParseApiResponse_(response, 'GET ' + path);
}

function setraPostJson_(path, payload) {
  const response = UrlFetchApp.fetch(setraBuildApiUrl_(path), {
    method: 'post',
    contentType: 'application/json',
    headers: setraBuildApiHeaders_(),
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true,
  });
  return setraParseApiResponse_(response, 'POST ' + path);
}

function setraParseApiResponse_(response, operationLabel) {
  const statusCode = response.getResponseCode();
  const text = response.getContentText() || '';
  let json = {};

  try {
    json = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(operationLabel + ' gagal. Response backend bukan JSON. HTTP ' + statusCode + ': ' + text.slice(0, 500));
  }

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(operationLabel + ' gagal. HTTP ' + statusCode + ': ' + (json.message || json.error || text));
  }

  if (json && json.ok === false) {
    throw new Error(operationLabel + ' gagal: ' + (json.message || json.error || 'Backend ok=false'));
  }

  return json;
}
