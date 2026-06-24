"use client";

import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type BarcodeScannerProps = {
  onDetected: (value: string) => void;
};

type ExtendedMediaTrackCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
};

type ExtendedMediaTrackConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string;
  torch?: boolean;
};

const hints = new Map<DecodeHintType, unknown>();

hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE,
]);

hints.set(DecodeHintType.TRY_HARDER, true);
hints.set(DecodeHintType.ASSUME_GS1, true);

const ignoredScanErrors = new Set([
  "NotFoundException",
  "ChecksumException",
  "FormatException",
]);

async function optimizeCameraTrack(videoElement: HTMLVideoElement) {
  const stream = videoElement.srcObject;

  if (!(stream instanceof MediaStream)) {
    return;
  }

  const track = stream.getVideoTracks()[0];

  if (!track || typeof track.getCapabilities !== "function") {
    return;
  }

  const capabilities = track.getCapabilities() as ExtendedMediaTrackCapabilities;
  const advanced: ExtendedMediaTrackConstraintSet[] = [];

  if (capabilities.focusMode?.includes("continuous")) {
    advanced.push({ focusMode: "continuous" });
  }

  if (capabilities.torch) {
    advanced.push({ torch: true });
  }

  if (!advanced.length) {
    return;
  }

  try {
    await track.applyConstraints({ advanced });
  } catch (error) {
    console.warn("Camera optimization skipped:", error);
  }
}

export function BarcodeScanner({ onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const detectedRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !videoRef.current) {
      return;
    }

    let isMounted = true;
    detectedRef.current = false;

    const videoElement = videoRef.current;
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 50,
      delayBetweenScanSuccess: 250,
    });

    async function startScanner() {
      try {
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: {
                ideal: "environment",
              },
              width: {
                ideal: 1920,
              },
              height: {
                ideal: 1080,
              },
              frameRate: {
                ideal: 60,
              },
            },
          },
          videoElement,
          (result, error) => {
            if (!isMounted || detectedRef.current) {
              return;
            }

            if (!result) {
              if (error && !ignoredScanErrors.has(error.name)) {
                console.warn("Barcode scan error:", error);
              }

              return;
            }

            const rawValue = result.getText().trim();
            const numericValue = rawValue.replace(/\D/g, "");

            if (!numericValue) {
              toast.error("Barcode terbaca, tapi tidak berisi angka shipment");
              return;
            }

            detectedRef.current = true;
            controlsRef.current?.stop();
            controlsRef.current = null;

            onDetected(numericValue);
            toast.success("Barcode berhasil dibaca");
            setIsOpen(false);
          },
        );

        if (!isMounted) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        await optimizeCameraTrack(videoElement);
      } catch (error) {
        console.error("Scanner camera error:", error);
        toast.error("Tidak bisa membuka scanner kamera");
        setIsOpen(false);
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
        className="ind-btn-ghost flex h-11 w-11 shrink-0 items-center justify-center p-0"
        type="button"
        aria-label="Scan barcode"
        title="Scan barcode"
        onClick={() => setIsOpen(true)}
      >
        <Camera className="h-4 w-4" />
      </button>

      {isOpen ? (
        <div className="ind-modal-overlay z-50">
          <div className="ind-panel max-w-lg p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="ind-heading text-sm">Scan Barcode</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Arahkan kamera belakang ke kode shipment.
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

            <div className="relative overflow-hidden border-2 border-[var(--steel)] bg-black">
              <video
                ref={videoRef}
                className="aspect-video w-full bg-black object-cover"
                muted
                playsInline
                autoPlay
              />

              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-white/80" />
            </div>

            <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
              Gunakan HTTPS saat production. Pastikan barcode terang, tidak blur,
              dan memenuhi area tengah kamera.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
