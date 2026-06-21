import { neon } from "@neondatabase/serverless";

type DbPrimitive = string | number | boolean | null | Date;
type DbParam = DbPrimitive | DbPrimitive[];
type DbRow = Record<string, unknown>;

let cachedSql: ReturnType<typeof neon> | null = null;

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL belum diisi di .env.local");
  }

  if (
    databaseUrl.includes("PASTE_NEON_DATABASE_URL_HERE") ||
    databaseUrl.includes("USER:PASSWORD@HOST")
  ) {
    throw new Error("DATABASE_URL masih placeholder. Isi dengan connection string Neon real.");
  }

  return databaseUrl;
}

export function db(): ReturnType<typeof neon> {
  if (!cachedSql) {
    cachedSql = neon(getDatabaseUrl());
  }

  return cachedSql;
}

export async function query<T extends DbRow = DbRow>(
  strings: TemplateStringsArray,
  ...params: DbParam[]
): Promise<T[]> {
  const sql = db();
  const rows = await sql(strings, ...params);

  return rows as T[];
}

export async function pingDatabase(): Promise<{
  ok: true;
  now: string;
}> {
  const rows = await query<{ now: string }>`SELECT NOW()::TEXT AS now`;

  return {
    ok: true,
    now: rows[0]?.now ?? "",
  };
}
