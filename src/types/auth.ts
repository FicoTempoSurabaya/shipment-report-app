import type { UserRole } from "@/types/user";

export type AuthSession = {
  nik_kerja: string;
  area_id: string | null;
  nama_lengkap: string;
  username: string;
  user_role: UserRole;
};