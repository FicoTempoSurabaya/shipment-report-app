"use client";

import { Camera, Loader2, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";

import { BarcodeScanner } from "@/components/shipment/BarcodeScanner";
import { FailureReasonInput } from "@/components/shipment/FailureReasonInput";
import { StatusShipmentSelect } from "@/components/shipment/StatusShipmentSelect";
import type { ShipmentFailureReason, ShipmentStatus } from "@/types/shipment";

export type AdminShipmentForModal = {
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
};

export type AdminTanggalItemForModal = {
  person_type: "regular" | "freelance";
  nik_kerja: string | null;
  nama_lengkap: string;
  status: "Regular" | "Freelance";
  action: "input" | "edit_delete";
  shipment_code_display: string;
  shipment: AdminShipmentForModal | null;
};

type AdminShipmentModalProps = {
  open: boolean;
  date: string;
  areaId: string;
  item: AdminTanggalItemForModal | null;
  onClose: () => void;
  onSaved: () => void;
};

type AdminShipmentApiResponse = {
  ok: boolean;
  message: string;
  data?: AdminShipmentForModal;
  errors?: Record<string, string[] | undefined>;
};

function normalizeTime(value: string | null) {
  if (!value) {
    return "";
  }

  return value.slice(0, 5);
}

function normalizeFailureReasons(value: unknown): ShipmentFailureReason[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is ShipmentFailureReason =>
        typeof item === "object" &&
        item !== null &&
        "reason" in item &&
        typeof item.reason === "string",
    );
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return normalizeFailureReasons(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

export function AdminShipmentModal({
  open,
  date,
  areaId,
  item,
  onClose,
  onSaved,
}: AdminShipmentModalProps) {
  const [statusShipment, setStatusShipment] = useState<ShipmentStatus>("Aktif");
  const [shipmentCode, setShipmentCode] = useState("");
  const [jamBerangkat, setJamBerangkat] = useState("");
  const [jamPulang, setJamPulang] = useState("");
  const [jumlahToko, setJumlahToko] = useState("");
  const [terkirim, setTerkirim] = useState("");
  const [alasan, setAlasan] = useState<ShipmentFailureReason[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isShipmentInputEnabled = statusShipment === "Aktif";
  const jumlahTokoNumber = jumlahToko === "" ? 0 : Number(jumlahToko);
  const terkirimNumber = terkirim === "" ? 0 : Number(terkirim);
  const hasShipmentCountInput = jumlahToko !== "" || terkirim !== "";
  const gagal =
    isShipmentInputEnabled && hasShipmentCountInput
      ? Math.max(jumlahTokoNumber - terkirimNumber, 0)
      : 0;
  const gagalDisplay =
    isShipmentInputEnabled && hasShipmentCountInput ? String(gagal) : "";
  const mode: "input" | "edit" = item?.shipment ? "edit" : "input";
  const isFreelance = item?.person_type === "freelance";
  const normalizedAlasan = normalizeFailureReasons(alasan);

  const isOtherReasonInvalid = normalizedAlasan.some(
    (reason) => reason.reason === "Lainnya" && !reason.note?.trim(),
  );

  const disabledInputClass =
    "disabled:cursor-not-allowed disabled:border-[var(--border-soft)] disabled:bg-[var(--surface-soft)] disabled:text-[var(--muted)] disabled:opacity-70";

  const isSubmitDisabled = useMemo(() => {
    if (isSubmitting || !item) {
      return true;
    }

    if (!areaId || !date) {
      return true;
    }

    if (!isFreelance && !item.nik_kerja) {
      return true;
    }

    if (!isShipmentInputEnabled) {
      return false;
    }

    if (isFreelance && !shipmentCode.trim()) {
      return true;
    }

    if (
      jumlahTokoNumber < 0 ||
      terkirimNumber < 0 ||
      terkirimNumber > jumlahTokoNumber
    ) {
      return true;
    }

    if (gagal > 0 && normalizedAlasan.length === 0) {
      return true;
    }

    if (isOtherReasonInvalid) {
      return true;
    }

    return false;
  }, [
    areaId,
    date,
    gagal,
    isFreelance,
    isOtherReasonInvalid,
    isShipmentInputEnabled,
    isSubmitting,
    item,
    jumlahTokoNumber,
    normalizedAlasan.length,
    shipmentCode,
    terkirimNumber,
  ]);

  useEffect(() => {
    if (!open || !item) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextStatus = item.shipment?.status_shipment ?? "Aktif";

      setStatusShipment(nextStatus);

      if (nextStatus === "Aktif") {
        setShipmentCode(item.shipment?.shipment_code ?? "");
        setJamBerangkat(normalizeTime(item.shipment?.jam_berangkat ?? null));
        setJamPulang(normalizeTime(item.shipment?.jam_pulang ?? null));
        setJumlahToko(item.shipment ? String(item.shipment.jumlah_toko ?? "") : "");
        setTerkirim(item.shipment ? String(item.shipment.terkirim ?? "") : "");
        setAlasan(normalizeFailureReasons(item.shipment?.alasan));
        return;
      }

      setShipmentCode("");
      setJamBerangkat("");
      setJamPulang("");
      setJumlahToko("");
      setTerkirim("");
      setAlasan([]);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [item, open]);

  function clearShipmentInputFields() {
    setShipmentCode("");
    setJamBerangkat("");
    setJamPulang("");
    setJumlahToko("");
    setTerkirim("");
    setAlasan([]);
  }

  function handleStatusShipmentChange(value: ShipmentStatus) {
    setStatusShipment(value);

    if (value !== "Aktif") {
      clearShipmentInputFields();
    }
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitDisabled || !item) {
      toast.error("Lengkapi form shipment terlebih dahulu");
      return;
    }

    setIsSubmitting(true);

    try {
      const commonBody = {
        ...(mode === "edit" && item.shipment
          ? { shipment_id: item.shipment.shipment_id }
          : {}),
        area_id: areaId,
        tanggal_shipment: date,
        status_shipment: statusShipment,
        shipment_code: isShipmentInputEnabled ? shipmentCode.trim() || null : null,
        jam_berangkat: isShipmentInputEnabled ? jamBerangkat || null : null,
        jam_pulang: isShipmentInputEnabled ? jamPulang || null : null,
        jumlah_toko: isShipmentInputEnabled ? jumlahTokoNumber : 0,
        terkirim: isShipmentInputEnabled ? terkirimNumber : 0,
        alasan: isShipmentInputEnabled && gagal > 0 ? normalizedAlasan : [],
      };

      const body = isFreelance
        ? {
            ...commonBody,
            nama_freelance: item.nama_lengkap,
            shipment_code: isShipmentInputEnabled ? shipmentCode.trim() : null,
          }
        : {
            ...commonBody,
            nik_kerja: item.nik_kerja ?? "",
          };

      const response = await fetch("/api/admin/shipments", {
        method: mode === "edit" ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const result = (await response.json()) as AdminShipmentApiResponse;

      if (!response.ok || !result.ok) {
        toast.error(result.message || "Gagal menyimpan shipment");
        return;
      }

      toast.success(result.message || "Shipment berhasil disimpan");
      onSaved();
      onClose();
    } catch {
      toast.error("Tidak bisa terhubung ke server");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open || !item) {
    return null;
  }

  return (
    <div className="ind-modal-overlay items-end p-0 sm:items-center sm:p-4">
      <div className="ind-modal max-w-4xl rounded-none sm:rounded-none">
        <div className="ind-modal-header">
          <div>
            <p className="ind-label-accent">
              {mode === "edit" ? "Edit Shipment Admin" : "Input Shipment Admin"}
            </p>
            <h2 className="ind-heading mt-2 text-2xl">{item.nama_lengkap}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {item.status} · {date}
            </p>
          </div>

          <button
            className="flex min-h-11 items-center justify-center border-2 border-[var(--border-soft)] bg-[var(--surface)] p-3 text-[var(--steel)] transition hover:border-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
            type="button"
            aria-label="Tutup modal"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="p-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                Tanggal Shipment
              </span>
              <input
                className="ind-input cursor-not-allowed text-[var(--muted)]"
                readOnly
                value={date}
              />
            </label>

            <StatusShipmentSelect
              value={statusShipment}
              onChange={handleStatusShipmentChange}
            />

            <div>
              <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                Kode Shipment
              </span>
              <div className="flex gap-2">
                <input
                  className={`ind-input min-w-0 flex-1 placeholder:text-[var(--muted)] ${disabledInputClass}`}
                  disabled={!isShipmentInputEnabled}
                  inputMode="numeric"
                  placeholder="wajib 10 digit"
                  value={shipmentCode}
                  onChange={(event) =>
                    setShipmentCode(event.target.value.replace(/\D/g, ""))
                  }
                />

                {isShipmentInputEnabled ? (
                  <BarcodeScanner
                    onDetected={(value) => setShipmentCode(value.replace(/\D/g, ""))}
                  />
                ) : (
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 border-2 border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 text-xs font-bold text-[var(--muted)] opacity-70"
                    type="button"
                    disabled
                  >
                    <Camera className="h-4 w-4" />
                    Scan Barcode
                  </button>
                )}
              </div>
              {isFreelance && isShipmentInputEnabled && !shipmentCode.trim() ? (
                <p className="mt-2 text-xs font-semibold text-red-700">
                  Kode shipment wajib untuk freelance.
                </p>
              ) : null}
            </div>

            <div className="md:col-span-2">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <label className="block">
                  <span className="ind-label mb-2 block">Jam Berangkat</span>
                  <input
                    className={`ind-input h-12 px-3 text-center text-sm font-black ${disabledInputClass}`}
                    disabled={!isShipmentInputEnabled}
                    type="time"
                    value={jamBerangkat}
                    onChange={(event) => setJamBerangkat(event.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="ind-label mb-2 block">Jam Pulang</span>
                  <input
                    className={`ind-input h-12 px-3 text-center text-sm font-black ${disabledInputClass}`}
                    disabled={!isShipmentInputEnabled}
                    type="time"
                    value={jamPulang}
                    onChange={(event) => setJamPulang(event.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="md:col-span-2">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <label className="block">
                  <span className="ind-label mb-2 block">Jumlah Toko</span>
                  <input
                    className={`ind-input h-12 px-2 text-center text-base font-black ${disabledInputClass}`}
                    disabled={!isShipmentInputEnabled}
                    min={0}
                    type="number"
                    value={jumlahToko}
                    onChange={(event) => setJumlahToko(event.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="ind-label mb-2 block">Terkirim</span>
                  <input
                    className={`ind-input h-12 px-2 text-center text-base font-black ${disabledInputClass}`}
                    disabled={!isShipmentInputEnabled}
                    min={0}
                    type="number"
                    value={terkirim}
                    onChange={(event) => setTerkirim(event.target.value)}
                  />
                </label>

                <div className="block">
                  <span className="ind-label mb-2 block">Gagal</span>
                  <div
                    className={
                      gagal > 0
                        ? "flex h-12 w-full items-center justify-center border-2 border-[var(--danger)] bg-[var(--danger-soft)] px-2 text-base font-black text-[var(--danger)] shadow-[3px_3px_0_rgba(15,23,42,0.06)]"
                        : "ind-stat-box flex h-12 w-full items-center justify-center px-2 text-base font-black"
                    }
                  >
                    {gagalDisplay}
                  </div>
                </div>
              </div>

              {isShipmentInputEnabled && terkirimNumber > jumlahTokoNumber ? (
                <p className="ind-alert-error mt-3">
                  Terkirim tidak boleh lebih besar dari jumlah toko.
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-5">
            <FailureReasonInput
              gagal={isShipmentInputEnabled ? gagal : 0}
              value={isShipmentInputEnabled ? alasan : []}
              onChange={setAlasan}
            />
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              className="ind-btn-danger font-black uppercase tracking-[0.12em]"
              type="button"
              onClick={onClose}
            >
              Batal
            </button>

            <button
              className="ind-btn-primary"
              disabled={isSubmitDisabled}
              type="submit"
            >
              {isSubmitting ? (
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
      </div>
    </div>
  );
}
