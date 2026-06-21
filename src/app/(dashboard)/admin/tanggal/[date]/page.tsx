"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { AdminShipmentModal } from "@/components/shipment/AdminShipmentModal";
import type {
  ShipmentFailureReason,
  ShipmentStatus,
} from "@/types/shipment";

type AdminTanggalItem = {
  person_type: "regular" | "freelance";
  nik_kerja: string | null;
  nama_lengkap: string;
  status: "Regular" | "Freelance";
  action: "input" | "edit_delete";
  shipment_code_display: string;
  shipment: {
    shipment_id: number;
    area_id: string;
    nik_kerja: string | null;
    is_freelance: boolean;
    nama_freelance: string | null;
    tanggal_shipment: string;
    status_shipment: ShipmentStatus;
    shipment_code: string | null;
    jam_berangkat: string | null;
    jam_pulang: string | null;
    jumlah_toko: number;
    terkirim: number;
    gagal: number;
    alasan: ShipmentFailureReason[];
  } | null;
};

type DetailTanggalResponse = {
  tanggal: string;
  area_id: string;
  nama_area: string;
  sla_area: number;
  total_regular: number;
  total_freelance: number;
  total_efektif: number;
  total_non_efektif: number;
  items: AdminTanggalItem[];
};

function formatDateLabel(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function SummaryBox({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string | number;
  compact?: boolean;
}) {
  return (
    <div className={`ind-stat-box ${compact ? "px-3 py-3" : "px-4 py-4"}`}>
      <p className="ind-label">{label}</p>
      <p className={`ind-heading mt-2 ${compact ? "text-xl" : "text-2xl"}`}>{value}</p>
    </div>
  );
}

export default function AdminTanggalDetailPage() {
  const params = useParams<{ date: string }>();
  const router = useRouter();

  const [data, setData] = useState<DetailTanggalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AdminTanggalItem | null>(
    null,
  );

  const dateParam = Array.isArray(params?.date)
    ? params.date[0]
    : (params?.date ?? "");

  const loadDetail = useCallback(
    async (isManualRefresh = false) => {
      try {
        setError("");

        if (isManualRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const response = await fetch(`/api/admin/tanggal/${dateParam}`, {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok || !result?.ok) {
          throw new Error(
            result?.message || "Gagal mengambil detail tanggal admin",
          );
        }

        setData(result.data as DetailTanggalResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dateParam],
  );

  useEffect(() => {
    if (!dateParam) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void loadDetail();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [dateParam, loadDetail]);

  const pageTitle = useMemo(() => {
    return `Detail Tanggal ${formatDateLabel(dateParam)}`;
  }, [dateParam]);

  function openInput(item: AdminTanggalItem) {
    setSelectedItem(item);
    setModalOpen(true);
  }

  function openEdit(item: AdminTanggalItem) {
    setSelectedItem(item);
    setModalOpen(true);
  }

  async function handleDelete(item: AdminTanggalItem) {
    if (!item.shipment?.shipment_id) {
      return;
    }

    const confirmDelete = window.confirm(
      `Hapus shipment untuk ${item.nama_lengkap}?`,
    );

    if (!confirmDelete) {
      return;
    }

    try {
      const response = await fetch("/api/admin/shipments", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shipment_id: item.shipment.shipment_id,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "Gagal menghapus shipment");
      }

      await loadDetail(true);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Gagal menghapus shipment",
      );
    }
  }

  return (
    <DashboardShell
      title={pageTitle}
      description=""
      roleLabel="Detail Tanggal"
      profilePath="/admin/profile"
      userName="Admin"
      hideIntroPanel
    >
      <div className="space-y-4">
        {error ? (
          <div className="ind-alert-error">{error}</div>
        ) : null}

        {/* ACTION BUTTONS */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => router.back()}
            className="ind-btn-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </button>

          <button
            type="button"
            onClick={() => void loadDetail(true)}
            disabled={refreshing}
            className="ind-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        {/* SUMMARY */}
        <div className="overflow-x-auto pb-1">
          <div className="grid min-w-[760px] grid-cols-5 gap-2 lg:min-w-0">
            <SummaryBox
              compact
              label="SLA"
              value={loading ? "..." : (data?.sla_area ?? 0)}
            />
            <SummaryBox
              compact
              label="Regular"
              value={loading ? "..." : (data?.total_regular ?? 0)}
            />
            <SummaryBox
              compact
              label="Freelance"
              value={loading ? "..." : (data?.total_freelance ?? 0)}
            />
            <SummaryBox
              compact
              label="Efektif"
              value={loading ? "..." : (data?.total_efektif ?? 0)}
            />
            <SummaryBox
              compact
              label="Non Efektif"
              value={loading ? "..." : (data?.total_non_efektif ?? 0)}
            />
          </div>
        </div>

        {/* TABLE */}
        <div className="ind-table-wrap">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="ind-table-head">
                <tr>
                  <th className="px-3 py-3 text-left ind-label text-slate-200">
                    Status
                  </th>
                  <th className="px-3 py-3 text-left ind-label text-slate-200">
                    Nama Lengkap
                  </th>
                  <th className="px-3 py-3 text-left ind-label text-slate-200">
                    Shipment Code
                  </th>
                  <th className="px-3 py-3 text-right ind-label text-slate-200">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-sm font-semibold text-[var(--muted)]"
                    >
                      Memuat data...
                    </td>
                  </tr>
                ) : data?.items?.length ? (
                  data.items.map((item, index) => (
                    <tr
                      key={`${item.person_type}-${item.nik_kerja ?? "freelance"}-${item.nama_lengkap}-${index}`}
                      className="border-t-2 border-[var(--border-soft)]"
                    >
                      <td className="px-3 py-3 align-top">
                        <span
                          className={`inline-flex border-2 px-2 py-1 text-[11px] font-black ${
                            item.status === "Freelance"
                              ? "ind-badge-orange"
                              : "ind-badge-cyan"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>

                      <td className="px-3 py-3 align-top font-bold text-[var(--steel)]">
                        {item.nama_lengkap}
                      </td>

                      <td className="px-3 py-3 align-top font-semibold text-[var(--muted)]">
                        {item.shipment_code_display}
                      </td>

                      <td className="px-3 py-3 align-top">
                        <div className="flex justify-end gap-2">
                          {item.action === "input" ? (
                            <button
                              type="button"
                              onClick={() => openInput(item)}
                              className="ind-badge-cyan cursor-pointer p-2 transition hover:brightness-95"
                              title="Input shipment"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(item)}
                                className="ind-btn-ghost p-2"
                                title="Edit shipment"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleDelete(item)}
                                className="ind-btn-danger p-2"
                                title="Hapus shipment"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-sm font-semibold text-[var(--muted)]"
                    >
                      Tidak ada data pada tanggal ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedItem ? (
        <AdminShipmentModal
          open={modalOpen && Boolean(selectedItem)}
          date={dateParam}
          areaId={data?.area_id ?? ""}
          item={selectedItem}
          onClose={() => {
            setModalOpen(false);
            setSelectedItem(null);
          }}
          onSaved={async () => {
            setModalOpen(false);
            setSelectedItem(null);
            await loadDetail(true);
          }}
        />
      ) : null}
    </DashboardShell>
  );
}