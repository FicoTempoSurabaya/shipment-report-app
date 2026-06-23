import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { validateSpreadsheetRequest } from "@/lib/spreadsheet-auth";

type BulkDeletePayload = {
  shipment_ids?: unknown;
};

type ShipmentTargetRow = {
  shipment_id: string;
  tanggal_shipment: string;
  nik_kerja: string | null;
};

type FailedItem = {
  shipment_id: string;
  message: string;
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
  );
}

async function isShipmentLocked(params: {
  areaId: string;
  tanggalShipment: string;
  nikKerja: string | null;
}): Promise<boolean> {
  const rows = await query<{ locked: boolean }>`
    SELECT EXISTS (
      SELECT 1
      FROM kunci_shipment k
      WHERE k.area_id = ${params.areaId}
        AND ${params.tanggalShipment}::DATE BETWEEN k.tanggal_awal AND k.tanggal_akhir
        AND (
          k.nik_kerja IS NULL
          OR k.nik_kerja = ${params.nikKerja}
        )
    ) AS locked
  `;

  return Boolean(rows[0]?.locked);
}

async function handleBulkDelete(request: Request) {
  const auth = await validateSpreadsheetRequest(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const payload = (await request.json()) as BulkDeletePayload;
    const shipmentIds = normalizeShipmentIds(payload.shipment_ids);
    const deletedIds: string[] = [];
    const failedItems: FailedItem[] = [];

    if (shipmentIds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Tidak ada shipment_id valid untuk dihapus",
        deleted: 0,
        failed: 0,
        deleted_ids: [],
        failed_items: [],
      });
    }

    for (const shipmentId of shipmentIds) {
      try {
        const targets = await query<ShipmentTargetRow>`
          SELECT
            shipment_id::TEXT AS shipment_id,
            tanggal_shipment::TEXT AS tanggal_shipment,
            nik_kerja
          FROM shipments
          WHERE shipment_id = ${shipmentId}::BIGINT
            AND area_id = ${auth.context.areaId}
          LIMIT 1
        `;

        const target = targets[0];

        if (!target) {
          failedItems.push({ shipment_id: shipmentId, message: "Shipment tidak ditemukan pada area spreadsheet" });
          continue;
        }

        const locked = await isShipmentLocked({
          areaId: auth.context.areaId,
          tanggalShipment: target.tanggal_shipment,
          nikKerja: target.nik_kerja,
        });

        if (locked) {
          failedItems.push({ shipment_id: shipmentId, message: "Shipment sedang terkunci" });
          continue;
        }

        const deleted = await query<{ shipment_id: string }>`
          DELETE FROM shipments
          WHERE shipment_id = ${shipmentId}::BIGINT
            AND area_id = ${auth.context.areaId}
          RETURNING shipment_id::TEXT AS shipment_id
        `;

        if (!deleted[0]) {
          failedItems.push({ shipment_id: shipmentId, message: "Shipment gagal dihapus" });
          continue;
        }

        deletedIds.push(deleted[0].shipment_id);
      } catch (error) {
        failedItems.push({
          shipment_id: shipmentId,
          message: error instanceof Error ? error.message : "Gagal menghapus shipment",
        });
      }
    }

    return NextResponse.json({
      ok: failedItems.length === 0,
      status: failedItems.length === 0 ? "SUCCESS" : deletedIds.length > 0 ? "PARTIAL" : "FAILED",
      message: failedItems.length === 0 ? "Shipment berhasil dihapus permanen" : "Sebagian shipment gagal dihapus",
      deleted: deletedIds.length,
      failed: failedItems.length,
      deleted_ids: deletedIds,
      failed_items: failedItems,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal bulk delete shipments";

    return NextResponse.json(
      {
        ok: false,
        status: "FAILED",
        message,
        deleted: 0,
        failed: 0,
        deleted_ids: [],
        failed_items: [],
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: Request) {
  return handleBulkDelete(request);
}

export async function DELETE(request: Request) {
  return handleBulkDelete(request);
}
