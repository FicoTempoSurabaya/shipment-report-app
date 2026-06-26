import { NextResponse } from "next/server";

import { getDashboardPathByRole, setSessionCookie } from "@/lib/auth";
import { query } from "@/lib/db";
import { loginSchema } from "@/lib/validation";
import type { UserRole } from "@/types/user";

type LoginUserRow = {
  user_id: string;
  nik_kerja: string;
  area_id: string | null;
  area_code: string | null;
  nama_lengkap: string;
  username: string;
  user_role: UserRole;
};

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = loginSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Input login tidak valid",
          errors: parsed.error.flatten().fieldErrors,
        },
        {
          status: 400,
        },
      );
    }

    const { username, password } = parsed.data;

    const rows = await query<LoginUserRow>`
      SELECT
        u.user_id::TEXT AS user_id,
        u.nik_kerja,
        u.area_id::TEXT AS area_id,
        a.area_code,
        u.nama_lengkap,
        u.username,
        u.user_role
      FROM users u
      LEFT JOIN area a ON a.area_id = u.area_id
      WHERE u.username = ${username}
        AND u.password = ${password}
        AND u.is_active = TRUE
      LIMIT 1
    `;

    const user = rows[0];

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          message: "Username atau password salah, atau user sudah tidak aktif",
        },
        {
          status: 401,
        },
      );
    }

    await setSessionCookie(user);

    return NextResponse.json({
      ok: true,
      message: "Login berhasil",
      redirect_to: getDashboardPathByRole(user.user_role),
      user,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login gagal";

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
