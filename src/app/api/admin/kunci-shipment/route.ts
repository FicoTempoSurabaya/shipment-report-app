import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { dashboardFilterSchema, adminKunciShipmentSchema } from "@/lib/validation";

type AdminShipmentLockRow = {
  kunci_id: string;
  area_id: string;
  nik_kerja: string | null;
  nama_lengkap: string | null;
  tanggal_awal: string;
  tanggal_akhir: string;
  keterangan_kunci: string | null;
  created_at: string;
  updated_at: string;
};

type AdminRegularUserLookupRow = {
  nik_kerja: string;
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
      response: NextResponse.json(
        {
          ok: false,
          message: "Belum login",
        },
        {
          status: 401,
        },
      ),
    };
  }

  if (session.user_role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "Endpoint ini hanya untuk user admin",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (!session.area_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "Admin tidak memiliki area",
        },
        {
          status: 400,
        },
      ),
    };
  }

  return {
    ok: true as const,
    session,
    areaId: session.area_id,
  };
}

async function validateRegularUserInAdminArea(params: {
  areaId: string;
  nikKerja: string | null | undefined;
}) {
  if (!params.nikKerja) {
    return true;
  }

  const rows = await query<AdminRegularUserLookupRow>`
    SELECT nik_kerja
    FROM users
    WHERE area_id = ${params.areaId}
      AND nik_kerja = ${params.nikKerja}
      AND user_role = 'regular'
      AND is_active = TRUE
    LIMIT 1
  `;

  return Boolean(rows[0]);
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
          {
            status: 400,
          },
        );
      }

      const locks = await query<AdminShipmentLockRow>`
        SELECT
          k.kunci_id::TEXT AS kunci_id,
          k.area_id,
          k.nik_kerja,
          u.nama_lengkap,
          k.tanggal_awal::TEXT AS tanggal_awal,
          k.tanggal_akhir::TEXT AS tanggal_akhir,
          k.keterangan_kunci,
          k.created_at::TEXT AS created_at,
          k.updated_at::TEXT AS updated_at
        FROM kunci_shipment k
        LEFT JOIN users u
          ON u.nik_kerja = k.nik_kerja
          AND u.area_id = k.area_id
        WHERE k.area_id = ${areaId}
          AND k.tanggal_awal <= ${parsedFilter.data.end_date}::DATE
          AND k.tanggal_akhir >= ${parsedFilter.data.start_date}::DATE
        ORDER BY k.tanggal_awal DESC, k.tanggal_akhir DESC, k.kunci_id DESC
      `;

      return NextResponse.json({
        ok: true,
        data: locks,
      });
    }

    const locks = await query<AdminShipmentLockRow>`
      SELECT
        k.kunci_id::TEXT AS kunci_id,
        k.area_id,
        k.nik_kerja,
        u.nama_lengkap,
        k.tanggal_awal::TEXT AS tanggal_awal,
        k.tanggal_akhir::TEXT AS tanggal_akhir,
        k.keterangan_kunci,
        k.created_at::TEXT AS created_at,
        k.updated_at::TEXT AS updated_at
      FROM kunci_shipment k
      LEFT JOIN users u
        ON u.nik_kerja = k.nik_kerja
        AND u.area_id = k.area_id
      WHERE k.area_id = ${areaId}
      ORDER BY k.tanggal_awal DESC, k.tanggal_akhir DESC, k.kunci_id DESC
    `;

    return NextResponse.json({
      ok: true,
      data: locks,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal mengambil data kunci shipment";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      {
        status: 500,
      },
    );
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
        {
          status: 400,
        },
      );
    }

    const payload = parsed.data;
    const areaId = sessionResult.areaId;
    const nikKerja = payload.nik_kerja ?? null;
    const keteranganKunci = payload.keterangan_kunci ?? null;
    const isValidUser = await validateRegularUserInAdminArea({
      areaId,
      nikKerja,
    });

    if (!isValidUser) {
      return NextResponse.json(
        {
          ok: false,
          message: "User regular tidak ditemukan di area admin",
        },
        {
          status: 400,
        },
      );
    }

    const rows = await query<AdminShipmentLockRow>`
      INSERT INTO kunci_shipment (
        area_id,
        nik_kerja,
        tanggal_awal,
        tanggal_akhir,
        keterangan_kunci
      )
      VALUES (
        ${areaId},
        ${nikKerja},
        ${payload.tanggal_awal}::DATE,
        ${payload.tanggal_akhir}::DATE,
        ${keteranganKunci}
      )
      RETURNING
        kunci_id::TEXT AS kunci_id,
        area_id,
        nik_kerja,
        (
          SELECT u.nama_lengkap
          FROM users u
          WHERE u.nik_kerja = kunci_shipment.nik_kerja
            AND u.area_id = kunci_shipment.area_id
          LIMIT 1
        ) AS nama_lengkap,
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
      {
        status: 201,
      },
    );
  } catch (error) {
    const code = getDatabaseErrorCode(error);

    if (code === "23503") {
      return NextResponse.json(
        {
          ok: false,
          message: "Area atau user pada kunci shipment tidak valid",
        },
        {
          status: 400,
        },
      );
    }

    if (code === "23514") {
      return NextResponse.json(
        {
          ok: false,
          message: "Tanggal akhir tidak boleh lebih kecil dari tanggal awal",
        },
        {
          status: 400,
        },
      );
    }

    const message =
      error instanceof Error ? error.message : "Gagal membuat kunci shipment";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      {
        status: 500,
      },
    );
  }
}
