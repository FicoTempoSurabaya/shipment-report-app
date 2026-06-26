export const USER_JABATAN = ["Team Leader", "Field Coordinator", "Driver"] as const;
export const USER_ROLE = ["regular", "admin", "super_admin"] as const;

export type UserJabatan = (typeof USER_JABATAN)[number];
export type UserRole = (typeof USER_ROLE)[number];

export type User = {
  user_id: string;
  nik_kerja: string;
  area_id: string | null;
  area_code: string | null;
  nama_lengkap: string;
  jabatan: UserJabatan;
  user_role: UserRole;
  username: string;
  password: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
