"use client";

import { Eye, EyeOff, Loader2, LockKeyhole, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, SyntheticEvent, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";

type LoginSuccessResponse = {
  ok: true;
  message: string;
  redirect_to: string;
  user: {
    nik_kerja: string;
    area_id: string | null;
    nama_lengkap: string;
    username: string;
    user_role: "regular" | "admin" | "superadmin";
  };
};

type LoginErrorResponse = {
  ok: false;
  message: string;
  errors?: Record<string, string[] | undefined>;
};

type LoginApiResponse = LoginSuccessResponse | LoginErrorResponse;

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = searchParams.get("next");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSubmitDisabled = useMemo(() => {
    return isSubmitting || username.trim().length === 0 || password.length === 0;
  }, [isSubmitting, username, password]);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitDisabled) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = (await response.json()) as LoginApiResponse;

      if (!response.ok || !data.ok) {
        toast.error(data.message || "Login gagal");
        return;
      }

      toast.success(data.message || "Login berhasil");

      const redirectTo =
        nextPath && nextPath.startsWith("/") ? nextPath : data.redirect_to;

      router.replace(redirectTo);
      router.refresh();
    } catch {
      toast.error("Tidak bisa terhubung ke server");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen text-[var(--steel)]">
      <Toaster richColors position="top-center" />

      <section className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden overflow-hidden border-r-[3px] border-[var(--steel)] bg-[var(--surface-soft)] lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(6,182,212,0.35),transparent_34%),radial-gradient(circle_at_80%_70%,rgba(249,115,22,0.18),transparent_30%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(51,65,85,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(51,65,85,0.07)_1px,transparent_1px)] bg-[size:40px_40px]" />

          <div className="relative flex h-full flex-col justify-between p-12">
            <div className="h-9" aria-hidden="true" />

            <div className="max-w-xl">
              <div className="ind-badge-orange mb-6">
                Industrial Control Panel
              </div>
              <div className="ind-divider-accent mb-6" />

              <h1 className="ind-heading text-5xl leading-tight">
                Kendali laporan shipment harian driver logistik.
              </h1>

              <p className="mt-6 max-w-lg text-base leading-7 text-[var(--muted)]">
                Login multi-level untuk regular, admin, dan superadmin. Data
                langsung terhubung ke database real tanpa dummy.
              </p>
            </div>

            <div className="grid max-w-xl grid-cols-3 gap-3">
              <div className="ind-stat-box p-4">
                <p className="ind-label">Mode</p>
                <p className="mt-2 text-sm font-black text-[var(--steel)]">
                  Secure Session
                </p>
              </div>
              <div className="ind-stat-box p-4">
                <p className="ind-label">Access</p>
                <p className="mt-2 text-sm font-black text-[var(--steel)]">
                  Role Based
                </p>
              </div>
              <div className="ind-stat-box p-4">
                <p className="ind-label">Data</p>
                <p className="mt-2 text-sm font-black text-[var(--steel)]">
                  Real DB
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="ind-panel p-6 sm:p-8">
              <div className="mb-5">
                <p className="ind-label-accent">Authorized Access</p>
                <div className="ind-divider-accent mt-3" />
                <h2 className="ind-heading mt-4 text-3xl">Login Panel</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  Gunakan username dan password yang terdaftar.
                </p>
              </div>

              <form className="space-y-3" onSubmit={handleSubmit}>
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                    Username
                  </span>
                  <div className="w-full h-12 flex items-center gap-3 border-2 border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3 transition focus-within:border-[var(--primary)]">
                    <UserRound className="h-5 w-5 text-[var(--muted)]" />
                    <input
                      className="w-full bg-transparent text-sm font-semibold text-[var(--steel)] outline-none placeholder:text-[var(--muted)]"
                      autoComplete="username"
                      placeholder="Masukkan username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                    Password
                  </span>
                  <div className="w-full h-12 flex items-center gap-3 border-2 border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3 transition focus-within:border-[var(--primary)]">
                    <LockKeyhole className="h-5 w-5 text-[var(--muted)]" />
                    <input
                      className="w-full bg-transparent text-sm font-semibold text-[var(--steel)] outline-none placeholder:text-[var(--muted)]"
                      autoComplete="current-password"
                      placeholder="Masukkan password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <button
                      aria-label={
                        showPassword
                          ? "Sembunyikan password"
                          : "Tampilkan password"
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

                <button
                  className="ind-btn-primary w-full"
                  disabled={isSubmitDisabled}
                  type="submit"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Memproses
                    </>
                  ) : (
                    "Login"
                  )}
                </button>
              </form>
            </div>

            <button
              className="mt-4 w-full h-12 border-[3px] border-[var(--steel)] bg-[var(--steel)] px-4 py-auto text-center text-sm font-white text-white transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:bg-[var(--surface-soft)] hover:text-[var(--primary)]"
              type="button"
              onClick={() => router.push("/freelance")}
            >
              Freelance
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function LoginFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center text-[var(--steel)]">
      <div className="ind-panel p-6 text-center">
        <p className="ind-label-accent">Authorized Access</p>
        <p className="mt-3 text-sm font-bold text-[var(--muted)]">
          Memuat halaman login...
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
