/**
 * Apps Script Web App untuk fitur frontend "Hubungkan".
 *
 * Deploy wajib:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * Secret tetap melindungi endpoint ini. Jangan sebar CONNECT_SECRET.
 */

const SETRA_CONNECT_PROP = {
  SECRET: "SETRA_CONNECT_SECRET",
  TEMPLATE_ID: "SETRA_TEMPLATE_SPREADSHEET_ID",
  OUTPUT_FOLDER_ID: "SETRA_OUTPUT_FOLDER_ID",
};

function setSetraConnectSecret(secret) {
  if (!secret || String(secret).trim().length < 16) {
    throw new Error("Secret minimal 16 karakter.");
  }

  PropertiesService.getScriptProperties().setProperty(
    SETRA_CONNECT_PROP.SECRET,
    String(secret).trim(),
  );
}

function setSetraConnectTemplateId(templateId) {
  if (!templateId || String(templateId).trim().length === 0) {
    throw new Error("Template spreadsheet ID wajib diisi.");
  }

  PropertiesService.getScriptProperties().setProperty(
    SETRA_CONNECT_PROP.TEMPLATE_ID,
    String(templateId).trim(),
  );
}

function setSetraConnectOutputFolderId(folderId) {
  if (!folderId || String(folderId).trim().length === 0) {
    throw new Error("Output folder ID wajib diisi.");
  }

  PropertiesService.getScriptProperties().setProperty(
    SETRA_CONNECT_PROP.OUTPUT_FOLDER_ID,
    String(folderId).trim(),
  );
}

function doPost(e) {
  try {
    const payload = parseSetraConnectPayload_(e);
    assertSetraConnectSecret_(payload.secret);

    const templateSpreadsheetId = getRequiredSetraConnectValue_(
      payload.template_spreadsheet_id,
      SETRA_CONNECT_PROP.TEMPLATE_ID,
      "template_spreadsheet_id belum dikirim dan Script Property SETRA_TEMPLATE_SPREADSHEET_ID belum diset.",
    );

    const outputFolderId = getOptionalSetraConnectValue_(
      payload.output_folder_id,
      SETRA_CONNECT_PROP.OUTPUT_FOLDER_ID,
    );

    const areaId = requirePayloadString_(payload, "area_id");
    const areaName = requirePayloadString_(payload, "area_name");
    const spreadsheetName =
      String(payload.spreadsheet_name || "").trim() ||
      `SHIPMENT_APP_${areaName.toUpperCase()}`;

    const copiedFile = copySetraTemplate_(
      templateSpreadsheetId,
      outputFolderId,
      spreadsheetName,
    );

    const spreadsheet = SpreadsheetApp.openById(copiedFile.getId());
    const spreadsheetUrl = spreadsheet.getUrl();

    updateSetraConfig_(spreadsheet, {
      AREA_ID: areaId,
      AREA_NAME: areaName,
      API_BASE_URL: String(payload.api_base_url || "").trim(),
      SPREADSHEET_ID: spreadsheet.getId(),
      SPREADSHEET_URL: spreadsheetUrl,
      OWNER_EMAIL: String(payload.owner_email || "").trim(),
      SUPERADMIN_EMAILS: String(payload.superadmin_emails || "").trim(),
    });

    return jsonSetraConnectResponse_({
      ok: true,
      message: "Spreadsheet area berhasil dibuat.",
      data: {
        spreadsheet_id: spreadsheet.getId(),
        spreadsheet_url: spreadsheetUrl,
        spreadsheet_name: spreadsheet.getName(),
      },
    });
  } catch (error) {
    return jsonSetraConnectResponse_({
      ok: false,
      message: error && error.message ? error.message : String(error),
    });
  }
}

function parseSetraConnectPayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("Payload kosong.");
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error("Payload bukan JSON valid.");
  }
}

function assertSetraConnectSecret_(incomingSecret) {
  const savedSecret = PropertiesService.getScriptProperties().getProperty(
    SETRA_CONNECT_PROP.SECRET,
  );

  if (!savedSecret) {
    throw new Error(
      "SETRA_CONNECT_SECRET belum diset. Jalankan setSetraConnectSecret(secret) di Apps Script editor.",
    );
  }

  if (String(incomingSecret || "").trim() !== savedSecret) {
    throw new Error("Secret connect tidak valid.");
  }
}

function requirePayloadString_(payload, key) {
  const value = String(payload[key] || "").trim();

  if (!value) {
    throw new Error(`${key} wajib diisi.`);
  }

  return value;
}

function getRequiredSetraConnectValue_(payloadValue, propertyKey, errorMessage) {
  const directValue = String(payloadValue || "").trim();

  if (directValue) {
    return directValue;
  }

  const propertyValue = String(
    PropertiesService.getScriptProperties().getProperty(propertyKey) || "",
  ).trim();

  if (propertyValue) {
    return propertyValue;
  }

  throw new Error(errorMessage);
}

function getOptionalSetraConnectValue_(payloadValue, propertyKey) {
  const directValue = String(payloadValue || "").trim();

  if (directValue) {
    return directValue;
  }

  return String(
    PropertiesService.getScriptProperties().getProperty(propertyKey) || "",
  ).trim();
}

function copySetraTemplate_(templateSpreadsheetId, outputFolderId, spreadsheetName) {
  const templateFile = DriveApp.getFileById(templateSpreadsheetId);

  if (outputFolderId) {
    const outputFolder = DriveApp.getFolderById(outputFolderId);
    return templateFile.makeCopy(spreadsheetName, outputFolder);
  }

  return templateFile.makeCopy(spreadsheetName);
}

function updateSetraConfig_(spreadsheet, configValues) {
  const sheet = spreadsheet.getSheetByName("_config");

  if (!sheet) {
    throw new Error("Sheet _config tidak ditemukan pada template.");
  }

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  if (values.length === 0) {
    throw new Error("Sheet _config kosong.");
  }

  const headerInfo = findConfigHeader_(values);
  const keyColumn = headerInfo.keyColumn;
  const valueColumn = headerInfo.valueColumn;
  const startRowIndex = headerInfo.headerRow + 1;

  const rowByKey = {};

  for (let rowIndex = startRowIndex; rowIndex < values.length; rowIndex += 1) {
    const key = String(values[rowIndex][keyColumn] || "").trim();

    if (key) {
      rowByKey[key] = rowIndex + 1;
    }
  }

  Object.keys(configValues).forEach(function (key) {
    const value = configValues[key];
    const existingRow = rowByKey[key];

    if (existingRow) {
      sheet.getRange(existingRow, valueColumn + 1).setValue(value);
      return;
    }

    const nextRow = Math.max(sheet.getLastRow() + 1, headerInfo.headerRow + 2);
    sheet.getRange(nextRow, keyColumn + 1).setValue(key);
    sheet.getRange(nextRow, valueColumn + 1).setValue(value);
    rowByKey[key] = nextRow;
  });
}

function findConfigHeader_(values) {
  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    const normalized = values[rowIndex].map(function (cell) {
      return String(cell || "").trim();
    });

    const keyColumn = normalized.indexOf("config_key");
    const valueColumn = normalized.indexOf("config_value");

    if (keyColumn >= 0 && valueColumn >= 0) {
      return {
        headerRow: rowIndex,
        keyColumn: keyColumn,
        valueColumn: valueColumn,
      };
    }
  }

  throw new Error("Header config_key/config_value tidak ditemukan di sheet _config.");
}

function jsonSetraConnectResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
