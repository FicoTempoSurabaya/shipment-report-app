import { importPKCS8, SignJWT } from "jose";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_API_BASE_URL = "https://www.googleapis.com/drive/v3";
const GOOGLE_SHEETS_API_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const GOOGLE_API_SCOPE = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleDriveCopyResponse = {
  id?: string;
  name?: string;
  webViewLink?: string;
  error?: {
    message?: string;
  };
};

type GoogleSheetValuesResponse = {
  values?: string[][];
  error?: {
    message?: string;
  };
};

type GoogleSheetsBatchUpdateResponse = {
  error?: {
    message?: string;
  };
};

export type CopiedSpreadsheet = {
  spreadsheet_id: string;
  spreadsheet_url: string;
  name: string;
};

function requireGoogleEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} belum diisi`);
  }

  return value;
}

function getGooglePrivateKey(): string {
  return requireGoogleEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

async function getGoogleAccessToken(): Promise<string> {
  const clientEmail = requireGoogleEnv("GOOGLE_CLIENT_EMAIL");
  const privateKey = await importPKCS8(getGooglePrivateKey(), "RS256");

  const assertion = await new SignJWT({
    scope: GOOGLE_API_SCOPE,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const result = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !result.access_token) {
    throw new Error(
      result.error_description || result.error || "Gagal membuat Google access token",
    );
  }

  return result.access_token;
}

async function googleApiFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const accessToken = await getGoogleAccessToken();
  const headers = new Headers(options.headers);

  headers.set("Authorization", `Bearer ${accessToken}`);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const result = (await response.json()) as T & {
    error?: {
      message?: string;
    };
  };

  if (!response.ok) {
    throw new Error(result.error?.message || "Request Google API gagal");
  }

  return result;
}

export async function copySpreadsheetTemplate(params: {
  nama_area: string;
}): Promise<CopiedSpreadsheet> {
  const templateId = requireGoogleEnv("GOOGLE_SPREADSHEET_TEMPLATE_ID");
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  const spreadsheetName = `SHIPMENT_APP_${params.nama_area.trim().toUpperCase()}`;

  const url = new URL(
    `${GOOGLE_DRIVE_API_BASE_URL}/files/${encodeURIComponent(templateId)}/copy`,
  );
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "id,name,webViewLink");

  const result = await googleApiFetch<GoogleDriveCopyResponse>(url.toString(), {
    method: "POST",
    body: JSON.stringify({
      name: spreadsheetName,
      ...(folderId ? { parents: [folderId] } : {}),
    }),
  });

  if (!result.id) {
    throw new Error("Google Drive tidak mengembalikan spreadsheet ID");
  }

  return {
    spreadsheet_id: result.id,
    spreadsheet_url:
      result.webViewLink || `https://docs.google.com/spreadsheets/d/${result.id}`,
    name: result.name || spreadsheetName,
  };
}

export async function updateSpreadsheetConfig(params: {
  spreadsheet_id: string;
  area_id: string;
  area_name: string;
  spreadsheet_url: string;
}): Promise<void> {
  const apiBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const ownerEmail = process.env.SPREADSHEET_OWNER_EMAIL?.trim() || "";
  const superadminEmails = process.env.SPREADSHEET_SUPERADMIN_EMAILS?.trim() || "";

  const valuesUrl = new URL(
    `${GOOGLE_SHEETS_API_BASE_URL}/${encodeURIComponent(params.spreadsheet_id)}/values/_config!A:B`,
  );

  const currentValues = await googleApiFetch<GoogleSheetValuesResponse>(
    valuesUrl.toString(),
  );

  const rowByKey = new Map<string, number>();

  for (const [index, row] of (currentValues.values || []).entries()) {
    const key = row[0]?.trim();

    if (key) {
      rowByKey.set(key, index + 1);
    }
  }

  const configValues: Record<string, string> = {
    AREA_ID: params.area_id,
    AREA_NAME: params.area_name,
    API_BASE_URL: apiBaseUrl,
    SPREADSHEET_ID: params.spreadsheet_id,
    SPREADSHEET_URL: params.spreadsheet_url,
    OWNER_EMAIL: ownerEmail,
    SUPERADMIN_EMAILS: superadminEmails,
  };

  const data = Object.entries(configValues)
    .map(([key, value]) => {
      const rowNumber = rowByKey.get(key);

      if (!rowNumber) {
        return null;
      }

      return {
        range: `_config!B${rowNumber}`,
        values: [[value]],
      };
    })
    .filter((item): item is { range: string; values: string[][] } => Boolean(item));

  if (data.length === 0) {
    return;
  }

  const batchUpdateUrl = `${GOOGLE_SHEETS_API_BASE_URL}/${encodeURIComponent(
    params.spreadsheet_id,
  )}/values:batchUpdate`;

  const result = await googleApiFetch<GoogleSheetsBatchUpdateResponse>(batchUpdateUrl, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data,
    }),
  });

  if (result.error?.message) {
    throw new Error(result.error.message);
  }
}
