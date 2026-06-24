CREATE SCHEMA "public";
CREATE TYPE "user_jabatan_enum" AS ENUM('Driver', 'Fico', 'Team_Leader');
CREATE TYPE "user_role_enum" AS ENUM('regular', 'admin', 'superadmin');
CREATE TYPE "area_timezone_enum" AS ENUM('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura');
CREATE TABLE "area" (
	"area_id" varchar(20) PRIMARY KEY,
	"nama_area" varchar(100) NOT NULL,
	"sla_area" integer NOT NULL,
	"spreadsheet_id" text,
	"spreadsheet_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"area_timezone" area_timezone_enum DEFAULT 'Asia/Jakarta' NOT NULL,
	CONSTRAINT "area_sla_area_check" CHECK ((sla_area >= 0))
);
CREATE TABLE "kunci_shipment" (
	"kunci_id" bigserial PRIMARY KEY,
	"area_id" varchar(20),
	"nik_kerja" varchar(30),
	"tanggal_awal" date NOT NULL,
	"tanggal_akhir" date NOT NULL,
	"keterangan_kunci" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kunci_shipment_tanggal_check" CHECK ((tanggal_akhir >= tanggal_awal))
);
CREATE TABLE "libur_kalender" (
	"libur_id" bigserial PRIMARY KEY,
	"tanggal_libur" date NOT NULL CONSTRAINT "libur_kalender_tanggal_libur_key" UNIQUE,
	"keterangan_libur" text NOT NULL
);
CREATE TABLE "shipments" (
	"shipment_id" bigserial PRIMARY KEY,
	"area_id" varchar(20) NOT NULL,
	"nik_kerja" varchar(30),
	"is_freelance" boolean DEFAULT false NOT NULL,
	"nama_freelance" varchar(150),
	"tanggal_shipment" date NOT NULL,
	"shipment_code" varchar(30) NOT NULL,
	"jam_berangkat" time,
	"jam_pulang" time,
	"jumlah_toko" integer DEFAULT 0 NOT NULL,
	"terkirim" integer DEFAULT 0 NOT NULL,
	"gagal" integer GENERATED ALWAYS AS ((jumlah_toko - terkirim)) STORED,
	"alasan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_alasan_null_when_no_failure_check" CHECK (((gagal <> 0) OR (alasan IS NULL))),
	CONSTRAINT "shipments_code_backend_status_check" CHECK ((((shipment_code)::text ~ '^[0-9]{10}$'::text) OR ((shipment_code)::text = ANY ((ARRAY['Sakit'::character varying, 'Izin'::character varying, 'Alpha'::character varying, 'Cuti'::character varying, 'SO'::character varying, 'Service'::character varying, 'Loading Sore'::character varying, 'Libur Nasional'::character varying, 'Kirim Ulang'::character varying, 'Kiur Unit'::character varying, 'Standby'::character varying])::text[])))),
	CONSTRAINT "shipments_jumlah_toko_check" CHECK ((jumlah_toko >= 0)),
	CONSTRAINT "shipments_regular_freelance_check" CHECK ((((is_freelance = false) AND (nik_kerja IS NOT NULL) AND (nama_freelance IS NULL)) OR ((is_freelance = true) AND (nik_kerja IS NULL) AND (nama_freelance IS NOT NULL)))),
	CONSTRAINT "shipments_terkirim_check" CHECK ((terkirim >= 0)),
	CONSTRAINT "shipments_terkirim_max_check" CHECK ((terkirim <= jumlah_toko))
);
CREATE TABLE "users" (
	"nik_kerja" varchar(30) PRIMARY KEY,
	"area_id" varchar(20),
	"nama_lengkap" varchar(150) NOT NULL,
	"jabatan" user_jabatan_enum NOT NULL,
	"user_role" user_role_enum DEFAULT 'regular' NOT NULL,
	"username" varchar(100) NOT NULL CONSTRAINT "users_username_key" UNIQUE,
	"password" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "area_pkey" ON "area" ("area_id");
CREATE INDEX "idx_area_area_timezone" ON "area" ("area_timezone");
CREATE INDEX "idx_kunci_shipment_area_range" ON "kunci_shipment" ("area_id","tanggal_awal","tanggal_akhir");
CREATE INDEX "idx_kunci_shipment_nik" ON "kunci_shipment" ("nik_kerja");
CREATE INDEX "idx_kunci_shipment_range" ON "kunci_shipment" ("tanggal_awal","tanggal_akhir");
CREATE UNIQUE INDEX "kunci_shipment_pkey" ON "kunci_shipment" ("kunci_id");
CREATE UNIQUE INDEX "libur_kalender_pkey" ON "libur_kalender" ("libur_id");
CREATE UNIQUE INDEX "libur_kalender_tanggal_libur_key" ON "libur_kalender" ("tanggal_libur");
CREATE INDEX "shipments_area_date_idx" ON "shipments" ("area_id","tanggal_shipment");
CREATE UNIQUE INDEX "shipments_freelance_unique_per_day" ON "shipments" ("area_id","lower((nama_freelance)::text)","tanggal_shipment");
CREATE INDEX "shipments_nik_date_idx" ON "shipments" ("nik_kerja","tanggal_shipment");
CREATE UNIQUE INDEX "shipments_pkey" ON "shipments" ("shipment_id");
CREATE UNIQUE INDEX "shipments_regular_unique_per_day" ON "shipments" ("nik_kerja","tanggal_shipment");
CREATE INDEX "users_area_role_idx" ON "users" ("area_id","user_role","is_active");
CREATE UNIQUE INDEX "users_pkey" ON "users" ("nik_kerja");
CREATE UNIQUE INDEX "users_username_key" ON "users" ("username");
ALTER TABLE "kunci_shipment" ADD CONSTRAINT "kunci_shipment_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("area_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kunci_shipment" ADD CONSTRAINT "kunci_shipment_nik_kerja_fkey" FOREIGN KEY ("nik_kerja") REFERENCES "users"("nik_kerja") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("area_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_nik_kerja_fkey" FOREIGN KEY ("nik_kerja") REFERENCES "users"("nik_kerja") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("area_id") ON DELETE RESTRICT ON UPDATE CASCADE;