import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import {
  resolveShipmentCode,
  resolveShipmentFailureReasonsForDb,
} from "@/lib/shipment";
import { freelanceShipmentSchema } from "@/lib/validation";

type InsertedShipmentRow = {
  shipment_id: number;
  area_id: string;
  nama_freelance: string;
  tanggal_shipment: string;
  shipment_code: string;
  jumlah_toko: number;
  terkirim: number;
  gagal: number;
};

type AreaExistsRow = {
  exists: boolean;
};

type DatabaseErrorInfo = {
  code: string | null;
  constraint: string | null;
  detail: string | null;
  message: string | null;
};

function getDatabaseErrorInfo(error: unknown): DatabaseErrorInfo {
  if (typeof error !== "object" || error === null) {
    return {
      code: null,
      constraint: null,
      detail: null,
      message: null,
    };
  }

  const record = error as Record<string, unknown>;

  return {
    code: typeof record.code === "string" ? record.code : null,
    constraint:
      typeof record.constraint === "string" ? record.constraint : null,
    detail: typeof record.detail === "string" ? record.detail : null,
    message: error instanceof Error ? error.message : null,
  };
}

function isShipmentIdSequenceConflict(errorInfo: DatabaseErrorInfo) {
  const conflictText = [
    errorInfo.constraint,
    errorInfo.detail,
    errorInfo.message,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    conflictText.includes("shipments_pkey") ||
    conflictText.includes("shipment_id") ||
    conflictText.includes("shipments_shipment_id_seq")
  );
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = freelanceShipmentSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Input shipment freelance tidak valid",
          errors: parsed.error.flatten().fieldErrors,
        },
        {
          status: 400,
        },
      );
    }

    const payload = parsed.data;
    const shipmentCode = resolveShipmentCode(payload);
    const alasanForDb = resolveShipmentFailureReasonsForDb(payload);

    const areaCheck = await query<AreaExistsRow>`
      SELECT EXISTS (
        SELECT 1
        FROM area
        WHERE area_id = ${payload.area_id}::BIGINT
          AND is_active = TRUE
      ) AS exists
    `;

    if (!areaCheck[0]?.exists) {
      return NextResponse.json(
        {
          ok: false,
          message: "Area tidak ditemukan atau tidak aktif",
        },
        {
          status: 404,
        },
      );
    }

    const rows = await query<InsertedShipmentRow>`
      INSERT INTO shipments (
        area_id,
        user_id,
        is_freelance,
        nama_freelance,
        tanggal_shipment,
        shipment_code,
        jam_berangkat,
        jam_pulang,
        jumlah_toko,
        terkirim,
        gagal,
        alasan
      )
      VALUES (
        ${payload.area_id}::BIGINT,
        NULL,
        TRUE,
        ${payload.nama_freelance},
        ${payload.tanggal_shipment}::DATE,
        ${shipmentCode},
        ${payload.jam_berangkat ?? null}::TIME,
        ${payload.jam_pulang ?? null}::TIME,
        ${payload.jumlah_toko},
        ${payload.terkirim},
        ${payload.jumlah_toko - payload.terkirim},
        ${alasanForDb}
      )
      RETURNING
        shipment_id,
        area_id::TEXT AS area_id,
        nama_freelance,
        tanggal_shipment::TEXT AS tanggal_shipment,
        shipment_code,
        jumlah_toko,
        terkirim,
        gagal
    `;

    return NextResponse.json(
      {
        ok: true,
        message: "Shipment freelance berhasil disimpan",
        data: rows[0],
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    const dbError = getDatabaseErrorInfo(error);

    console.error("Freelance shipment insert failed", dbError);

    if (dbError.code === "23505") {
      if (isShipmentIdSequenceConflict(dbError)) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Sequence shipment_id database belum sinkron. Jalankan sql/fix_shipments_sequence.sql, lalu coba input ulang.",
            constraint: dbError.constraint,
            detail: dbError.detail,
          },
          {
            status: 500,
          },
        );
      }

      if (dbError.constraint === "ux_shipments_freelance_area_name_date") {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Data bentrok: nama freelance yang sama sudah memiliki shipment pada tanggal dan area tersebut. Konflik ini bukan karena shipment_code unik.",
            constraint: dbError.constraint,
            detail: dbError.detail,
          },
          {
            status: 409,
          },
        );
      }

      return NextResponse.json(
        {
          ok: false,
          message:
            "Data bentrok pada constraint database. Lihat field constraint/detail untuk mengetahui sumber konflik.",
          constraint: dbError.constraint,
          detail: dbError.detail,
        },
        {
          status: 409,
        },
      );
    }

    if (dbError.code === "23514") {
      return NextResponse.json(
        {
          ok: false,
          message: "Data shipment melanggar aturan validasi database",
          constraint: dbError.constraint,
          detail: dbError.detail,
        },
        {
          status: 400,
        },
      );
    }

    const message =
      error instanceof Error ? error.message : "Gagal menyimpan shipment freelance";

    return NextResponse.json(
      {
        ok: false,
        message,
        constraint: dbError.constraint,
        detail: dbError.detail,
      },
      {
        status: 500,
      },
    );
  }
}
