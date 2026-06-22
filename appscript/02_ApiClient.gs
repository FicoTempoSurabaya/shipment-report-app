/**
 * SETRA - Shipment Report Spreadsheet Integration
 * File: 02_ApiClient.gs
 * Scope: koneksi HTTP ke backend web app.
 */

function setraBuildApiUrl_(path, queryParams) {
  const baseUrl = setraGetApiBaseUrl_();
  const cleanPath = path.charAt(0) === '/' ? path : '/' + path;
  let url = baseUrl + cleanPath;

  if (queryParams && Object.keys(queryParams).length > 0) {
    const query = Object.keys(queryParams)
      .filter(function (key) {
        return queryParams[key] !== undefined && queryParams[key] !== null && queryParams[key] !== '';
      })
      .map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(String(queryParams[key]));
      })
      .join('&');

    if (query) {
      url += '?' + query;
    }
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

function setraPostJson_(path, payload) {
  const url = setraBuildApiUrl_(path);
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: setraBuildApiHeaders_(),
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true,
  });

  return setraParseApiResponse_(response, 'POST ' + path);
}

function setraGetJson_(path, queryParams) {
  const url = setraBuildApiUrl_(path, queryParams);
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: setraBuildApiHeaders_(),
    muteHttpExceptions: true,
  });

  return setraParseApiResponse_(response, 'GET ' + path);
}

function setraParseApiResponse_(response, operationLabel) {
  const statusCode = response.getResponseCode();
  const text = response.getContentText() || '';
  let json = null;

  try {
    json = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(operationLabel + ' gagal. Response backend bukan JSON. HTTP ' + statusCode + ': ' + text.slice(0, 500));
  }

  if (statusCode < 200 || statusCode >= 300) {
    const message = json.message || json.error || text || 'Unknown backend error';
    throw new Error(operationLabel + ' gagal. HTTP ' + statusCode + ': ' + message);
  }

  if (json && json.ok === false) {
    throw new Error(operationLabel + ' gagal: ' + (json.message || json.error || 'Backend mengembalikan ok=false'));
  }

  return json;
}

function setraBuildBasePayload_(sheetName, operation) {
  return {
    source: 'google_sheets',
    operation: operation,
    sheet_name: sheetName,
    area_id: setraGetAreaId_(),
    area_name: setraGetAreaName_(),
    spreadsheet_id: setraGetSpreadsheetId_(),
    spreadsheet_url: setraGetSpreadsheetUrl_(),
    executed_by: setraGetCurrentUserEmail_(),
    executed_at: setraNowIso_(),
    template_version: SETRA.TEMPLATE_VERSION,
  };
}
