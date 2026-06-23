import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  adminCreateRegularUserSchema,
  adminUpdateRegularUserSchema,
} from "@/lib/validation";
import type { UserJabatan } from "@/types/user";

type AdminRegularUserRow = {
  nik_kerja: string;
  area_id: string;
  nama_lengkap: string;
  jabatan: UserJabatan;
  username: string;
  password: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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

export async function GET(request: Request) {
  try {
    const sessionResult = await validateAdminSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const areaId = sessionResult.areaId;

    if (search) {
      const users = await query<AdminRegularUserRow>`
        SELECT
          nik_kerja,
          area_id,
          nama_lengkap,
          jabatan,
          username,
          password,
          is_active,
          created_at::TEXT AS created_at,
          updated_at::TEXT AS updated_at
        FROM users
        WHERE area_id = ${areaId}
          AND user_role = 'regular'
          AND (
            nik_kerja ILIKE ${`%${search}%`}
            OR nama_lengkap ILIKE ${`%${search}%`}
            OR username ILIKE ${`%${search}%`}
          )
        ORDER BY is_active DESC, nama_lengkap ASC
      `;

      return NextResponse.json({
        ok: true,
        data: users,
      });
    }

    const users = await query<AdminRegularUserRow>`
      SELECT
        nik_kerja,
        area_id,
        nama_lengkap,
        jabatan,
        username,
        password,
        is_active,
        created_at::TEXT AS created_at,
        updated_at::TEXT AS updated_at
      FROM users
      WHERE area_id = ${areaId}
        AND user_role = 'regular'
      ORDER BY is_active DESC, nama_lengkap ASC
    `;

    return NextResponse.json({
      ok: true,
      data: users,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal mengambil data user regular";

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
    const parsed = adminCreateRegularUserSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Input user regular tidak valid",
          errors: parsed.error.flatten().fieldErrors,
        },
        {
          status: 400,
        },
      );
    }

    const payload = parsed.data;
    const areaId = sessionResult.areaId;

    const rows = await query<AdminRegularUserRow>`
      INSERT INTO users (
        nik_kerja,
        area_id,
        nama_lengkap,
        jabatan,
        user_role,
        username,
        password,
        is_active
      )
      VALUES (
        ${payload.nik_kerja},
        ${areaId},
        ${payload.nama_lengkap},
        ${payload.jabatan},
        'regular',
        ${payload.username},
        ${payload.password},
        ${payload.is_active}
      )
      RETURNING
        nik_kerja,
        area_id,
        nama_lengkap,
        jabatan,
        username,
        password,
        is_active,
        created_at::TEXT AS created_at,
        updated_at::TEXT AS updated_at
    `;

    return NextResponse.json(
      {
        ok: true,
        message: "User regular berhasil ditambahkan",
        data: rows[0],
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    const code = getDatabaseErrorCode(error);

    if (code === "23505") {
      return NextResponse.json(
        {
          ok: false,
          message: "NIK kerja atau username sudah digunakan",
        },
        {
          status: 409,
        },
      );
    }

    if (code === "23503") {
      return NextResponse.json(
        {
          ok: false,
          message: "Area admin tidak valid",
        },
        {
          status: 400,
        },
      );
    }

    const message =
      error instanceof Error ? error.message : "Gagal menambahkan user regular";

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

export async function PUT(request: Request) {
  try {
    const sessionResult = await validateAdminSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const json = await request.json();
    const parsed = adminUpdateRegularUserSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Input update user regular tidak valid",
          errors: parsed.error.flatten().fieldErrors,
        },
        {
          status: 400,
        },
      );
    }

    const payload = parsed.data;
    const areaId = sessionResult.areaId;

    const rows = await query<AdminRegularUserRow>`
      UPDATE users
      SET
        nama_lengkap = ${payload.nama_lengkap},
        jabatan = ${payload.jabatan},
        username = ${payload.username},
        password = ${payload.password},
        is_active = ${payload.is_active}
      WHERE nik_kerja = ${payload.nik_kerja}
        AND area_id = ${areaId}
        AND user_role = 'regular'
      RETURNING
        nik_kerja,
        area_id,
        nama_lengkap,
        jabatan,
        username,
        password,
        is_active,
        created_at::TEXT AS created_at,
        updated_at::TEXT AS updated_at
    `;

    if (!rows[0]) {
      return NextResponse.json(
        {
          ok: false,
          message: "User regular tidak ditemukan di area admin",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "User regular berhasil diperbarui",
      data: rows[0],
    });
  } catch (error) {
    const code = getDatabaseErrorCode(error);

    if (code === "23505") {
      return NextResponse.json(
        {
          ok: false,
          message: "Username sudah digunakan",
        },
        {
          status: 409,
        },
      );
    }

    const message =
      error instanceof Error ? error.message : "Gagal memperbarui user regular";

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