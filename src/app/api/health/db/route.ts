import { NextResponse } from "next/server";

import { pingDatabase } from "@/lib/db";

export async function GET() {
  try {
    const result = await pingDatabase();

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Database connection failed";

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
