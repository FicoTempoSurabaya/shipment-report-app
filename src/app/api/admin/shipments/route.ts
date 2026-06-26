import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  resolveShipmentCode,
  resolveShipmentFailureReasonsForDb,
} from "@/lib/shipment";
import {
  adminShipmentSchema,
  deleteShipmentSchema,
  freelanceShipmentSchema,
} from "@/lib/validation";
import type { ShipmentFailureReason, ShipmentStatus } from "@/types/shipment";

type ShipmentRow = {
  shipment_id: number;
  area_id: string;
  user_id: string | null;
  nik_kerja: string | null;
  is_freelance: boolean;
  nama_freelance: string | null;
  tanggal_shipment: string;
  status_shipment: ShipmentStatus;
  shipment_code: string;
  jam_berangkat: string | null;
  jam_pulang: string | null;
  jumlah_toko: number;
  terkirim: number;
  gagal: number;
  alasan: ShipmentFailureReason[] | string;
};

type AdminRegularUserLookupRow = {
  user_id: string;
  nik_kerja: string;
};

const updateAdminRegularShipmentSchema = adminShipmentSchema.extend({
  shipment_id: z.coerce.number().int().positive("Shipment ID tidak valid"),
});

const updateAdminFreelanceShipmentSchema = freelanceShipmentSchema.extend({
  shipment_id: z.coerce.number().int().positive("Shipment ID tidak valid"),
});

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

async function getRegularUserInAdminArea(params: {
  nikKerja: string;
  areaId: string;
}): Promise<AdminRegularUserLookupRow | null> {
  const rows = await query<AdminRegularUserLookupRow>`
    SELECT
      user_id::TEXT AS user_id,
      nik_kerja
    FROM users
    WHERE nik_kerja = ${params.nikKerja}
      AND area_id = ${params.areaId}::BIGINT
      AND user_role = 'regular'
      AND is_active = TRUE
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function POST(request: Request) {
  try {
    const sessionResult = await validateAdminSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const json = await request.json();
    const parsed = adminShipmentSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Input shipment admin tidak valid",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const areaId = sessionResult.areaId;

    if (payload.area_id !== areaId) {
      return NextResponse.json(
        { ok: false, message: "Admin hanya boleh input shipment pada area sendiri" },
        { status: 403 },
      );
    }

    const user = await getRegularUserInAdminArea({ nikKerja: payload.nik_kerja, areaId });

    if (!user) {
      return NextResponse.json(
        { ok: false, message: "User regular tidak ditemukan di area admin" },
        { status: 404 },
      );
    }

    const shipmentCode = resolveShipmentCode(payload);
    const alasanForDb = resolveShipmentFailureReasonsForDb(payload);
    const gagal = payload.jumlah_toko - payload.terkirim;

    const rows = await query<ShipmentRow>`
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
        ${areaId}::BIGINT,
        ${user.user_id}::BIGINT,
        FALSE,
        NULL,
        ${payload.tanggal_shipment}::DATE,
        ${shipmentCode},
        ${payload.jam_berangkat ?? null}::TIME,
        ${payload.jam_pulang ?? null}::TIME,
        ${payload.jumlah_toko},
        ${payload.terkirim},
        ${gagal},
        ${alasanForDb}
      )
      RETURNING
        shipment_id,
        area_id::TEXT AS area_id,
        user_id::TEXT AS user_id,
        ${user.nik_kerja}::TEXT AS nik_kerja,
        is_freelance,
        nama_freelance,
        tanggal_shipment::TEXT AS tanggal_shipment,
        CASE
          WHEN shipment_code ~ '^[0-9]{10}$' THEN 'Aktif'
          ELSE shipment_code
        END AS status_shipment,
        shipment_code,
        jam_berangkat::TEXT AS jam_berangkat,
        jam_pulang::TEXT AS jam_pulang,
        jumlah_toko,
        terkirim,
        gagal,
        COALESCE(alasan, '') AS alasan
    `;

    return NextResponse.json(
      {
        ok: true,
        message: "Shipment regular berhasil disimpan oleh admin",
        data: rows[0],
      },
      { status: 201 },
    );
  } catch (error) {
    const code = getDatabaseErrorCode(error);

    if (code === "23505") {
      return NextResponse.json(
        { ok: false, message: "User ini sudah memiliki shipment pada tanggal tersebut" },
        { status: 409 },
      );
    }

    if (code === "23514") {
      return NextResponse.json(
        { ok: false, message: "Data shipment melanggar aturan validasi database" },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "Gagal menyimpan shipment admin";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const sessionResult = await validateAdminSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const json = await request.json();
    const areaId = sessionResult.areaId;

    const regularParsed = updateAdminRegularShipmentSchema.safeParse(json);

    if (regularParsed.success) {
      const payload = regularParsed.data;

      if (payload.area_id !== areaId) {
        return NextResponse.json(
          { ok: false, message: "Admin hanya boleh edit shipment pada area sendiri" },
          { status: 403 },
        );
      }

      const user = await getRegularUserInAdminArea({ nikKerja: payload.nik_kerja, areaId });

      if (!user) {
        return NextResponse.json(
          { ok: false, message: "User regular tidak ditemukan di area admin" },
          { status: 404 },
        );
      }

      const shipmentCode = resolveShipmentCode(payload);
      const alasanForDb = resolveShipmentFailureReasonsForDb(payload);
      const gagal = payload.jumlah_toko - payload.terkirim;

      const rows = await query<ShipmentRow>`
        UPDATE shipments
        SET
          user_id = ${user.user_id}::BIGINT,
          is_freelance = FALSE,
          nama_freelance = NULL,
          tanggal_shipment = ${payload.tanggal_shipment}::DATE,
          shipment_code = ${shipmentCode},
          jam_berangkat = ${payload.jam_berangkat ?? null}::TIME,
          jam_pulang = ${payload.jam_pulang ?? null}::TIME,
          jumlah_toko = ${payload.jumlah_toko},
          terkirim = ${payload.terkirim},
          gagal = ${gagal},
          alasan = ${alasanForDb}
        WHERE shipment_id = ${payload.shipment_id}
          AND area_id = ${areaId}::BIGINT
        RETURNING
          shipment_id,
          area_id::TEXT AS area_id,
          user_id::TEXT AS user_id,
          ${user.nik_kerja}::TEXT AS nik_kerja,
          is_freelance,
          nama_freelance,
          tanggal_shipment::TEXT AS tanggal_shipment,
          CASE
            WHEN shipment_code ~ '^[0-9]{10}$' THEN 'Aktif'
            ELSE shipment_code
          END AS status_shipment,
          shipment_code,
          jam_berangkat::TEXT AS jam_berangkat,
          jam_pulang::TEXT AS jam_pulang,
          jumlah_toko,
          terkirim,
          gagal,
          COALESCE(alasan, '') AS alasan
      `;

      if (!rows[0]) {
        return NextResponse.json(
          { ok: false, message: "Shipment tidak ditemukan di area admin" },
          { status: 404 },
        );
      }

      return NextResponse.json({
        ok: true,
        message: "Shipment regular berhasil diperbarui oleh admin",
        data: rows[0],
      });
    }

    const freelanceParsed = updateAdminFreelanceShipmentSchema.safeParse(json);

    if (!freelanceParsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Input edit shipment admin tidak valid",
          errors: {
            regular: regularParsed.error.flatten().fieldErrors,
            freelance: freelanceParsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 },
      );
    }

    const payload = freelanceParsed.data;

    if (payload.area_id !== areaId) {
      return NextResponse.json(
        { ok: false, message: "Admin hanya boleh edit shipment pada area sendiri" },
        { status: 403 },
      );
    }

    const shipmentCode = resolveShipmentCode(payload);
    const alasanForDb = resolveShipmentFailureReasonsForDb(payload);
    const gagal = payload.jumlah_toko - payload.terkirim;

    const rows = await query<ShipmentRow>`
      UPDATE shipments
      SET
        user_id = NULL,
        is_freelance = TRUE,
        nama_freelance = ${payload.nama_freelance},
        tanggal_shipment = ${payload.tanggal_shipment}::DATE,
        shipment_code = ${shipmentCode},
        jam_berangkat = ${payload.jam_berangkat ?? null}::TIME,
        jam_pulang = ${payload.jam_pulang ?? null}::TIME,
        jumlah_toko = ${payload.jumlah_toko},
        terkirim = ${payload.terkirim},
        gagal = ${gagal},
        alasan = ${alasanForDb}
      WHERE shipment_id = ${payload.shipment_id}
        AND area_id = ${areaId}::BIGINT
      RETURNING
        shipment_id,
        area_id::TEXT AS area_id,
        user_id::TEXT AS user_id,
        NULL::TEXT AS nik_kerja,
        is_freelance,
        nama_freelance,
        tanggal_shipment::TEXT AS tanggal_shipment,
        CASE
          WHEN shipment_code ~ '^[0-9]{10}$' THEN 'Aktif'
          ELSE shipment_code
        END AS status_shipment,
        shipment_code,
        jam_berangkat::TEXT AS jam_berangkat,
        jam_pulang::TEXT AS jam_pulang,
        jumlah_toko,
        terkirim,
        gagal,
        COALESCE(alasan, '') AS alasan
    `;

    if (!rows[0]) {
      return NextResponse.json(
        { ok: false, message: "Shipment tidak ditemukan di area admin" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Shipment freelance berhasil diperbarui oleh admin",
      data: rows[0],
    });
  } catch (error) {
    const code = getDatabaseErrorCode(error);

    if (code === "23505") {
      return NextResponse.json(
        { ok: false, message: "Data shipment sudah ada pada tanggal tersebut" },
        { status: 409 },
      );
    }

    if (code === "23514") {
      return NextResponse.json(
        { ok: false, message: "Data shipment melanggar aturan validasi database" },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "Gagal memperbarui shipment admin";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionResult = await validateAdminSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const json = await request.json();
    const parsed = deleteShipmentSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Input hapus shipment tidak valid",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const areaId = sessionResult.areaId;

    const rows = await query<ShipmentRow>`
      WITH deleted AS (
        DELETE FROM shipments
        WHERE shipment_id = ${parsed.data.shipment_id}
          AND area_id = ${areaId}::BIGINT
        RETURNING *
      )
      SELECT
        d.shipment_id,
        d.area_id::TEXT AS area_id,
        d.user_id::TEXT AS user_id,
        u.nik_kerja,
        d.is_freelance,
        d.nama_freelance,
        d.tanggal_shipment::TEXT AS tanggal_shipment,
        CASE
          WHEN d.shipment_code ~ '^[0-9]{10}$' THEN 'Aktif'
          ELSE d.shipment_code
        END AS status_shipment,
        d.shipment_code,
        d.jam_berangkat::TEXT AS jam_berangkat,
        d.jam_pulang::TEXT AS jam_pulang,
        d.jumlah_toko,
        d.terkirim,
        d.gagal,
        COALESCE(d.alasan, '') AS alasan
      FROM deleted d
      LEFT JOIN users u ON u.user_id = d.user_id
    `;

    if (!rows[0]) {
      return NextResponse.json(
        { ok: false, message: "Shipment tidak ditemukan di area admin" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Shipment berhasil dihapus oleh admin",
      data: rows[0],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menghapus shipment admin";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
