import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { isSunday } from "@/lib/date";
import { query } from "@/lib/db";
import { getRegularShipmentLock, getShipmentLockMessage } from "@/lib/kunci-shipment";
import {
  resolveShipmentCode,
  resolveShipmentFailureReasonsForDb,
} from "@/lib/shipment";
import { regularShipmentSchema } from "@/lib/validation";
import type { ShipmentFailureReason, ShipmentStatus } from "@/types/shipment";

type ShipmentRow = {
  shipment_id: number;
  area_id: string;
  user_id: string | null;
  nik_kerja: string;
  tanggal_shipment: string;
  status_shipment: ShipmentStatus;
  shipment_code: string;
  jam_berangkat: string | null;
  jam_pulang: string | null;
  jumlah_toko: number;
  terkirim: number;
  gagal: number;
  alasan: ShipmentFailureReason[];
};

type HolidayRow = {
  exists: boolean;
  keterangan_libur: string | null;
};

type ExistingRegularShipmentRow = {
  shipment_id: number;
  tanggal_shipment: string;
};

const updateRegularShipmentSchema = regularShipmentSchema.extend({
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

async function validateRegularSession() {
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

  if (session.user_role !== "regular") {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "Endpoint ini hanya untuk user regular",
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
          message: "User regular tidak memiliki area",
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
  };
}

async function getExistingRegularShipment(params: {
  shipmentId: number;
  areaId: string;
  userId: string;
}) {
  const rows = await query<ExistingRegularShipmentRow>`
    SELECT
      shipment_id,
      tanggal_shipment::TEXT AS tanggal_shipment
    FROM shipments
    WHERE shipment_id = ${params.shipmentId}
      AND area_id = ${params.areaId}::BIGINT
      AND user_id = ${params.userId}::BIGINT
      AND is_freelance = FALSE
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function validateRegularEditableDate(params: {
  tanggalShipment: string;
  areaId: string;
  userId: string;
  mode: "create" | "update_existing";
}) {
  const lock = await getRegularShipmentLock({
    areaId: params.areaId,
    userId: params.userId,
    tanggalShipment: params.tanggalShipment,
  });

  if (lock) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: `Tanggal shipment terkunci: ${getShipmentLockMessage(lock)}`,
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (params.mode === "update_existing") {
    return {
      ok: true as const,
    };
  }

  if (isSunday(params.tanggalShipment)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "Tanggal hari Minggu tidak bisa diisi oleh regular",
        },
        {
          status: 403,
        },
      ),
    };
  }

  const holidayRows = await query<HolidayRow>`
    SELECT
      EXISTS (
        SELECT 1
        FROM libur_kalender
        WHERE tanggal_libur = ${params.tanggalShipment}::DATE
      ) AS exists,
      (
        SELECT keterangan_libur
        FROM libur_kalender
        WHERE tanggal_libur = ${params.tanggalShipment}::DATE
        LIMIT 1
      ) AS keterangan_libur
  `;

  const holiday = holidayRows[0];

  if (holiday?.exists) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: holiday.keterangan_libur
            ? `Tanggal libur tidak bisa diisi oleh regular: ${holiday.keterangan_libur}`
            : "Tanggal libur tidak bisa diisi oleh regular",
        },
        {
          status: 403,
        },
      ),
    };
  }

  return {
    ok: true as const,
  };
}

export async function POST(request: Request) {
  try {
    const sessionResult = await validateRegularSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const json = await request.json();
    const parsed = regularShipmentSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Input shipment regular tidak valid",
          errors: parsed.error.flatten().fieldErrors,
        },
        {
          status: 400,
        },
      );
    }

    const payload = parsed.data;

    if (payload.nik_kerja !== sessionResult.session.nik_kerja) {
      return NextResponse.json(
        {
          ok: false,
          message: "Regular hanya boleh input shipment miliknya sendiri",
        },
        {
          status: 403,
        },
      );
    }

    if (payload.area_id !== sessionResult.session.area_id) {
      return NextResponse.json(
        {
          ok: false,
          message: "Area shipment tidak sesuai dengan area user",
        },
        {
          status: 403,
        },
      );
    }

    const dateResult = await validateRegularEditableDate({
      tanggalShipment: payload.tanggal_shipment,
      areaId: sessionResult.session.area_id,
      userId: sessionResult.session.user_id,
      mode: "create",
    });

    if (!dateResult.ok) {
      return dateResult.response;
    }

    const shipmentCode = resolveShipmentCode(payload);
    const alasanForDb = resolveShipmentFailureReasonsForDb(payload);

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
        ${sessionResult.session.area_id}::BIGINT,
        ${sessionResult.session.user_id}::BIGINT,
        FALSE,
        NULL,
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
        user_id::TEXT AS user_id,
        ${sessionResult.session.nik_kerja}::TEXT AS nik_kerja,
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
        message: "Shipment regular berhasil disimpan",
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
          message: "User ini sudah memiliki shipment pada tanggal tersebut",
        },
        {
          status: 409,
        },
      );
    }

    if (code === "23514") {
      return NextResponse.json(
        {
          ok: false,
          message: "Data shipment melanggar aturan validasi database",
        },
        {
          status: 400,
        },
      );
    }

    const message =
      error instanceof Error ? error.message : "Gagal menyimpan shipment regular";

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
    const sessionResult = await validateRegularSession();

    if (!sessionResult.ok) {
      return sessionResult.response;
    }

    const json = await request.json();
    const parsed = updateRegularShipmentSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Input edit shipment regular tidak valid",
          errors: parsed.error.flatten().fieldErrors,
        },
        {
          status: 400,
        },
      );
    }

    const payload = parsed.data;

    if (payload.nik_kerja !== sessionResult.session.nik_kerja) {
      return NextResponse.json(
        {
          ok: false,
          message: "Regular hanya boleh edit shipment miliknya sendiri",
        },
        {
          status: 403,
        },
      );
    }

    if (payload.area_id !== sessionResult.session.area_id) {
      return NextResponse.json(
        {
          ok: false,
          message: "Area shipment tidak sesuai dengan area user",
        },
        {
          status: 403,
        },
      );
    }

    const existingShipment = await getExistingRegularShipment({
      shipmentId: payload.shipment_id,
      areaId: sessionResult.session.area_id,
      userId: sessionResult.session.user_id,
    });

    if (!existingShipment) {
      return NextResponse.json(
        {
          ok: false,
          message: "Shipment tidak ditemukan atau bukan milik user ini",
        },
        {
          status: 404,
        },
      );
    }

    if (existingShipment.tanggal_shipment.slice(0, 10) !== payload.tanggal_shipment) {
      return NextResponse.json(
        {
          ok: false,
          message: "Tanggal shipment regular tidak boleh diubah",
        },
        {
          status: 400,
        },
      );
    }

    const dateResult = await validateRegularEditableDate({
      tanggalShipment: payload.tanggal_shipment,
      areaId: sessionResult.session.area_id,
      userId: sessionResult.session.user_id,
      mode: "update_existing",
    });

    if (!dateResult.ok) {
      return dateResult.response;
    }

    const shipmentCode = resolveShipmentCode(payload);
    const alasanForDb = resolveShipmentFailureReasonsForDb(payload);

    const rows = await query<ShipmentRow>`
      UPDATE shipments
      SET
        shipment_code = ${shipmentCode},
        jam_berangkat = ${payload.jam_berangkat ?? null}::TIME,
        jam_pulang = ${payload.jam_pulang ?? null}::TIME,
        jumlah_toko = ${payload.jumlah_toko},
        terkirim = ${payload.terkirim},
        gagal = ${payload.jumlah_toko - payload.terkirim},
        alasan = ${alasanForDb}
      WHERE shipment_id = ${payload.shipment_id}
        AND user_id = ${sessionResult.session.user_id}::BIGINT
        AND area_id = ${sessionResult.session.area_id}::BIGINT
        AND is_freelance = FALSE
      RETURNING
        shipment_id,
        area_id::TEXT AS area_id,
        user_id::TEXT AS user_id,
        ${sessionResult.session.nik_kerja}::TEXT AS nik_kerja,
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
        {
          ok: false,
          message: "Shipment tidak ditemukan atau bukan milik user ini",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Shipment regular berhasil diperbarui",
      data: rows[0],
    });
  } catch (error) {
    const code = getDatabaseErrorCode(error);

    if (code === "23514") {
      return NextResponse.json(
        {
          ok: false,
          message: "Data shipment melanggar aturan validasi database",
        },
        {
          status: 400,
        },
      );
    }

    const message =
      error instanceof Error ? error.message : "Gagal memperbarui shipment regular";

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
