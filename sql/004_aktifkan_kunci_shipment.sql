BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM kunci_shipment
    WHERE area_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Masih ada data kunci_shipment dengan area_id NULL. Rapikan data tersebut sebelum menjalankan migrasi.';
  END IF;
END;
$$;

ALTER TABLE kunci_shipment
  ALTER COLUMN area_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kunci_shipment_area_required_check'
      AND conrelid = 'kunci_shipment'::regclass
  ) THEN
    ALTER TABLE kunci_shipment
      ADD CONSTRAINT kunci_shipment_area_required_check
      CHECK (area_id IS NOT NULL);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_kunci_shipment_user_area()
RETURNS trigger AS $$
BEGIN
  IF NEW.nik_kerja IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM users
    WHERE users.nik_kerja = NEW.nik_kerja
      AND users.area_id = NEW.area_id
  ) THEN
    RAISE EXCEPTION 'nik_kerja pada kunci_shipment harus berada di area_id yang sama';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kunci_shipment_validate_user_area ON kunci_shipment;

CREATE TRIGGER trg_kunci_shipment_validate_user_area
BEFORE INSERT OR UPDATE ON kunci_shipment
FOR EACH ROW
EXECUTE FUNCTION validate_kunci_shipment_user_area();

CREATE INDEX IF NOT EXISTS idx_kunci_shipment_area_nik_range
  ON kunci_shipment (area_id, nik_kerja, tanggal_awal, tanggal_akhir);

COMMIT;
