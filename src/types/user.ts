export const USER_JABATAN = ["Driver"] as const;
export const USER_ROLE = ["regular", "admin", "superadmin"] as const;

export type UserJabatan = (typeof USER_JABATAN)[number];
export type UserRole = (typeof USER_ROLE)[number];

export type User = {
  nik_kerja: string;
  area_id: string | null;
  nama_lengkap: string;
  jabatan: UserJabatan;
  user_role: UserRole;
  username: string;
  password: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};