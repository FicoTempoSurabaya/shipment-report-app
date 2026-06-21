"use client";

import { LayoutDashboard, LogOut, Truck, UserRound } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";

type DashboardShellProps = {
  title: string;
  description: string;
  roleLabel: string;
  userName?: string;
  profilePath?: string;
  headerActions?: ReactNode;
  hideIntroPanel?: boolean;
  children: ReactNode;
};

export function DashboardShell({
  title,
  description,
  roleLabel,
  userName,
  profilePath,
  headerActions,
  hideIntroPanel = false,
  children,
}: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  const isProfilePage = Boolean(profilePath && pathname === profilePath);
  const dashboardPath = profilePath?.replace(/\/profile$/, "") || "/";
  const navigationPath = isProfilePage ? dashboardPath : profilePath;
  const navigationLabel = isProfilePage ? "Dashboard" : userName || "Profile";
  const NavigationIcon = isProfilePage ? LayoutDashboard : UserRound;

  async function handleLogout() {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        toast.error("Logout gagal");
        return;
      }

      toast.success("Logout berhasil");
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Tidak bisa terhubung ke server");
    }
  }

  return (
    <main className="min-h-screen text-[var(--steel)]">
      <header className="ind-header">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="ind-icon-box">
              <Truck className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <p className="ind-label-accent sm:text-xs">{roleLabel}</p>
              <h1 className="ind-heading truncate text-base sm:text-xl">{title}</h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {headerActions}

            {navigationPath ? (
              <button
                className="ind-btn-ghost px-3 sm:px-4"
                type="button"
                onClick={() => router.push(navigationPath)}
              >
                <NavigationIcon className="h-4 w-4" />
                <span className="hidden max-w-40 truncate sm:inline">
                  {navigationLabel}
                </span>
              </button>
            ) : null}

            <button
              className="ind-btn-danger px-3 sm:px-4"
              type="button"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        {!hideIntroPanel ? (
          <div className="ind-card mb-5 overflow-hidden p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="ind-label">Shipment Control</p>
                <div className="ind-divider-accent mt-3" />
                <h2 className="ind-heading mt-4 text-2xl sm:text-3xl">{title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
                  {description}
                </p>
              </div>

              <div className="hidden h-12 w-28 border-2 border-[var(--border-soft)] bg-[var(--primary-soft)] sm:block" />
            </div>
          </div>
        ) : null}

        {children}
      </section>
    </main>
  );
}