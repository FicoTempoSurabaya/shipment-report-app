"use client";

import { Eye, EyeOff, Loader2, Save, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast, Toaster } from "sonner";

import { DashboardShell } from "@/components/layout/DashboardShell";

type RegularProfile = {
  nik_kerja: string;
  area_id: string | null;
  nama_area: string | null;
  nama_lengkap: string;
  username: string;
  password: string;
};

type ProfileResponse = {
  ok: boolean;
  message?: string;
  data?: RegularProfile;
  errors?: Record<string, string[] | undefined>;
};

export default function RegularProfilePage() {
  const [profile, setProfile] = useState<RegularProfile | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const isSubmitDisabled = useMemo(() => {
    return (
      isSaving ||
      !profile ||
      username.trim().length < 3 ||
      password.length === 0
    );
  }, [isSaving, password, profile, username]);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/regular/profile", {
        method: "GET",
        credentials: "include",
      });

      const result = (await response.json()) as ProfileResponse;

      if (!response.ok || !result.ok || !result.data) {
        toast.error(result.message || "Gagal mengambil profile regular");
        return;
      }

      setProfile(result.data);
      setUsername(result.data.username);
      setPassword(result.data.password);
    } catch {
      toast.error("Tidak bisa terhubung ke server");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProfile();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadProfile]);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitDisabled) {
      toast.error("Username dan password wajib diisi");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/regular/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const result = (await response.json()) as ProfileResponse;

      if (!response.ok || !result.ok || !result.data) {
        toast.error(result.message || "Gagal memperbarui profile");
        return;
      }

      setProfile(result.data);
      setUsername(result.data.username);
      setPassword(result.data.password);
      toast.success(result.message || "Profile berhasil diperbarui");
    } catch {
      toast.error("Tidak bisa terhubung ke server");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <DashboardShell
      description="Kelola username dan password akun regular."
      hideIntroPanel
      profilePath="/regular/profile"
      roleLabel="Regular Profile"
      title="Profile Regular"
      userName={profile?.nama_lengkap}
    >
      <Toaster richColors position="top-center" />

      {isLoading ? (
        <div className="ind-card-flat flex min-h-72 items-center justify-center">
          <div className="flex items-center gap-3 text-sm font-bold text-[var(--muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Memuat profile...
          </div>
        </div>
      ) : null}

      {!isLoading && profile ? (
        <section className="ind-card p-5 sm:p-6">
          <div className="mb-6 flex items-start gap-4">
            <div className="ind-icon-box">
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div>
              <p className="ind-label">Data User</p>
              <h2 className="ind-heading mt-2 text-2xl">Profile Regular</h2>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="ind-stat-box p-4">
                <p className="ind-label">NIK Kerja</p>
                <p className="mt-2 break-words font-mono text-sm font-black text-[var(--steel)]">
                  {profile.nik_kerja}
                </p>
              </div>

              <div className="ind-stat-box p-4">
                <p className="ind-label">Area</p>
                <p className="mt-2 break-words text-sm font-black text-[var(--steel)]">
                  {profile.nama_area ?? "-"}
                </p>
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                Nama Lengkap
              </span>
              <input
                className="ind-input cursor-not-allowed text-[var(--muted)]"
                readOnly
                value={profile.nama_lengkap}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                Username
              </span>
              <input
                className="ind-input placeholder:text-[var(--muted)]"
                autoComplete="username"
                placeholder="Username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                Password
              </span>
              <div className="flex items-center gap-3 border-2 border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3 transition focus-within:border-[var(--primary)]">
                <input
                  className="w-full bg-transparent text-sm font-semibold text-[var(--steel)] outline-none placeholder:text-[var(--muted)]"
                  autoComplete="current-password"
                  placeholder="Password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />

                <button
                  aria-label={
                    showPassword ? "Sembunyikan password" : "Tampilkan password"
                  }
                  className="p-1 text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--steel)]"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </label>

            <div className="flex justify-end">
              <button
                className="ind-btn-primary"
                disabled={isSubmitDisabled}
                type="submit"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Menyimpan
                  </>
                ) : (
                  <>
                    <Save className="h-5 w-5" />
                    Simpan
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {!isLoading && !profile ? (
        <div className="ind-card-flat p-8 text-center">
          <p className="text-sm font-bold text-[var(--steel)]">
            Profile tidak ditemukan.
          </p>
        </div>
      ) : null}
    </DashboardShell>
  );
}