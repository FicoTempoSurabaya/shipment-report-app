"use client";

import { Loader2, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";

import { DateCompactCard } from "@/components/dashboard/DateCompactCard";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  ShipmentModal,
  type RegularShipmentForModal,
} from "@/components/shipment/ShipmentModal";

type RegularDateCard = {
  date: string;
  status: "holiday" | "sunday" | "locked" | "filled" | "empty";
  keterangan: string;
  read_only: boolean;
  action: "none" | "input" | "edit";
  shipment: RegularShipmentForModal | null;
  lock: {
    kunci_id: number;
    area_id: string;
    nik_kerja: string | null;
    keterangan_kunci: string | null;
  } | null;
};

type StatusMetric = {
  status: string;
  count: number;
};

type RegularDashboardData = {
  user: {
    nik_kerja: string;
    area_id: string | null;
    nama_lengkap: string;
    username: string;
    user_role: "regular";
  };
  filter: {
    start_date: string;
    end_date: string;
  };
  metrics: {
    hk: number;
    hke: number;
    status_counts: StatusMetric[];
  };
  cards: RegularDateCard[];
};

type RegularDashboardResponse = {
  ok: boolean;
  message?: string;
  data?: RegularDashboardData;
};

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

function getHkeAccentColor(hk: number, hke: number) {
  const black = "#0f172a";
  const gray = "#64748b";
  const red = "#ef4444";
  const yellow = "#eab308";
  const green = "#22c55e";
  const hkColor = "#06b6d4";

  if (hk <= 0) {
    return black;
  }

  const ratio = clamp(hke / hk, 0, 1);

  if (ratio === 0) {
    return black;
  }

  if (ratio === 1) {
    return hkColor;
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

  return mixHexColor(green, hkColor, (ratio - 0.71) / (1 - 0.71));
}

export default function RegularPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [data, setData] = useState<RegularDashboardData | null>(null);
  const [hasLoadedDashboard, setHasLoadedDashboard] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeCard, setActiveCard] = useState<RegularDateCard | null>(null);

  const hkeAccentColor = useMemo(() => {
    if (!hasLoadedDashboard || !data) {
      return "#0f172a";
    }

    return getHkeAccentColor(data.metrics.hk, data.metrics.hke);
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
    setActiveCard(null);

    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
      });

      const response = await fetch(`/api/regular/dashboard?${params.toString()}`, {
        method: "GET",
        credentials: "include",
      });

      const result = (await response.json()) as RegularDashboardResponse;

      if (!response.ok || !result.ok) {
        toast.error(result.message || "Gagal mengambil dashboard regular");
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

  function handleCardClick(card: RegularDateCard) {
    if (card.read_only || card.action === "none") {
      return;
    }

    setActiveCard(card);
  }

  return (
    <DashboardShell
      description="Pantau HK, HKE, dan status input shipment pribadi berdasarkan rentang tanggal."
      hideIntroPanel
      profilePath="/regular/profile"
      roleLabel="Regular Dashboard"
      title="Dashboard Regular"
      userName={data?.user.nama_lengkap}
    >
      <Toaster richColors position="top-center" />

      <div className="sticky top-[73px] z-20 -mx-4 mb-6 border-b-2 border-[var(--border-soft)] bg-[var(--background)] px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="ind-card-flat mb-4 grid grid-cols-2 gap-4 p-5 lg:grid-cols-[1fr_1fr_auto]">
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

          <button
            className="ind-btn-primary col-span-2 lg:col-span-1 lg:self-end"
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
                  <div key={item.status} className="w-40 shrink-0 h-full">
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
            Memuat dashboard...
          </div>
        </div>
      ) : null}

      {!isLoading && hasLoadedDashboard && data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.cards.map((card) => (
            <DateCompactCard
              key={card.date}
              action={card.action}
              date={card.date}
              keterangan={card.keterangan}
              readOnly={card.read_only}
              status={card.status}
              onClick={() => handleCardClick(card)}
            />
          ))}
        </div>
      ) : null}

      {!isLoading && hasLoadedDashboard && data?.cards.length === 0 ? (
        <div className="ind-card-flat p-8 text-center">
          <p className="text-sm font-bold text-[var(--steel)]">Data tidak ditemukan.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Ubah rentang tanggal lalu tekan Tampilkan.
          </p>
        </div>
      ) : null}

      {activeCard && data ? (
        <ShipmentModal
          date={activeCard.date}
          mode={activeCard.action === "edit" ? "edit" : "input"}
          open={Boolean(activeCard)}
          shipment={activeCard.shipment}
          user={{
            nik_kerja: data.user.nik_kerja,
            area_id: data.user.area_id,
            nama_lengkap: data.user.nama_lengkap,
          }}
          onClose={() => setActiveCard(null)}
          onSaved={loadDashboard}
        />
      ) : null}
    </DashboardShell>
  );
}