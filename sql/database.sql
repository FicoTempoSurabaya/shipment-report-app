CREATE SCHEMA IF NOT EXISTS public;

CREATE TYPE user_jabatan_enum AS ENUM (
  'Driver',
  'Fico',
  'Team_Leader'
);

CREATE TYPE user_role_enum AS ENUM (
  'regular',
  'admin',
  'superadmin'
);

CREATE TABLE area (
  area_id varchar(20) PRIMARY KEY,
  nama_area varchar(100) NOT NULL,
  sla_area integer NOT NULL,
  spreadsheet_id text,
  spreadsheet_url text,
  is_active boolean DEFAULT true NOT NULL,

  CONSTRAINT area_sla_area_check
    CHECK (sla_area >= 0)
);

CREATE TABLE users (
  nik_kerja varchar(30) PRIMARY KEY,
  area_id varchar(20),
  nama_lengkap varchar(150) NOT NULL,
  jabatan user_jabatan_enum NOT NULL,
  user_role user_role_enum DEFAULT 'regular' NOT NULL,
  username varchar(100) NOT NULL UNIQUE,
  password text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT users_area_id_fkey
    FOREIGN KEY (area_id)
    REFERENCES area (area_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

CREATE TABLE libur_kalender (
  libur_id bigserial PRIMARY KEY,
  tanggal_libur date NOT NULL UNIQUE,
  keterangan_libur text NOT NULL
);

CREATE TABLE kunci_shipment (
  kunci_id bigserial PRIMARY KEY,
  area_id varchar(20) NOT NULL,
  nik_kerja varchar(30),
  tanggal_awal date NOT NULL,
  tanggal_akhir date NOT NULL,
  keterangan_kunci text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT kunci_shipment_tanggal_check
    CHECK (tanggal_akhir >= tanggal_awal),

  CONSTRAINT kunci_shipment_area_required_check
    CHECK (area_id IS NOT NULL),

  CONSTRAINT kunci_shipment_area_id_fkey
    FOREIGN KEY (area_id)
    REFERENCES area (area_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT kunci_shipment_nik_kerja_fkey
    FOREIGN KEY (nik_kerja)
    REFERENCES users (nik_kerja)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

CREATE TABLE shipments (
  shipment_id bigserial PRIMARY KEY,
  area_id varchar(20) NOT NULL,
  nik_kerja varchar(30),
  is_freelance boolean DEFAULT false NOT NULL,
  nama_freelance varchar(150),
  tanggal_shipment date NOT NULL,

  /*
    status_shipment sudah dihapus dari database.

    Logika status sekarang diatur backend:
    - Jika status = Aktif:
      shipment_code wajib 10 digit angka.
    - Jika status bukan Aktif:
      shipment_code diisi nama status yang dipilih.
  */
  shipment_code varchar(30) NOT NULL,

  jam_berangkat time,
  jam_pulang time,
  jumlah_toko integer DEFAULT 0 NOT NULL,
  terkirim integer DEFAULT 0 NOT NULL,
  gagal integer GENERATED ALWAYS AS (jumlah_toko - terkirim) STORED,

  /*
    alasan disimpan sebagai teks biasa agar mudah dibaca/ditulis dari Google Sheets, DBeaver, dan aplikasi lain.
    Contoh: Toko Tutup; Tidak Cukup Waktu; Lainnya: jalan ditutup
  */
  alasan text,

  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT shipments_area_id_fkey
    FOREIGN KEY (area_id)
    REFERENCES area (area_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT shipments_nik_kerja_fkey
    FOREIGN KEY (nik_kerja)
    REFERENCES users (nik_kerja)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT shipments_code_backend_status_check
    CHECK (
      shipment_code ~ '^[0-9]{10}$'
      OR shipment_code IN (
        'Sakit',
        'Izin',
        'Alpha',
        'Cuti',
        'SO',
        'Service',
        'Loading Sore',
        'Libur Nasional',
        'Kirim Ulang',
        'Kiur Unit',
        'Standby'
      )
    ),

  CONSTRAINT shipments_jumlah_toko_check
    CHECK (jumlah_toko >= 0),

  CONSTRAINT shipments_terkirim_check
    CHECK (terkirim >= 0),

  CONSTRAINT shipments_terkirim_max_check
    CHECK (terkirim <= jumlah_toko),


  CONSTRAINT shipments_alasan_null_when_no_failure_check
    CHECK (
      gagal <> 0
      OR alasan IS NULL
    ),

  CONSTRAINT shipments_regular_freelance_check
    CHECK (
      (
        is_freelance = false
        AND nik_kerja IS NOT NULL
        AND nama_freelance IS NULL
      )
      OR
      (
        is_freelance = true
        AND nik_kerja IS NULL
        AND nama_freelance IS NOT NULL
      )
    )
);

CREATE INDEX idx_kunci_shipment_nik
  ON kunci_shipment (nik_kerja);

CREATE INDEX idx_kunci_shipment_range
  ON kunci_shipment (tanggal_awal, tanggal_akhir);

CREATE INDEX idx_kunci_shipment_area_range
  ON kunci_shipment (area_id, tanggal_awal, tanggal_akhir);

CREATE INDEX users_area_role_idx
  ON users (area_id, user_role, is_active);

CREATE INDEX shipments_area_date_idx
  ON shipments (area_id, tanggal_shipment);

CREATE INDEX shipments_nik_date_idx
  ON shipments (nik_kerja, tanggal_shipment);

CREATE UNIQUE INDEX shipments_regular_unique_per_day
  ON shipments (nik_kerja, tanggal_shipment)
  WHERE is_freelance = false;

CREATE UNIQUE INDEX shipments_freelance_unique_per_day
  ON shipments (area_id, lower(nama_freelance), tanggal_shipment)
  WHERE is_freelance = true;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


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

CREATE TRIGGER trg_kunci_shipment_validate_user_area
BEFORE INSERT OR UPDATE ON kunci_shipment
FOR EACH ROW
EXECUTE FUNCTION validate_kunci_shipment_user_area();

CREATE TRIGGER trg_kunci_shipment_updated_at
BEFORE UPDATE ON kunci_shipment
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_shipments_updated_at
BEFORE UPDATE ON shipments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();