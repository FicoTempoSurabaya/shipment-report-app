import { z } from "zod";

import { normalizeDateOnlyInput } from "@/lib/date";
import { FAILURE_REASONS, SHIPMENT_STATUS } from "@/types/shipment";
import {
  USER_JABATAN as USER_JABATAN_VALUES,
  USER_ROLE as USER_ROLE_VALUES,
} from "@/types/user";

const dateStringSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      return normalizeDateOnlyInput(value, "Tanggal");
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Format tanggal tidak valid",
      });

      return z.NEVER;
    }
  });

const timeStringSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Format waktu harus HH:mm")
  .nullable()
  .optional();

const shipmentCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, "Kode shipment wajib 10 digit angka")
  .nullable()
  .optional();

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
});

export const updateProfileSchema = z.object({
  username: z.string().trim().min(3, "Username minimal 3 karakter"),
  password: z.string().min(1, "Password wajib diisi"),
});

export const areaSchema = z.object({
  area_id: z.string().trim().min(1, "Area ID wajib diisi"),
  nama_area: z.string().trim().min(1, "Nama area wajib diisi"),
  sla_area: z.coerce.number().int().min(0, "SLA area minimal 0"),
  spreadsheet_id: z.string().nullable().optional(),
  spreadsheet_url: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
});

export const userSchema = z.object({
  nik_kerja: z.string().trim().min(1, "NIK kerja wajib diisi"),
  area_id: z.string().trim().min(1, "Area wajib diisi").nullable(),
  nama_lengkap: z.string().trim().min(1, "Nama lengkap wajib diisi"),
  jabatan: z.enum(USER_JABATAN_VALUES),
  user_role: z.enum(USER_ROLE_VALUES),
  username: z.string().trim().min(3, "Username minimal 3 karakter"),
  password: z.string().min(1, "Password wajib diisi"),
  is_active: z.boolean().default(true),
});

export const failureReasonSchema = z
  .object({
    reason: z.enum(FAILURE_REASONS),
    note: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.reason === "Lainnya" && !value.note) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "Catatan wajib diisi jika memilih alasan lainnya",
      });
    }
  });

const baseShipmentShape = {
  area_id: z.string().trim().min(1, "Area wajib diisi"),
  tanggal_shipment: dateStringSchema,
  status_shipment: z.enum(SHIPMENT_STATUS).default("Aktif"),
  shipment_code: shipmentCodeSchema,
  jam_berangkat: timeStringSchema,
  jam_pulang: timeStringSchema,
  jumlah_toko: z.coerce.number().int().min(0, "Jumlah toko minimal 0"),
  terkirim: z.coerce.number().int().min(0, "Terkirim minimal 0"),
  alasan: z.array(failureReasonSchema).default([]),
};

function validateShipmentBusinessRules(
  value: {
    status_shipment: (typeof SHIPMENT_STATUS)[number];
    shipment_code?: string | null;
    jumlah_toko: number;
    terkirim: number;
    alasan: Array<z.infer<typeof failureReasonSchema>>;
  },
  ctx: z.RefinementCtx,
) {
  if (value.terkirim > value.jumlah_toko) {
    ctx.addIssue({
      code: "custom",
      path: ["terkirim"],
      message: "Terkirim tidak boleh lebih besar dari jumlah toko",
    });
  }

  if (value.status_shipment === "Aktif" && !value.shipment_code) {
    ctx.addIssue({
      code: "custom",
      path: ["shipment_code"],
      message: "Kode shipment wajib diisi jika status Aktif",
    });
  }

  const gagal = value.jumlah_toko - value.terkirim;

  if (gagal > 0 && value.alasan.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["alasan"],
      message: "Alasan wajib diisi jika ada toko gagal",
    });
  }
}

export const freelanceShipmentSchema = z
  .object({
    ...baseShipmentShape,
    nama_freelance: z.string().trim().min(1, "Nama freelance wajib diisi"),
  })
  .superRefine((value, ctx) => {
    validateShipmentBusinessRules(value, ctx);
  });

export const regularShipmentSchema = z
  .object({
    ...baseShipmentShape,
    nik_kerja: z.string().trim().min(1, "NIK kerja wajib diisi"),
  })
  .superRefine((value, ctx) => {
    validateShipmentBusinessRules(value, ctx);
  });

export const adminShipmentSchema = z
  .object({
    ...baseShipmentShape,
    nik_kerja: z.string().trim().min(1, "NIK kerja wajib diisi"),
  })
  .superRefine((value, ctx) => {
    validateShipmentBusinessRules(value, ctx);
  });


const nullableTrimmedStringSchema = z
  .string()
  .trim()
  .transform((value) => (value ? value : null))
  .nullable()
  .optional();

export const adminKunciShipmentSchema = z
  .object({
    nik_kerja: nullableTrimmedStringSchema,
    tanggal_awal: dateStringSchema,
    tanggal_akhir: dateStringSchema,
    keterangan_kunci: nullableTrimmedStringSchema,
  })
  .superRefine((value, ctx) => {
    if (value.tanggal_awal > value.tanggal_akhir) {
      ctx.addIssue({
        code: "custom",
        path: ["tanggal_akhir"],
        message: "Tanggal akhir tidak boleh lebih kecil dari tanggal awal",
      });
    }
  });

export const dashboardFilterSchema = z
  .object({
    start_date: dateStringSchema,
    end_date: dateStringSchema,
  })
  .superRefine((value, ctx) => {
    if (value.start_date > value.end_date) {
      ctx.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "Tanggal selesai tidak boleh lebih kecil dari tanggal mulai",
      });
    }
  });

export const deleteShipmentSchema = z.object({
  shipment_id: z.coerce.number().int().positive("Shipment ID tidak valid"),
});

export const adminCreateRegularUserSchema = z.object({
  nik_kerja: z.string().trim().min(1, "NIK kerja wajib diisi"),
  nama_lengkap: z.string().trim().min(1, "Nama lengkap wajib diisi"),
  jabatan: z.enum(USER_JABATAN_VALUES).default("Driver"),
  username: z.string().trim().min(3, "Username minimal 3 karakter"),
  password: z.string().min(1, "Password wajib diisi"),
  is_active: z.boolean().default(true),
});

export const adminUpdateRegularUserSchema = z.object({
  nik_kerja: z.string().trim().min(1, "NIK kerja wajib diisi"),
  nama_lengkap: z.string().trim().min(1, "Nama lengkap wajib diisi"),
  jabatan: z.enum(USER_JABATAN_VALUES),
  username: z.string().trim().min(3, "Username minimal 3 karakter"),
  password: z.string().min(1, "Password wajib diisi"),
  is_active: z.boolean(),
});

export const adminSpreadsheetSchema = z.object({
  spreadsheet_id: z.string().trim().min(1, "Spreadsheet ID wajib diisi"),
  spreadsheet_url: z
    .string()
    .trim()
    .url("Spreadsheet URL tidak valid")
    .min(1, "Spreadsheet URL wajib diisi"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AreaInput = z.infer<typeof areaSchema>;
export type UserInput = z.infer<typeof userSchema>;
export type FailureReasonInput = z.infer<typeof failureReasonSchema>;
export type FreelanceShipmentInput = z.infer<typeof freelanceShipmentSchema>;
export type RegularShipmentInput = z.infer<typeof regularShipmentSchema>;
export type AdminShipmentInput = z.infer<typeof adminShipmentSchema>;
export type DashboardFilterInput = z.infer<typeof dashboardFilterSchema>;
export type DeleteShipmentInput = z.infer<typeof deleteShipmentSchema>;
export type AdminCreateRegularUserInput = z.infer<typeof adminCreateRegularUserSchema>;
export type AdminUpdateRegularUserInput = z.infer<typeof adminUpdateRegularUserSchema>;
export type AdminSpreadsheetInput = z.infer<typeof adminSpreadsheetSchema>;
export type AdminKunciShipmentInput = z.infer<typeof adminKunciShipmentSchema>;
