export type AppsScriptSpreadsheetResult = {
  spreadsheet_id: string;
  spreadsheet_url: string;
  spreadsheet_name: string;
};

type AppsScriptConnectResponse = {
  ok?: boolean;
  message?: string;
  data?: {
    spreadsheet_id?: string;
    spreadsheet_url?: string;
    spreadsheet_name?: string;
    name?: string;
  };
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} belum diisi`);
  }

  return value;
}

function optionalEnv(name: string): string {
  return process.env[name]?.trim() || "";
}

function makeSpreadsheetName(areaName: string): string {
  return `SHIPMENT_APP_${areaName.trim().toUpperCase()}`;
}

function parseAppsScriptJson(text: string): AppsScriptConnectResponse {
  try {
    return JSON.parse(text) as AppsScriptConnectResponse;
  } catch {
    throw new Error(
      text.trim() || "Apps Script tidak mengembalikan response JSON yang valid",
    );
  }
}

export async function createAreaSpreadsheetViaAppsScript(params: {
  area_id: string;
  area_name: string;
  area_timezone?: string | null;
}): Promise<AppsScriptSpreadsheetResult> {
  const webAppUrl = requireEnv("GOOGLE_APPS_SCRIPT_CONNECT_URL");
  const connectSecret = requireEnv("GOOGLE_APPS_SCRIPT_CONNECT_SECRET");
  const webhookSecret = requireEnv("SPREADSHEET_WEBHOOK_SECRET");
  const templateSpreadsheetId = requireEnv("GOOGLE_SPREADSHEET_TEMPLATE_ID");
  const apiBaseUrl = requireEnv("NEXT_PUBLIC_APP_URL");
  const spreadsheetTimezone = params.area_timezone?.trim() || optionalEnv("SPREADSHEET_DEFAULT_TIMEZONE") || "Asia/Jakarta";
  const spreadsheetName = makeSpreadsheetName(params.area_name);

  const response = await fetch(webAppUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      secret: connectSecret,
      webhook_secret: webhookSecret,
      area_id: params.area_id,
      area_name: params.area_name,
      spreadsheet_name: spreadsheetName,
      template_spreadsheet_id: templateSpreadsheetId,
      output_folder_id: optionalEnv("GOOGLE_DRIVE_FOLDER_ID"),
      api_base_url: apiBaseUrl,
      timezone: spreadsheetTimezone,
      owner_email: optionalEnv("SPREADSHEET_OWNER_EMAIL"),
      superadmin_emails: optionalEnv("SPREADSHEET_SUPERADMIN_EMAILS"),
    }),
  });

  const text = await response.text();
  const result = parseAppsScriptJson(text);

  if (!response.ok || !result.ok) {
    throw new Error(result.message || "Apps Script gagal membuat spreadsheet area");
  }

  const spreadsheetId = result.data?.spreadsheet_id?.trim();
  const spreadsheetUrl = result.data?.spreadsheet_url?.trim();
  const returnedName =
    result.data?.spreadsheet_name?.trim() || result.data?.name?.trim() || spreadsheetName;

  if (!spreadsheetId) {
    throw new Error("Apps Script tidak mengembalikan spreadsheet_id");
  }

  return {
    spreadsheet_id: spreadsheetId,
    spreadsheet_url:
      spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    spreadsheet_name: returnedName,
  };
}
