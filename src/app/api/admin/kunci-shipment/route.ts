import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { dashboardFilterSchema, adminKunciShipmentSchema } from "@/lib/validation";

type AdminShipmentLockRow = {
  kunci_id: string;
  area_id: string;
  user_id: string | null;
  nik_kerja: string | null;
  nama_lengkap: string | null;
  tanggal_awal: string;
  tanggal_akhir: string;
  keterangan_kunci: string;
  created_at: string;
  updated_at: string;
};

type AdminRegularUserLookupRow = {
  user_id: string;
};

function getDatabaseErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}

async function validateAdminSession() {
  const session = await getSession();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Belum login" }, { status: 401 }),
    };
  }

  if (session.user_role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Endpoint ini hanya untuk user admin" },
        { status: 403 },
      ),
    };
  }

  if (!session.area_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Admin tidak memiliki area" },
        { status: 400 },
      ),
    };
  }

  return { ok: true as const, session, areaId: session.area_id };
}

async function getRegularUserIdInAdminArea(params: {
  areaId: string;
  nikKerja: string | null | undefined;
}): Promise<string | null> {
  if (!params.nikKerja) {
    return null;
  }

  const rows = await query<AdminRegularUserLookupRow>`
    SELECT user_id::TEXT AS user_id
    FROM users
    WHERE area_id = ${params.areaId}::BIGINT
      AND nik_kerja = ${params.nikKerja}
      AND user_role = 'regular'
      AND is_active = TRUE
    LIMIT 1
  `;

  return rows[0]?.user_id ?? null;
}

function getKeterangan(value: string | null | undefined): string {
  return value?.trim() || "Dikunci oleh admin";
}


export async function GET(request: Request) {
  try {
    const sessionResult = await validateAdminSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const hasDateFilter = Boolean(startDate || endDate);
    const areaId = sessionResult.areaId;

    if (hasDateFilter) {
      const parsedFilter = dashboardFilterSchema.safeParse({
        start_date: startDate,
        end_date: endDate,
      });

      if (!parsedFilter.success) {
        return NextResponse.json(
          {
            ok: false,
            message: "Filter tanggal tidak valid",
            errors: parsedFilter.error.flatten().fieldErrors,
          },
          { status: 400 },
        );
      }

      const locks = await query<AdminShipmentLockRow>`
        SELECT
          k.kunci_id::TEXT AS kunci_id,
          k.area_id::TEXT AS area_id,
          k.user_id::TEXT AS user_id,
          u.nik_kerja,
          u.nama_lengkap,
          k.tanggal_awal::TEXT AS tanggal_awal,
          k.tanggal_akhir::TEXT AS tanggal_akhir,
          k.keterangan_kunci,
          k.created_at::TEXT AS created_at,
          k.updated_at::TEXT AS updated_at
        FROM kunci_shipment k
        LEFT JOIN users u ON u.user_id = k.user_id
        WHERE k.area_id = ${areaId}::BIGINT
          AND k.tanggal_awal <= ${parsedFilter.data.end_date}::DATE
          AND k.tanggal_akhir >= ${parsedFilter.data.start_date}::DATE
        ORDER BY k.tanggal_awal DESC, k.tanggal_akhir DESC, k.kunci_id DESC
      `;

      return NextResponse.json({ ok: true, data: locks });
    }

    const locks = await query<AdminShipmentLockRow>`
      SELECT
        k.kunci_id::TEXT AS kunci_id,
        k.area_id::TEXT AS area_id,
        k.user_id::TEXT AS user_id,
        u.nik_kerja,
        u.nama_lengkap,
        k.tanggal_awal::TEXT AS tanggal_awal,
        k.tanggal_akhir::TEXT AS tanggal_akhir,
        k.keterangan_kunci,
        k.created_at::TEXT AS created_at,
        k.updated_at::TEXT AS updated_at
      FROM kunci_shipment k
      LEFT JOIN users u ON u.user_id = k.user_id
      WHERE k.area_id = ${areaId}::BIGINT
      ORDER BY k.tanggal_awal DESC, k.tanggal_akhir DESC, k.kunci_id DESC
    `;

    return NextResponse.json({ ok: true, data: locks });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal mengambil data kunci shipment";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sessionResult = await validateAdminSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const json = await request.json();
    const parsed = adminKunciShipmentSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Input kunci shipment tidak valid",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const areaId = sessionResult.areaId;
    const userId = await getRegularUserIdInAdminArea({
      areaId,
      nikKerja: payload.nik_kerja,
    });

    if (payload.nik_kerja && !userId) {
      return NextResponse.json(
        { ok: false, message: "User regular tidak ditemukan di area admin" },
        { status: 400 },
      );
    }

    const rows = await query<AdminShipmentLockRow>`
      INSERT INTO kunci_shipment (
        area_id,
        user_id,
        tanggal_awal,
        tanggal_akhir,
        keterangan_kunci
      )
      VALUES (
        ${areaId}::BIGINT,
        ${userId}::BIGINT,
        ${payload.tanggal_awal}::DATE,
        ${payload.tanggal_akhir}::DATE,
        ${getKeterangan(payload.keterangan_kunci)}
      )
      RETURNING
        kunci_id::TEXT AS kunci_id,
        area_id::TEXT AS area_id,
        user_id::TEXT AS user_id,
        (SELECT nik_kerja FROM users WHERE users.user_id = kunci_shipment.user_id) AS nik_kerja,
        (SELECT nama_lengkap FROM users WHERE users.user_id = kunci_shipment.user_id) AS nama_lengkap,
        tanggal_awal::TEXT AS tanggal_awal,
        tanggal_akhir::TEXT AS tanggal_akhir,
        keterangan_kunci,
        created_at::TEXT AS created_at,
        updated_at::TEXT AS updated_at
    `;

    return NextResponse.json(
      {
        ok: true,
        message: "Kunci shipment berhasil dibuat",
        data: rows[0],
      },
      { status: 201 },
    );
  } catch (error) {
    const code = getDatabaseErrorCode(error);

    if (code === "23503") {
      return NextResponse.json(
        { ok: false, message: "Area atau user pada kunci shipment tidak valid" },
        { status: 400 },
      );
    }

    if (code === "23514") {
      return NextResponse.json(
        { ok: false, message: "Tanggal akhir tidak boleh lebih kecil dari tanggal awal" },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "Gagal membuat kunci shipment";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
