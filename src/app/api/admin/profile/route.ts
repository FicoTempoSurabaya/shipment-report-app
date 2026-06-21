import { NextResponse } from "next/server";

import { getSession, setSessionCookie } from "@/lib/auth";
import { query } from "@/lib/db";
import { updateProfileSchema } from "@/lib/validation";

type AdminProfileRow = {
  nik_kerja: string;
  area_id: string | null;
  nama_area: string | null;
  nama_lengkap: string;
  username: string;
  password: string;
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
          message: "Endpoint profile ini hanya untuk user admin",
        },
        {
          status: 403,
        },
      ),
    };
  }

  return {
    ok: true as const,
    session,
  };
}

export async function GET() {
  try {
    const sessionResult = await validateAdminSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const rows = await query<AdminProfileRow>`
      SELECT
        u.nik_kerja,
        u.area_id,
        a.nama_area,
        u.nama_lengkap,
        u.username,
        u.password
      FROM users u
      LEFT JOIN area a ON a.area_id = u.area_id
      WHERE u.nik_kerja = ${sessionResult.session.nik_kerja}
        AND u.user_role = 'admin'
        AND u.is_active = TRUE
      LIMIT 1
    `;

    const profile = rows[0];

    if (!profile) {
      return NextResponse.json(
        {
          ok: false,
          message: "Profile admin tidak ditemukan",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      data: profile,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal mengambil profile admin";

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
    const parsed = updateProfileSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Input profile admin tidak valid",
          errors: parsed.error.flatten().fieldErrors,
        },
        {
          status: 400,
        },
      );
    }

    const rows = await query<AdminProfileRow>`
      WITH updated_user AS (
        UPDATE users
        SET
          username = ${parsed.data.username},
          password = ${parsed.data.password}
        WHERE nik_kerja = ${sessionResult.session.nik_kerja}
          AND user_role = 'admin'
          AND is_active = TRUE
        RETURNING
          nik_kerja,
          area_id,
          nama_lengkap,
          username,
          password
      )
      SELECT
        u.nik_kerja,
        u.area_id,
        a.nama_area,
        u.nama_lengkap,
        u.username,
        u.password
      FROM updated_user u
      LEFT JOIN area a ON a.area_id = u.area_id
      LIMIT 1
    `;

    const updatedProfile = rows[0];

    if (!updatedProfile) {
      return NextResponse.json(
        {
          ok: false,
          message: "Profile admin tidak ditemukan",
        },
        {
          status: 404,
        },
      );
    }

    await setSessionCookie({
      nik_kerja: updatedProfile.nik_kerja,
      area_id: updatedProfile.area_id,
      nama_lengkap: updatedProfile.nama_lengkap,
      username: updatedProfile.username,
      user_role: "admin",
    });

    return NextResponse.json({
      ok: true,
      message: "Profile admin berhasil diperbarui",
      data: updatedProfile,
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
      error instanceof Error ? error.message : "Gagal memperbarui profile admin";

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
