-- Final spreadsheet sync migration for shipments.
-- 1) Convert alasan from jsonb to text.
-- 2) Add indexes for incremental fetching by updated_at.
-- 3) Keep hard delete behavior for shipment deletion from spreadsheet.

ALTER TABLE shipments
  DROP CONSTRAINT IF EXISTS shipments_alasan_nullable_array_check;

ALTER TABLE shipments
  ALTER COLUMN alasan TYPE text
  USING CASE
    WHEN alasan IS NULL THEN NULL
    WHEN jsonb_typeof(alasan) = 'array' THEN (
      SELECT string_agg(
        CASE
          WHEN item ? 'note' AND NULLIF(item->>'note', '') IS NOT NULL
            THEN CONCAT(item->>'reason', ': ', item->>'note')
          ELSE item->>'reason'
        END,
        '; '
      )
      FROM jsonb_array_elements(alasan) AS item
    )
    ELSE alasan::text
  END;

CREATE INDEX IF NOT EXISTS idx_shipments_area_updated_at
  ON shipments (area_id, updated_at, shipment_id);

CREATE INDEX IF NOT EXISTS idx_shipments_area_tanggal_shipment
  ON shipments (area_id, tanggal_shipment, shipment_id);
