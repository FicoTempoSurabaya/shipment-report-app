"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";

import { BarcodeScanner } from "@/components/shipment/BarcodeScanner";
import { FailureReasonInput } from "@/components/shipment/FailureReasonInput";
import type { ShipmentFailureReason } from "@/types/shipment";

type Area = {
  area_id: string;
  nama_area: string;
  sla_area: number;
  spreadsheet_id: string | null;
  spreadsheet_url: string | null;
  is_active: boolean;
};

type AreaResponse = {
  ok: boolean;
  data?: Area[];
  message?: string;
};

type SubmitResponse = {
  ok: boolean;
  message: string;
  data?: {
    shipment_id: number;
    area_id: string;
    nama_freelance: string;
    tanggal_shipment: string;
    shipment_code: string;
    jumlah_toko: number;
    terkirim: number;
    gagal: number;
  };
  errors?: Record<string, string[] | undefined>;
};

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export default function FreelancePage() {
  const router = useRouter();
  const [areas, setAreas] = useState<Area[]>([]);
  const [isLoadingArea, setIsLoadingArea] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [areaId, setAreaId] = useState("");
  const [namaFreelance, setNamaFreelance] = useState("");
  const [tanggalShipment, setTanggalShipment] = useState(getTodayDateString());
  const [shipmentCode, setShipmentCode] = useState("");
  const [jamBerangkat, setJamBerangkat] = useState("");
  const [jamPulang, setJamPulang] = useState("");
  const [jumlahToko, setJumlahToko] = useState("");
  const [terkirim, setTerkirim] = useState("");
  const [alasan, setAlasan] = useState<ShipmentFailureReason[]>([]);

  const jumlahTokoNumber = jumlahToko === "" ? 0 : Number(jumlahToko);
  const terkirimNumber = terkirim === "" ? 0 : Number(terkirim);
  const hasShipmentCountInput = jumlahToko !== "" || terkirim !== "";
  const gagal = hasShipmentCountInput
    ? Math.max(jumlahTokoNumber - terkirimNumber, 0)
    : 0;
  const gagalDisplay = hasShipmentCountInput ? String(gagal) : "";
  const normalizedAlasan = Array.isArray(alasan) ? alasan : [];

  const isOtherReasonInvalid = normalizedAlasan.some(
    (item) => item.reason === "Lainnya" && !item.note?.trim(),
  );

  const isSubmitDisabled = useMemo(() => {
    if (isSubmitting) {
      return true;
    }

    if (
      !areaId ||
      !namaFreelance.trim() ||
      !tanggalShipment ||
      !shipmentCode.trim()
    ) {
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
    gagal,
    isOtherReasonInvalid,
    isSubmitting,
    jumlahTokoNumber,
    namaFreelance,
    normalizedAlasan.length,
    shipmentCode,
    tanggalShipment,
    terkirimNumber,
  ]);

  useEffect(() => {
    async function loadAreas() {
      try {
        const response = await fetch("/api/area", {
          method: "GET",
        });

        const data = (await response.json()) as AreaResponse;

        if (!response.ok || !data.ok) {
          toast.error(data.message || "Gagal mengambil data area");
          return;
        }

        setAreas(data.data ?? []);
      } catch {
        toast.error("Tidak bisa terhubung ke server");
      } finally {
        setIsLoadingArea(false);
      }
    }

    loadAreas();
  }, []);

  function resetForm() {
    setAreaId("");
    setNamaFreelance("");
    setTanggalShipment(getTodayDateString());
    setShipmentCode("");
    setJamBerangkat("");
    setJamPulang("");
    setJumlahToko("");
    setTerkirim("");
    setAlasan([]);
  }

  function handleCancel() {
    resetForm();
    router.push("/login");
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitDisabled) {
      toast.error("Lengkapi form terlebih dahulu");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/freelance/shipments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          area_id: areaId,
          nama_freelance: namaFreelance.trim(),
          tanggal_shipment: tanggalShipment,
          status_shipment: "Aktif",
          shipment_code: shipmentCode.trim(),
          jam_berangkat: jamBerangkat || null,
          jam_pulang: jamPulang || null,
          jumlah_toko: jumlahTokoNumber,
          terkirim: terkirimNumber,
          alasan: gagal > 0 ? normalizedAlasan : [],
        }),
      });

      const data = (await response.json()) as SubmitResponse;

      if (!response.ok || !data.ok) {
        toast.error(data.message || "Gagal menyimpan shipment freelance");
        return;
      }

      toast.success(data.message || "Shipment freelance berhasil disimpan");
      resetForm();
    } catch {
      toast.error("Tidak bisa terhubung ke server");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 text-[var(--steel)] sm:px-6 lg:px-8">
      <Toaster richColors position="top-center" />

      <div className="mx-auto max-w-4xl">
      <div className="ind-card mb-6 p-5 sm:p-6">
          <div>
            <div className="ind-divider-accent mb-4" />
            <h1 className="ind-heading text-3xl">
              Input Shipment Freelance
            </h1>
          </div>
        </div>

        <form className="ind-panel p-5 sm:p-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                Area
              </span>
              <select
                className="ind-input disabled:opacity-60"
                disabled={isLoadingArea}
                value={areaId}
                onChange={(event) => setAreaId(event.target.value)}
              >
                <option value="">
                  {isLoadingArea ? "Memuat area..." : "Pilih area"}
                </option>
                {areas.map((area) => (
                  <option key={area.area_id} value={area.area_id}>
                    {area.nama_area}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                Nama Lengkap
              </span>
              <input
                className="ind-input placeholder:text-[var(--muted)]"
                placeholder="Nama freelance"
                value={namaFreelance}
                onChange={(event) => setNamaFreelance(event.target.value)}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                Tanggal Shipment
              </span>
              <input
                className="ind-input"
                type="date"
                value={tanggalShipment}
                onChange={(event) => setTanggalShipment(event.target.value)}
              />
            </label>

            <div>
              <span className="mb-2 block text-sm font-bold text-[var(--steel)]">
                Kode Shipment
              </span>
              <div className="flex gap-2">
                <input
                  className="ind-input min-w-0 flex-1 placeholder:text-[var(--muted)]"
                  inputMode="numeric"
                  placeholder="Contoh: 1234567890"
                  value={shipmentCode}
                  onChange={(event) =>
                    setShipmentCode(event.target.value.replace(/\D/g, ""))
                  }
                />
                <BarcodeScanner
                  onDetected={(value) =>
                    setShipmentCode(value.replace(/\D/g, ""))
                  }
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <label className="block">
                  <span className="ind-label mb-2 block">Jam Berangkat</span>
                  <input
                    className="ind-input h-12 px-3 text-center text-sm font-black"
                    type="time"
                    value={jamBerangkat}
                    onChange={(event) => setJamBerangkat(event.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="ind-label mb-2 block">Jam Pulang</span>
                  <input
                    className="ind-input h-12 px-3 text-center text-sm font-black"
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
                    className="ind-input h-12 px-2 text-center text-base font-black"
                    min={0}
                    type="number"
                    value={jumlahToko}
                    onChange={(event) => setJumlahToko(event.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="ind-label mb-2 block">Terkirim</span>
                  <input
                    className="ind-input h-12 px-2 text-center text-base font-black"
                    min={0}
                    type="number"
                    value={terkirim}
                    onChange={(event) => setTerkirim(event.target.value)}
                  />
                </label>

                <div className="block">
                  <span className="ind-label mb-2 block">Gagal</span>
                  <div className="ind-stat-box flex h-12 w-full items-center justify-center px-2 text-base font-black">
                    {gagalDisplay}
                  </div>
                </div>
              </div>

              {terkirimNumber > jumlahTokoNumber ? (
                <p className="ind-alert-error mt-3">
                  Terkirim tidak boleh lebih besar dari jumlah toko.
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-5">
            <FailureReasonInput
              gagal={gagal}
              value={normalizedAlasan}
              onChange={setAlasan}
            />
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              className="ind-btn-danger font-black uppercase tracking-[0.12em]"
              type="button"
              onClick={handleCancel}
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
                  <Send className="h-5 w-5" />
                  Simpan
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}