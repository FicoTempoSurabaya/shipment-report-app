"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type BarcodeScannerProps = {
  onDetected: (value: string) => void;
};

export function BarcodeScanner({ onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !videoRef.current) {
    return;
    }

    const videoElement = videoRef.current;
    let isMounted = true;
    const reader = new BrowserMultiFormatReader();

    async function startScanner() {
      try {
        const videoInputDevices =
          await BrowserMultiFormatReader.listVideoInputDevices();

        if (!isMounted) {
          return;
        }

        const backCamera =
          videoInputDevices.find((device) =>
            device.label.toLowerCase().includes("back"),
          ) ?? videoInputDevices[0];

        if (!backCamera) {
          toast.error("Kamera tidak ditemukan");
          return;
        }

        controlsRef.current = await reader.decodeFromVideoDevice(
          backCamera.deviceId,
          videoElement,
          (result) => {
            if (!result) {
              return;
            }

            const value = result.getText().trim();

            if (!value) {
              return;
            }

            onDetected(value);
            toast.success("Barcode berhasil dibaca");
            setIsOpen(false);
          },
        );
      } catch {
        toast.error("Tidak bisa membuka kamera");
      }
    }

    startScanner();

    return () => {
      isMounted = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [isOpen, onDetected]);

  return (
    <>
      <button
        className="ind-btn-ghost px-3 py-2 text-xs"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <Camera className="h-4 w-4" />
        Scan Barcode
      </button>

      {isOpen ? (
        <div className="ind-modal-overlay z-50">
          <div className="ind-panel max-w-lg p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="ind-heading text-sm">Scan Barcode</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Arahkan kamera ke kode shipment.
                </p>
              </div>

              <button
                className="ind-btn-ghost p-2"
                type="button"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <video
              ref={videoRef}
              className="aspect-video w-full border-2 border-[var(--steel)] bg-black object-cover"
              muted
              playsInline
            />

            <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
              Jika kamera tidak terbuka, pastikan browser memberi izin akses kamera
              dan gunakan HTTPS saat production.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
