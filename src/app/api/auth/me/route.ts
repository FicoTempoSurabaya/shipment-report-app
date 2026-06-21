import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        message: "Belum login",
        user: null,
      },
      {
        status: 401,
      },
    );
  }

  return NextResponse.json({
    ok: true,
    user: session,
  });
}