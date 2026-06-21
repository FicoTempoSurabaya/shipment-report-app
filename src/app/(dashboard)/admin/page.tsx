"use client";

import { Loader2, LockKeyhole, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";

import { DateCompactCard } from "@/components/dashboard/DateCompactCard";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { DashboardShell } from "@/components/layout/DashboardShell";

type AdminDateCard = {
  date: string;
  is_sunday: boolean;
  is_holiday: boolean;
  holiday_note: string | null;
  jumlah_shipment: number;
};

type StatusMetric = {
  status: string;
  count: number;
};

type AdminDashboardData = {
  admin: {
    nik_kerja: string;
    area_id: string;
    nama_lengkap: string;
    username: string;
    user_role: "admin";
  };
  area: {
    area_id: string;
    nama_area: string;
    sla_area: number;
  };
  filter: {
    start_date: string;
    end_date: string;
  };
  metrics: {
    hk: number;
    hke: number;
    sla: number;
    status_counts: StatusMetric[];
  };
  cards: AdminDateCard[];
};

type AdminDashboardResponse = {
  ok: boolean;
  message?: string;
  data?: AdminDashboardData;
};

function getDateCardStatus(card: AdminDateCard) {
  if (card.is_sunday) {
    return "sunday" as const;
  }

  if (card.is_holiday) {
    return "holiday" as const;
  }

  if (card.jumlah_shipment > 0) {
    return "filled" as const;
  }

  return "empty" as const;
}

function getDateCardDescription(card: AdminDateCard) {
  if (card.is_sunday) {
    return `Libur Minggu · Jumlah Shipment: ${card.jumlah_shipment}`;
  }

  if (card.is_holiday) {
    return `${card.holiday_note ?? "Libur"} · Jumlah Shipment: ${
      card.jumlah_shipment
    }`;
  }

  return `Jumlah Shipment: ${card.jumlah_shipment}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const safeHex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;

  const value = Number.parseInt(safeHex, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function toHex(value: number) {
  return Math.round(value).toString(16).padStart(2, "0");
}

function mixHexColor(from: string, to: string, progress: number) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const t = clamp(progress, 0, 1);

  const r = start.r + (end.r - start.r) * t;
  const g = start.g + (end.g - start.g) * t;
  const b = start.b + (end.b - start.b) * t;

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getAchievementAccentColor(target: number, achieved: number) {
  const black = "#0f172a";
  const gray = "#64748b";
  const red = "#ef4444";
  const yellow = "#eab308";
  const green = "#22c55e";
  const targetColor = "#06b6d4";

  if (target <= 0) {
    return black;
  }

  const ratio = clamp(achieved / target, 0, 1);

  if (ratio === 0) {
    return black;
  }

  if (ratio === 1) {
    return targetColor;
  }

  if (ratio < 0.31) {
    return mixHexColor(gray, red, ratio / 0.31);
  }

  if (ratio < 0.46) {
    return mixHexColor(red, yellow, (ratio - 0.31) / (0.46 - 0.31));
  }

  if (ratio < 0.71) {
    return mixHexColor(yellow, green, (ratio - 0.46) / (0.71 - 0.46));
  }

  return mixHexColor(green, targetColor, (ratio - 0.71) / (1 - 0.71));
}

export default function AdminPage() {
  const router = useRouter();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [hasLoadedDashboard, setHasLoadedDashboard] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const hkeAccentColor = useMemo(() => {
    if (!hasLoadedDashboard || !data) {
      return "#0f172a";
    }

    return getAchievementAccentColor(data.metrics.hk, data.metrics.hke);
  }, [data, hasLoadedDashboard]);

  const hkeAccentSoft = useMemo(() => {
    return hexToRgba(hkeAccentColor, 0.12);
  }, [hkeAccentColor]);

  const loadDashboard = useCallback(async () => {
    if (!startDate || !endDate) {
      toast.error("Tanggal mulai dan tanggal selesai wajib diisi");
      return;
    }

    if (endDate < startDate) {
      toast.error("Tanggal selesai tidak boleh lebih kecil dari tanggal mulai");
      return;
    }

    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
      });

      const response = await fetch(`/api/admin/dashboard?${params.toString()}`, {
        method: "GET",
        credentials: "include",
      });

      const result = (await response.json()) as AdminDashboardResponse;

      if (!response.ok || !result.ok) {
        toast.error(result.message || "Gagal mengambil dashboard admin");
        setData(null);
        setHasLoadedDashboard(false);
        return;
      }

      setData(result.data ?? null);
      setHasLoadedDashboard(true);
    } catch {
      toast.error("Tidak bisa terhubung ke server");
      setData(null);
      setHasLoadedDashboard(false);
    } finally {
      setIsLoading(false);
    }
  }, [endDate, startDate]);

  function openDateDetail(date: string) {
    router.push(`/admin/tanggal/${date}`);
  }

  function openKunciShipment() {
    router.push("/admin/kunci-shipment");
  }

  return (
    <DashboardShell
      description="Pantau performa shipment area, SLA, rasio, dan detail input per tanggal."
      hideIntroPanel
      profilePath="/admin/profile"
      roleLabel="Admin Dashboard"
      title="Dashboard Admin"
      userName={data?.admin.nama_lengkap}
      headerActions={
        <button
          aria-label="Kelola kunci shipment"
          className="ind-btn-secondary px-3"
          title="Kelola kunci shipment"
          type="button"
          onClick={openKunciShipment}
        >
          <LockKeyhole className="h-4 w-4" />
        </button>
      }
    >
      <Toaster richColors position="top-center" />

      <div className="sticky top-[73px] z-20 -mx-4 mb-6 border-b-2 border-[var(--border-soft)] bg-[var(--background)] px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="ind-card-flat mb-4 grid grid-cols-2 gap-3 p-5 lg:grid-cols-[1fr_1fr_auto_auto] lg:gap-4">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
              Tanggal Mulai
            </span>
            <input
              className="ind-input"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
              Tanggal Selesai
            </span>
            <input
              className="ind-input"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>

          <div className="self-end">
            <div className="flex min-h-11 min-w-24 items-center justify-center border-2 border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-black uppercase tracking-[0.12em] text-[var(--steel)] shadow-[3px_3px_0_rgba(15,23,42,0.06)]">
              <span className="mr-2 text-[0.625rem] text-[var(--muted)]">
                SLA
              </span>
              <span>{hasLoadedDashboard ? data?.metrics.sla ?? "" : ""}</span>
            </div>
          </div>

          <button
            className="ind-btn-primary self-end"
            disabled={isLoading}
            type="button"
            onClick={loadDashboard}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Search className="h-5 w-5" />
            )}
            Tampilkan
          </button>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-full gap-3">
            <div className="w-32 shrink-0">
              <MetricCard
                title="HK"
                value={hasLoadedDashboard ? data?.metrics.hk ?? 0 : ""}
              />
            </div>

            <div className="w-32 shrink-0">
              <MetricCard
                accentColor={hkeAccentColor}
                iconBackgroundColor={hkeAccentSoft}
                iconBorderColor={hkeAccentColor}
                iconColor={hkeAccentColor}
                title="HKE"
                value={hasLoadedDashboard ? data?.metrics.hke ?? 0 : ""}
              />
            </div>

            {hasLoadedDashboard && data
              ? data.metrics.status_counts.map((item) => (
                  <div key={item.status} className="w-32 shrink-0">
                    <MetricCard
                      title={item.status.toUpperCase()}
                      value={item.count}
                    />
                  </div>
                ))
              : null}
          </div>
        </div>
      </div>


      {isLoading ? (
        <div className="ind-card-flat flex min-h-72 items-center justify-center">
          <div className="flex items-center gap-3 text-sm font-bold text-[var(--muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Memuat dashboard admin...
          </div>
        </div>
      ) : null}

      {!isLoading && hasLoadedDashboard && data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.cards.map((card) => (
            <DateCompactCard
              key={card.date}
              action="edit"
              date={card.date}
              keterangan={getDateCardDescription(card)}
              readOnly={false}
              status={getDateCardStatus(card)}
              onClick={() => openDateDetail(card.date)}
            />
          ))}
        </div>
      ) : null}

      {!isLoading && hasLoadedDashboard && data?.cards.length === 0 ? (
        <div className="ind-card-flat p-8 text-center">
          <p className="text-sm font-bold text-[var(--steel)]">
            Data tidak ditemukan.
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Ubah rentang tanggal lalu tekan Tampilkan.
          </p>
        </div>
      ) : null}
    </DashboardShell>
  );
}