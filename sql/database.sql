-- =========================================================
-- Shipment Report App - Database Schema Terbaru
-- PostgreSQL
-- Berdasarkan skema baru: area, users, libur_kalender,
-- shipments, dan kunci_shipment.
-- =========================================================

BEGIN;

-- =========================================================
-- OPTIONAL RESET
-- Aktifkan hanya jika database/schema memang akan dibangun ulang.
-- =========================================================

-- DROP TABLE IF EXISTS kunci_shipment CASCADE;
-- DROP TABLE IF EXISTS shipments CASCADE;
-- DROP TABLE IF EXISTS libur_kalender CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;
-- DROP TABLE IF EXISTS area CASCADE;
-- DROP TYPE IF EXISTS area_timezone_enum CASCADE;
-- DROP TYPE IF EXISTS user_jabatan_enum CASCADE;
-- DROP TYPE IF EXISTS user_role_enum CASCADE;

-- =========================================================
-- ENUM
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'area_timezone_enum') THEN
    CREATE TYPE area_timezone_enum AS ENUM (
      'Asia/Jakarta',
      'Asia/Makassar',
      'Asia/Jayapura'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_jabatan_enum') THEN
    CREATE TYPE user_jabatan_enum AS ENUM (
      'Team Leader',
      'Field Coordinator',
      'Driver'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN
    CREATE TYPE user_role_enum AS ENUM (
      'super_admin',
      'admin',
      'regular'
    );
  END IF;
END $$;

-- =========================================================
-- FUNCTION AUTO UPDATE updated_at
-- =========================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- TABLE: area
-- =========================================================

CREATE TABLE IF NOT EXISTS area (
  area_id BIGSERIAL PRIMARY KEY,
  area_code VARCHAR(20) NOT NULL,
  nama_area VARCHAR(100) NOT NULL,
  sla_area INTEGER NOT NULL,
  spreadsheet_id TEXT NULL,
  spreadsheet_url TEXT NULL,
  area_timezone area_timezone_enum NOT NULL DEFAULT 'Asia/Jakarta',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_area_code_not_empty CHECK (btrim(area_code) <> ''),
  CONSTRAINT chk_nama_area_not_empty CHECK (btrim(nama_area) <> ''),
  CONSTRAINT chk_sla_area_positive CHECK (sla_area > 0)
);

DROP TRIGGER IF EXISTS trg_area_updated_at ON area;
CREATE TRIGGER trg_area_updated_at
BEFORE UPDATE ON area
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =========================================================
-- TABLE: users
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
  user_id BIGSERIAL PRIMARY KEY,
  nik_kerja VARCHAR(30) NOT NULL,
  area_id BIGINT NOT NULL,
  nama_lengkap VARCHAR(60) NOT NULL,
  jabatan user_jabatan_enum NOT NULL,
  user_role user_role_enum NOT NULL DEFAULT 'regular',
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_users_area
    FOREIGN KEY (area_id)
    REFERENCES area(area_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT chk_users_nik_kerja_not_empty CHECK (btrim(nik_kerja) <> ''),
  CONSTRAINT chk_users_nama_lengkap_not_empty CHECK (btrim(nama_lengkap) <> ''),
  CONSTRAINT chk_users_username_not_empty CHECK (btrim(username) <> ''),
  CONSTRAINT chk_users_password_not_empty CHECK (btrim(password) <> '')
);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =========================================================
-- TABLE: libur_kalender
-- =========================================================

CREATE TABLE IF NOT EXISTS libur_kalender (
  libur_id BIGSERIAL PRIMARY KEY,
  tanggal_libur DATE NOT NULL,
  keterangan_libur TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_libur_kalender_tanggal UNIQUE (tanggal_libur)
);

DROP TRIGGER IF EXISTS trg_libur_kalender_updated_at ON libur_kalender;
CREATE TRIGGER trg_libur_kalender_updated_at
BEFORE UPDATE ON libur_kalender
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =========================================================
-- TABLE: shipments
-- =========================================================

CREATE TABLE IF NOT EXISTS shipments (
  shipment_id BIGSERIAL PRIMARY KEY,
  area_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  is_freelance BOOLEAN NULL DEFAULT FALSE,
  nama_freelance TEXT NULL,
  tanggal_shipment DATE NULL,
  shipment_code VARCHAR(30) NOT NULL,
  jam_berangkat TIME NULL,
  jam_pulang TIME NULL,
  jumlah_toko INTEGER NULL,
  terkirim INTEGER NULL,
  gagal INTEGER NULL,
  alasan TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_shipments_area
    FOREIGN KEY (area_id)
    REFERENCES area(area_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,

  CONSTRAINT fk_shipments_user
    FOREIGN KEY (user_id)
    REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  CONSTRAINT chk_shipments_code_not_empty CHECK (btrim(shipment_code) <> ''),
  CONSTRAINT chk_shipments_jumlah_toko_non_negative CHECK (jumlah_toko IS NULL OR jumlah_toko >= 0),
  CONSTRAINT chk_shipments_terkirim_non_negative CHECK (terkirim IS NULL OR terkirim >= 0),
  CONSTRAINT chk_shipments_gagal_non_negative CHECK (gagal IS NULL OR gagal >= 0),
  CONSTRAINT chk_shipments_total_result_not_exceed_jumlah_toko
    CHECK (
      jumlah_toko IS NULL
      OR (COALESCE(terkirim, 0) + COALESCE(gagal, 0)) <= jumlah_toko
    ),
  CONSTRAINT chk_shipments_regular_or_freelance
    CHECK (
      (COALESCE(is_freelance, FALSE) = FALSE AND user_id IS NOT NULL AND nama_freelance IS NULL)
      OR
      (is_freelance = TRUE AND user_id IS NULL AND nama_freelance IS NOT NULL AND btrim(nama_freelance) <> '')
    )
);

DROP TRIGGER IF EXISTS trg_shipments_updated_at ON shipments;
CREATE TRIGGER trg_shipments_updated_at
BEFORE UPDATE ON shipments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =========================================================
-- TABLE: kunci_shipment
-- =========================================================

CREATE TABLE IF NOT EXISTS kunci_shipment (
  kunci_id BIGSERIAL PRIMARY KEY,
  area_id BIGINT NULL,
  user_id BIGINT NULL,
  tanggal_awal DATE NOT NULL,
  tanggal_akhir DATE NOT NULL,
  keterangan_kunci TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_kunci_shipment_area
    FOREIGN KEY (area_id)
    REFERENCES area(area_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  CONSTRAINT fk_kunci_shipment_user
    FOREIGN KEY (user_id)
    REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  CONSTRAINT chk_kunci_shipment_tanggal_valid CHECK (tanggal_awal <= tanggal_akhir),
  CONSTRAINT chk_kunci_shipment_keterangan_not_empty CHECK (btrim(keterangan_kunci) <> '')
);

DROP TRIGGER IF EXISTS trg_kunci_shipment_updated_at ON kunci_shipment;
CREATE TRIGGER trg_kunci_shipment_updated_at
BEFORE UPDATE ON kunci_shipment
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =========================================================
-- UNIQUE INDEX
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_area_area_code_lower
ON area (lower(area_code));

CREATE UNIQUE INDEX IF NOT EXISTS ux_area_spreadsheet_id
ON area (spreadsheet_id)
WHERE spreadsheet_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_nik_kerja_lower
ON users (lower(nik_kerja));

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username_lower
ON users (lower(username));

CREATE UNIQUE INDEX IF NOT EXISTS ux_shipments_regular_user_date
ON shipments (user_id, tanggal_shipment)
WHERE user_id IS NOT NULL AND tanggal_shipment IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_shipments_freelance_area_name_date
ON shipments (area_id, lower(nama_freelance), tanggal_shipment)
WHERE is_freelance = TRUE
  AND nama_freelance IS NOT NULL
  AND tanggal_shipment IS NOT NULL;

-- =========================================================
-- NORMAL INDEX
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_area_is_active ON area (is_active);
CREATE INDEX IF NOT EXISTS idx_area_timezone ON area (area_timezone);

CREATE INDEX IF NOT EXISTS idx_users_area_id ON users (area_id);
CREATE INDEX IF NOT EXISTS idx_users_area_active ON users (area_id, is_active);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (user_role);
CREATE INDEX IF NOT EXISTS idx_users_jabatan ON users (jabatan);

CREATE INDEX IF NOT EXISTS idx_libur_kalender_tanggal ON libur_kalender (tanggal_libur);

CREATE INDEX IF NOT EXISTS idx_shipments_area_id ON shipments (area_id);
CREATE INDEX IF NOT EXISTS idx_shipments_user_id ON shipments (user_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tanggal ON shipments (tanggal_shipment);
CREATE INDEX IF NOT EXISTS idx_shipments_area_tanggal ON shipments (area_id, tanggal_shipment);
CREATE INDEX IF NOT EXISTS idx_shipments_user_tanggal ON shipments (user_id, tanggal_shipment);
CREATE INDEX IF NOT EXISTS idx_shipments_area_user_tanggal ON shipments (area_id, user_id, tanggal_shipment);
CREATE INDEX IF NOT EXISTS idx_shipments_code ON shipments (shipment_code);
CREATE INDEX IF NOT EXISTS idx_shipments_freelance ON shipments (is_freelance);
CREATE INDEX IF NOT EXISTS idx_shipments_aktif_10_digit ON shipments (area_id, tanggal_shipment)
WHERE shipment_code ~ '^[0-9]{10}$';
CREATE INDEX IF NOT EXISTS idx_shipments_non_aktif ON shipments (area_id, tanggal_shipment, shipment_code)
WHERE shipment_code !~ '^[0-9]{10}$';

CREATE INDEX IF NOT EXISTS idx_kunci_shipment_area_id ON kunci_shipment (area_id);
CREATE INDEX IF NOT EXISTS idx_kunci_shipment_user_id ON kunci_shipment (user_id);
CREATE INDEX IF NOT EXISTS idx_kunci_shipment_tanggal ON kunci_shipment (tanggal_awal, tanggal_akhir);
CREATE INDEX IF NOT EXISTS idx_kunci_shipment_area_tanggal ON kunci_shipment (area_id, tanggal_awal, tanggal_akhir);
CREATE INDEX IF NOT EXISTS idx_kunci_shipment_user_tanggal ON kunci_shipment (user_id, tanggal_awal, tanggal_akhir);
CREATE INDEX IF NOT EXISTS idx_kunci_shipment_range_gist ON kunci_shipment
USING gist (daterange(tanggal_awal, tanggal_akhir, '[]'));

COMMIT;
