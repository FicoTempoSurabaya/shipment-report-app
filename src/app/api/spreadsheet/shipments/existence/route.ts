import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { validateSpreadsheetRequest } from "@/lib/spreadsheet-auth";

type ExistencePayload = {
  shipment_ids?: unknown;
};

type ShipmentIdRow = {
  shipment_id: string;
};

function normalizeShipmentIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter((item) => /^\d+$/.test(item)),
    ),
  ).slice(0, 1000);
}

export async function POST(request: Request) {
  const auth = await validateSpreadsheetRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const payload = (await request.json()) as ExistencePayload;
    const shipmentIds = normalizeShipmentIds(payload.shipment_ids);

    if (shipmentIds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Tidak ada shipment_id untuk dicek",
        checked: 0,
        existing_ids: [],
        missing_ids: [],
      });
    }

    const rows = await query<ShipmentIdRow>`
      SELECT shipment_id::TEXT AS shipment_id
      FROM shipments
      WHERE area_id = ${auth.context.areaId}::BIGINT
        AND shipment_id = ANY(${shipmentIds}::BIGINT[])
    `;

    const existing = new Set(rows.map((row) => row.shipment_id));
    const existingIds = shipmentIds.filter((id) => existing.has(id));
    const missingIds = shipmentIds.filter((id) => !existing.has(id));

    return NextResponse.json({
      ok: true,
      message: "Cek keberadaan shipment selesai",
      checked: shipmentIds.length,
      existing_ids: existingIds,
      missing_ids: missingIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengecek keberadaan shipments";

    return NextResponse.json(
      {
        ok: false,
        message,
        checked: 0,
        existing_ids: [],
        missing_ids: [],
      },
      {
        status: 500,
      },
    );
  }
}
