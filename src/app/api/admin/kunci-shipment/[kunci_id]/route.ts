import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { adminKunciShipmentSchema } from "@/lib/validation";

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

const kunciIdSchema = z.coerce.number().int().positive("Kunci shipment tidak valid");

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

export async function PUT(
  request: Request,
  context: {
    params: Promise<{
      kunci_id: string;
    }>;
  },
) {
  try {
    const sessionResult = await validateAdminSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const params = await context.params;
    const parsedId = kunciIdSchema.safeParse(params.kunci_id);

    if (!parsedId.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kunci shipment tidak valid",
          errors: parsedId.error.flatten().formErrors,
        },
        {
          status: 400,
        },
      );
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
      UPDATE kunci_shipment k
      SET
        nik_kerja = ${nikKerja},
        tanggal_awal = ${payload.tanggal_awal}::DATE,
        tanggal_akhir = ${payload.tanggal_akhir}::DATE,
        keterangan_kunci = ${keteranganKunci}
      WHERE k.kunci_id = ${parsedId.data}::BIGINT
        AND k.area_id = ${areaId}
      RETURNING
        k.kunci_id::TEXT AS kunci_id,
        k.area_id,
        k.nik_kerja,
        (
          SELECT u.nama_lengkap
          FROM users u
          WHERE u.nik_kerja = k.nik_kerja
            AND u.area_id = k.area_id
          LIMIT 1
        ) AS nama_lengkap,
        k.tanggal_awal::TEXT AS tanggal_awal,
        k.tanggal_akhir::TEXT AS tanggal_akhir,
        k.keterangan_kunci,
        k.created_at::TEXT AS created_at,
        k.updated_at::TEXT AS updated_at
    `;

    if (!rows[0]) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kunci shipment tidak ditemukan di area admin",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Kunci shipment berhasil diperbarui",
      data: rows[0],
    });
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
      error instanceof Error ? error.message : "Gagal memperbarui kunci shipment";

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

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      kunci_id: string;
    }>;
  },
) {
  try {
    const sessionResult = await validateAdminSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const params = await context.params;
    const parsedId = kunciIdSchema.safeParse(params.kunci_id);

    if (!parsedId.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kunci shipment tidak valid",
          errors: parsedId.error.flatten().formErrors,
        },
        {
          status: 400,
        },
      );
    }

    const rows = await query<{ kunci_id: string }>`
      DELETE FROM kunci_shipment
      WHERE kunci_id = ${parsedId.data}::BIGINT
        AND area_id = ${sessionResult.areaId}
      RETURNING kunci_id::TEXT AS kunci_id
    `;

    if (!rows[0]) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kunci shipment tidak ditemukan di area admin",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Kunci shipment berhasil dibuka",
      data: rows[0],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal membuka kunci shipment";

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
