import type { UserRole } from "@/types/user";

export type AuthSession = {
  user_id: string;
  nik_kerja: string;
  area_id: string | null;
  area_code: string | null;
  nama_lengkap: string;
  username: string;
  user_role: UserRole;
};
