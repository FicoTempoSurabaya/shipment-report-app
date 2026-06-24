"use client";

import { Camera, Loader2, Save, X } from "lucide-react";
import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { BarcodeScanner } from "@/components/shipment/BarcodeScanner";
import { FailureReasonInput } from "@/components/shipment/FailureReasonInput";
import { StatusShipmentSelect } from "@/components/shipment/StatusShipmentSelect";
import { formatDateOnlyId } from "@/lib/date";
import type { ShipmentFailureReason, ShipmentStatus } from "@/types/shipment";

export type RegularShipmentForModal = {
  shipment_id: number;
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

type RegularUserForModal = {
  nik_kerja: string;
  area_id: string | null;
  nama_lengkap: string;
};

type ShipmentModalProps = {
  open: boolean;
  mode: "input" | "edit";
  date: string;
  user: RegularUserForModal;
  shipment: RegularShipmentForModal | null;
  onClose: () => void;
  onSaved: () => void;
};

type ShipmentApiResponse = {
  ok: boolean;
  message: string;
  data?: RegularShipmentForModal;
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
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        return normalizeFailureReasons(parsed);
      } catch {
        // Fallback ke format teks biasa di bawah.
      }
    }

    return trimmed
      .split(/[;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [rawReason, ...noteParts] = part.split(":");
        const reason = rawReason.trim();
        const note = noteParts.join(":").trim();

        return note ? { reason, note } : { reason };
      }) as ShipmentFailureReason[];
  }

  return [];
}

export function ShipmentModal({
  open,
  mode,
  date,
  user,
  shipment,
  onClose,
  onSaved,
}: ShipmentModalProps) {
  const [statusShipment, setStatusShipment] = useState<ShipmentStatus>("Aktif");
  const [shipmentCode, setShipmentCode] = useState("");
  const [jamBerangkat, setJamBerangkat] = useState("");
  const [jamPulang, setJamPulang] = useState("");
  const [jumlahToko, setJumlahToko] = useState("");
  const [terkirim, setTerkirim] = useState("");
  const [alasan, setAlasan] = useState<ShipmentFailureReason[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const displayedDate = date ? formatDateOnlyId(date) : "";

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
  const normalizedAlasan = normalizeFailureReasons(alasan);
  const isOtherReasonInvalid = normalizedAlasan.some(
    (item) => item.reason === "Lainnya" && !item.note?.trim(),
  );

  const disabledInputClass =
    "disabled:cursor-not-allowed disabled:border-[var(--border-soft)] disabled:bg-[var(--surface-soft)] disabled:text-[var(--muted)] disabled:opacity-70";

  const isSubmitDisabled = useMemo(() => {
    if (isSubmitting) {
      return true;
    }

    if (!user.area_id || !user.nik_kerja || !date) {
      return true;
    }

    if (!isShipmentInputEnabled) {
      return false;
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
    date,
    gagal,
    isOtherReasonInvalid,
    isShipmentInputEnabled,
    isSubmitting,
    jumlahTokoNumber,
    normalizedAlasan.length,
    terkirimNumber,
    user.area_id,
    user.nik_kerja,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextStatus = shipment?.status_shipment ?? "Aktif";

      setStatusShipment(nextStatus);

      if (nextStatus === "Aktif") {
        setShipmentCode(shipment?.shipment_code ?? "");
        setJamBerangkat(normalizeTime(shipment?.jam_berangkat ?? null));
        setJamPulang(normalizeTime(shipment?.jam_pulang ?? null));
        setJumlahToko(shipment ? String(shipment.jumlah_toko ?? "") : "");
        setTerkirim(shipment ? String(shipment.terkirim ?? "") : "");
        setAlasan(normalizeFailureReasons(shipment?.alasan));
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
  }, [open, shipment]);

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

    if (isSubmitDisabled) {
      toast.error("Lengkapi form shipment terlebih dahulu");
      return;
    }

    setIsSubmitting(true);

    try {
      const body = {
        ...(mode === "edit" && shipment
          ? {
              shipment_id: shipment.shipment_id,
            }
          : {}),
        area_id: user.area_id ?? "",
        nik_kerja: user.nik_kerja,
        tanggal_shipment: date,
        status_shipment: statusShipment,
        shipment_code: isShipmentInputEnabled ? shipmentCode.trim() || null : null,
        jam_berangkat: isShipmentInputEnabled ? jamBerangkat || null : null,
        jam_pulang: isShipmentInputEnabled ? jamPulang || null : null,
        jumlah_toko: isShipmentInputEnabled ? jumlahTokoNumber : 0,
        terkirim: isShipmentInputEnabled ? terkirimNumber : 0,
        alasan: isShipmentInputEnabled && gagal > 0 ? normalizedAlasan : [],
      };

      const response = await fetch("/api/regular/shipments", {
        method: mode === "edit" ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const result = (await response.json()) as ShipmentApiResponse;

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

  if (!open) {
    return null;
  }

  return (
    <div className="ind-modal-overlay items-end p-0 sm:items-center sm:p-4">
      <div className="ind-modal max-w-4xl rounded-none sm:rounded-none">
        <div className="ind-modal-header">
          <div>
            <p className="ind-label-accent">
              {mode === "edit" ? "Edit Shipment" : "Input Shipment"}
            </p>
            <h2 className="ind-heading mt-2 text-2xl">{user.nama_lengkap}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{displayedDate}</p>
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
                value={displayedDate}
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
                  placeholder="Contoh: 1234567890"
                  value={shipmentCode}
                  onChange={(event) =>
                    setShipmentCode(event.target.value.replace(/\D/g, ""))
                  }
                />

                {isShipmentInputEnabled ? (
                  <BarcodeScanner
                    onDetected={(value) =>
                      setShipmentCode(value.replace(/\D/g, ""))
                    }
                  />
                ) : (
                  <button
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center border-2 border-[var(--border-soft)] bg-[var(--surface-soft)] p-0 text-[var(--muted)] opacity-70"
                    type="button"
                    aria-label="Scan barcode"
                    title="Scan barcode"
                    disabled
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                )}
              </div>
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