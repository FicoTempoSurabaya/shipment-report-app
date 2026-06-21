import { NextResponse } from "next/server";

import { getDashboardPathByRole, setSessionCookie } from "@/lib/auth";
import { query } from "@/lib/db";
import { loginSchema } from "@/lib/validation";
import type { UserRole } from "@/types/user";

type LoginUserRow = {
  nik_kerja: string;
  area_id: string | null;
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
        nik_kerja,
        area_id,
        nama_lengkap,
        username,
        user_role
      FROM users
      WHERE username = ${username}
        AND password = ${password}
        AND is_active = TRUE
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

    await setSessionCookie({
      nik_kerja: user.nik_kerja,
      area_id: user.area_id,
      nama_lengkap: user.nama_lengkap,
      username: user.username,
      user_role: user.user_role,
    });

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