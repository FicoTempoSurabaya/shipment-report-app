"use client";

import {
  ArrowLeft,
  Edit3,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Save,
  UnlockKeyhole,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast, Toaster } from "sonner";

import { DashboardShell } from "@/components/layout/DashboardShell";

type AdminRegularUser = {
  nik_kerja: string;
  area_id: string;
  nama_lengkap: string;
  jabatan: string;
  username: string;
  password: string;
  is_active: boolean;
};

type AdminUsersResponse = {
  ok: boolean;
  message?: string;
  data?: AdminRegularUser[];
};

type AdminShipmentLock = {
  kunci_id: string;
  area_id: string;
  nik_kerja: string | null;
  nama_lengkap: string | null;
  tanggal_awal: string;
  tanggal_akhir: string;
  keterangan_kunci: string | null;
  created_at: string;
  updated_at: string;
};

type AdminShipmentLockResponse = {
  ok: boolean;
  message?: string;
  data?: AdminShipmentLock[];
};

type AdminShipmentLockMutationResponse = {
  ok: boolean;
  message?: string;
  data?: AdminShipmentLock;
};

type KunciTargetType = "area" | "user";

type KunciShipmentFormState = {
  target_type: KunciTargetType;
  nik_kerja: string;
  tanggal_awal: string;
  tanggal_akhir: string;
  keterangan_kunci: string;
};

const EMPTY_KUNCI_FORM: KunciShipmentFormState = {
  target_type: "area",
  nik_kerja: "",
  tanggal_awal: "",
  tanggal_akhir: "",
  keterangan_kunci: "",
};

function formatDateLabel(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getLockRangeLabel(lock: AdminShipmentLock) {
  if (lock.tanggal_awal === lock.tanggal_akhir) {
    return formatDateLabel(lock.tanggal_awal);
  }

  return `${formatDateLabel(lock.tanggal_awal)} - ${formatDateLabel(
    lock.tanggal_akhir,
  )}`;
}

function getLockTargetLabel(lock: AdminShipmentLock) {
  if (!lock.nik_kerja) {
    return "Seluruh Area";
  }

  return lock.nama_lengkap
    ? `${lock.nama_lengkap} (${lock.nik_kerja})`
    : lock.nik_kerja;
}

function buildKunciRequestBody(form: KunciShipmentFormState) {
  return {
    nik_kerja: form.target_type === "user" ? form.nik_kerja : null,
    tanggal_awal: form.tanggal_awal,
    tanggal_akhir: form.tanggal_akhir,
    keterangan_kunci: form.keterangan_kunci.trim() || null,
  };
}

export default function AdminKunciShipmentPage() {
  const router = useRouter();

  const [regularUsers, setRegularUsers] = useState<AdminRegularUser[]>([]);
  const [locks, setLocks] = useState<AdminShipmentLock[]>([]);
  const [hasLoadedLocks, setHasLoadedLocks] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingLockId, setEditingLockId] = useState<string | null>(null);
  const [lockForm, setLockForm] = useState<KunciShipmentFormState>(EMPTY_KUNCI_FORM);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const loadAdminUsers = useCallback(async () => {
    const response = await fetch("/api/admin/users", {
      method: "GET",
      credentials: "include",
    });

    const result = (await response.json()) as AdminUsersResponse;

    if (!response.ok || !result.ok) {
      throw new Error(result.message || "Gagal mengambil user regular");
    }

    setRegularUsers(result.data ?? []);
  }, []);

  const loadKunciShipment = useCallback(async () => {
    if ((filterStartDate && !filterEndDate) || (!filterStartDate && filterEndDate)) {
      toast.error("Filter tanggal awal dan akhir harus diisi lengkap");
      return;
    }

    if (filterStartDate && filterEndDate && filterEndDate < filterStartDate) {
      toast.error("Tanggal akhir filter tidak boleh lebih kecil dari tanggal awal");
      return;
    }

    setIsLoading(true);

    try {
      await loadAdminUsers();

      const params = new URLSearchParams();

      if (filterStartDate && filterEndDate) {
        params.set("start_date", filterStartDate);
        params.set("end_date", filterEndDate);
      }

      const queryString = params.toString();
      const url = queryString
        ? `/api/admin/kunci-shipment?${queryString}`
        : "/api/admin/kunci-shipment";

      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
      });

      const result = (await response.json()) as AdminShipmentLockResponse;

      if (!response.ok || !result.ok) {
        toast.error(result.message || "Gagal mengambil data kunci shipment");
        setLocks([]);
        setHasLoadedLocks(false);
        return;
      }

      setLocks(result.data ?? []);
      setHasLoadedLocks(true);
    } catch {
      toast.error("Tidak bisa mengambil data kunci shipment");
      setLocks([]);
      setHasLoadedLocks(false);
    } finally {
      setIsLoading(false);
    }
  }, [filterEndDate, filterStartDate, loadAdminUsers]);

  const loadPageData = useCallback(async () => {
    setIsLoading(true);

    try {
      await loadAdminUsers();

      const response = await fetch("/api/admin/kunci-shipment", {
        method: "GET",
        credentials: "include",
      });

      const result = (await response.json()) as AdminShipmentLockResponse;

      if (!response.ok || !result.ok) {
        toast.error(result.message || "Gagal mengambil data kunci shipment");
        setLocks([]);
        setHasLoadedLocks(false);
        return;
      }

      setLocks(result.data ?? []);
      setHasLoadedLocks(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Tidak bisa memuat data kunci",
      );
      setLocks([]);
      setHasLoadedLocks(false);
    } finally {
      setIsLoading(false);
    }
  }, [loadAdminUsers]);


  function resetLockForm() {
    setEditingLockId(null);
    setLockForm(EMPTY_KUNCI_FORM);
  }

  function editLock(lock: AdminShipmentLock) {
    setEditingLockId(lock.kunci_id);
    setLockForm({
      target_type: lock.nik_kerja ? "user" : "area",
      nik_kerja: lock.nik_kerja ?? "",
      tanggal_awal: lock.tanggal_awal,
      tanggal_akhir: lock.tanggal_akhir,
      keterangan_kunci: lock.keterangan_kunci ?? "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitLock() {
    if (!lockForm.tanggal_awal || !lockForm.tanggal_akhir) {
      toast.error("Tanggal awal dan tanggal akhir wajib diisi");
      return;
    }

    if (lockForm.tanggal_akhir < lockForm.tanggal_awal) {
      toast.error("Tanggal akhir tidak boleh lebih kecil dari tanggal awal");
      return;
    }

    if (lockForm.target_type === "user" && !lockForm.nik_kerja) {
      toast.error("Pilih user yang akan dikunci");
      return;
    }

    setIsSaving(true);

    try {
      const isEdit = Boolean(editingLockId);
      const response = await fetch(
        isEdit
          ? `/api/admin/kunci-shipment/${editingLockId}`
          : "/api/admin/kunci-shipment",
        {
          method: isEdit ? "PUT" : "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildKunciRequestBody(lockForm)),
        },
      );

      const result = (await response.json()) as AdminShipmentLockMutationResponse;

      if (!response.ok || !result.ok) {
        toast.error(result.message || "Gagal menyimpan kunci shipment");
        return;
      }

      toast.success(result.message || "Kunci shipment berhasil disimpan");
      resetLockForm();
      await loadKunciShipment();
    } catch {
      toast.error("Tidak bisa menyimpan kunci shipment");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteLock(lock: AdminShipmentLock) {
    const confirmed = window.confirm(
      `Buka kunci untuk ${getLockTargetLabel(lock)} pada ${getLockRangeLabel(lock)}?`,
    );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/admin/kunci-shipment/${lock.kunci_id}`, {
        method: "DELETE",
        credentials: "include",
      });

      const result = (await response.json()) as AdminShipmentLockMutationResponse;

      if (!response.ok || !result.ok) {
        toast.error(result.message || "Gagal membuka kunci shipment");
        return;
      }

      toast.success(result.message || "Kunci shipment berhasil dibuka");

      if (editingLockId === lock.kunci_id) {
        resetLockForm();
      }

      await loadKunciShipment();
    } catch {
      toast.error("Tidak bisa membuka kunci shipment");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <DashboardShell
      description="Kelola kunci tanggal atau rentang tanggal untuk seluruh area maupun user tertentu."
      hideIntroPanel
      profilePath="/admin/profile"
      roleLabel="Admin Dashboard"
      title="Kunci Shipment"
    >
      <Toaster richColors position="top-center" />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          className="ind-btn-ghost w-full sm:w-auto"
          type="button"
          onClick={() => router.push("/admin")}
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali Dashboard
        </button>

        <button
          className="ind-btn-secondary w-full sm:w-auto"
          disabled={isLoading}
          type="button"
          onClick={loadPageData}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <RefreshCw className="h-5 w-5" />
          )}
          Refresh Semua
        </button>
      </div>

      <section className="ind-card-flat mb-5 p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3 border-b-2 border-[var(--border-soft)] pb-4">
          <div className="ind-icon-box h-10 w-10">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="ind-label">Form Kunci</p>
            <h2 className="ind-heading mt-1 text-lg sm:text-xl">
              {editingLockId ? "Edit Kunci" : "Buat Kunci Baru"}
            </h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-[var(--muted)]">
              Kunci hanya membatasi regular user. Admin tetap bisa input, edit,
              dan hapus shipment pada tanggal terkunci.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
              Target Kunci
            </span>
            <select
              className="ind-input"
              value={lockForm.target_type}
              onChange={(event) =>
                setLockForm((current) => ({
                  ...current,
                  target_type: event.target.value as KunciTargetType,
                  nik_kerja:
                    event.target.value === "area" ? "" : current.nik_kerja,
                }))
              }
            >
              <option value="area">Seluruh Area</option>
              <option value="user">User Tertentu</option>
            </select>
          </label>

          {lockForm.target_type === "user" ? (
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                Nama User Regular
              </span>
              <select
                className="ind-input"
                value={lockForm.nik_kerja}
                onChange={(event) =>
                  setLockForm((current) => ({
                    ...current,
                    nik_kerja: event.target.value,
                  }))
                }
              >
                <option value="">Pilih user</option>
                {regularUsers.map((user) => (
                  <option key={user.nik_kerja} value={user.nik_kerja}>
                    {user.nama_lengkap} — {user.nik_kerja}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
              Tanggal Awal
            </span>
            <input
              className="ind-input"
              type="date"
              value={lockForm.tanggal_awal}
              onChange={(event) =>
                setLockForm((current) => ({
                  ...current,
                  tanggal_awal: event.target.value,
                  tanggal_akhir: current.tanggal_akhir || event.target.value,
                }))
              }
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
              Tanggal Akhir
            </span>
            <input
              className="ind-input"
              type="date"
              value={lockForm.tanggal_akhir}
              onChange={(event) =>
                setLockForm((current) => ({
                  ...current,
                  tanggal_akhir: event.target.value,
                }))
              }
            />
          </label>

          <label className="block lg:col-span-2">
            <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
              Keterangan Kunci
            </span>
            <textarea
              className="ind-input min-h-24 resize-y"
              placeholder="Contoh: Area libur operasional / User tidak masuk"
              value={lockForm.keterangan_kunci}
              onChange={(event) =>
                setLockForm((current) => ({
                  ...current,
                  keterangan_kunci: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
          {editingLockId ? (
            <button
              className="ind-btn-ghost w-full sm:w-auto"
              disabled={isSaving}
              type="button"
              onClick={resetLockForm}
            >
              <X className="h-4 w-4" />
              Batal Edit
            </button>
          ) : null}

          <button
            className="ind-btn-primary w-full sm:w-auto"
            disabled={isSaving}
            type="button"
            onClick={submitLock}
          >
            {isSaving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            {editingLockId ? "Update Kunci" : "Simpan Kunci"}
          </button>
        </div>
      </section>

      <section className="ind-card-flat p-4 sm:p-5">
        <div className="mb-4 border-b-2 border-[var(--border-soft)] pb-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="ind-label">Daftar Kunci</p>
              <h2 className="ind-heading mt-1 text-lg sm:text-xl">
                {filterStartDate && filterEndDate
                  ? `Range ${formatDateLabel(filterStartDate)} - ${formatDateLabel(
                      filterEndDate,
                    )}`
                  : "Semua Kunci Area"}
              </h2>
            </div>

            <div className="ind-badge bg-[var(--surface)]">{locks.length} Data</div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                Filter Awal
              </span>
              <input
                className="ind-input"
                type="date"
                value={filterStartDate}
                onChange={(event) => setFilterStartDate(event.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                Filter Akhir
              </span>
              <input
                className="ind-input"
                type="date"
                value={filterEndDate}
                onChange={(event) => setFilterEndDate(event.target.value)}
              />
            </label>

            <button
              className="ind-btn-secondary self-end"
              disabled={isLoading}
              type="button"
              onClick={loadKunciShipment}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <RefreshCw className="h-5 w-5" />
              )}
              Muat Kunci
            </button>
          </div>
        </div>

        <div className="space-y-3 lg:hidden">
          {locks.map((lock) => (
            <article
              key={lock.kunci_id}
              className="border-2 border-[var(--border-soft)] bg-[var(--surface-soft)] p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-base font-black text-[var(--steel)]">
                    {getLockTargetLabel(lock)}
                  </h3>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {lock.nik_kerja ? "User tertentu" : "Seluruh area"}
                  </p>
                </div>
                <span className="ind-badge shrink-0 bg-[var(--surface)]">
                  Kunci
                </span>
              </div>

              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="font-black text-[var(--steel)]">Tanggal</dt>
                  <dd className="mt-1 font-semibold text-[var(--muted)]">
                    {getLockRangeLabel(lock)}
                  </dd>
                </div>
                <div>
                  <dt className="font-black text-[var(--steel)]">Keterangan</dt>
                  <dd className="mt-1 break-words font-semibold text-[var(--muted)]">
                    {lock.keterangan_kunci || "-"}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  className="ind-btn-ghost min-h-10 px-3"
                  disabled={isSaving}
                  type="button"
                  onClick={() => editLock(lock)}
                >
                  <Edit3 className="h-4 w-4" />
                  Edit
                </button>
                <button
                  className="ind-btn-danger min-h-10 px-3"
                  disabled={isSaving}
                  type="button"
                  onClick={() => deleteLock(lock)}
                >
                  <UnlockKeyhole className="h-4 w-4" />
                  Buka
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="hidden lg:block">
          <div className="ind-table-wrap overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="ind-table-head">
                <tr>
                  <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.14em]">
                    Target
                  </th>
                  <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.14em]">
                    Tanggal
                  </th>
                  <th className="px-4 py-3 text-xs font-black uppercase tracking-[0.14em]">
                    Keterangan
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-[0.14em]">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {locks.map((lock) => (
                  <tr
                    key={lock.kunci_id}
                    className="border-t-2 border-[var(--border-soft)] bg-[var(--surface)]"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-black text-[var(--steel)]">
                        {getLockTargetLabel(lock)}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-[var(--muted)]">
                        {lock.nik_kerja ? "User tertentu" : "Seluruh area"}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top font-bold text-[var(--steel)]">
                      {getLockRangeLabel(lock)}
                    </td>
                    <td className="px-4 py-3 align-top text-sm font-semibold text-[var(--muted)]">
                      {lock.keterangan_kunci || "-"}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex justify-end gap-2">
                        <button
                          className="ind-btn-ghost min-h-10 px-3"
                          disabled={isSaving}
                          type="button"
                          onClick={() => editLock(lock)}
                        >
                          <Edit3 className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          className="ind-btn-danger min-h-10 px-3"
                          disabled={isSaving}
                          type="button"
                          onClick={() => deleteLock(lock)}
                        >
                          <UnlockKeyhole className="h-4 w-4" />
                          Buka
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {!isLoading && !hasLoadedLocks ? (
          <div className="border-2 border-dashed border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-8 text-center text-sm font-bold text-[var(--muted)]">
            Tekan Refresh Semua atau Muat Kunci untuk menampilkan data.
          </div>
        ) : null}

        {!isLoading && hasLoadedLocks && locks.length === 0 ? (
          <div className="border-2 border-dashed border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-8 text-center text-sm font-bold text-[var(--muted)]">
            Tidak ada kunci shipment pada filter ini.
          </div>
        ) : null}

        {isLoading ? (
          <div className="border-2 border-dashed border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-8 text-center text-sm font-bold text-[var(--muted)]">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Memuat kunci shipment...
            </span>
          </div>
        ) : null}
      </section>
    </DashboardShell>
  );
}
