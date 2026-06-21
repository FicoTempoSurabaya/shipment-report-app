"use client";

import { Check, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  FAILURE_REASONS,
  type FailureReason,
  type ShipmentFailureReason,
} from "@/types/shipment";

type FailureReasonInputProps = {
  gagal: number;
  value: ShipmentFailureReason[];
  onChange: (value: ShipmentFailureReason[]) => void;
};

export function FailureReasonInput({
  gagal,
  value,
  onChange,
}: FailureReasonInputProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isReasonPopoverOpen, setIsReasonPopoverOpen] = useState(false);
  const [isOtherPopoverOpen, setIsOtherPopoverOpen] = useState(false);
  const [otherDraft, setOtherDraft] = useState("");

  const isEnabled = gagal > 0;

  const selectedReasons = useMemo(
    () => value.map((item) => item.reason),
    [value],
  );

  const otherNote =
    value.find((item) => item.reason === "Lainnya")?.note?.trim() ?? "";

  const selectedItems = useMemo(
    () =>
      value.map((item) => ({
        reason: item.reason,
        label:
          item.reason === "Lainnya"
            ? item.note?.trim() || "Lainnya"
            : item.reason,
      })),
    [value],
  );

  useEffect(() => {
    if (isEnabled) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setIsReasonPopoverOpen(false);
      setIsOtherPopoverOpen(false);
      setOtherDraft("");
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isEnabled]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setIsReasonPopoverOpen(false);
      setIsOtherPopoverOpen(false);
      triggerRef.current?.focus();
    }

    if (isReasonPopoverOpen || isOtherPopoverOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isReasonPopoverOpen, isOtherPopoverOpen]);

  function orderReasons(nextValue: ShipmentFailureReason[]) {
    return FAILURE_REASONS.flatMap((orderedReason) =>
      nextValue.filter((item) => item.reason === orderedReason),
    );
  }

  function closePopover() {
    setIsReasonPopoverOpen(false);
    setIsOtherPopoverOpen(false);
    triggerRef.current?.focus();
  }

  function openReasonPopover() {
    if (!isEnabled) {
      return;
    }

    setIsOtherPopoverOpen(false);
    setIsReasonPopoverOpen(true);
  }

  function openOtherPopover() {
    setOtherDraft(otherNote);
    setIsReasonPopoverOpen(false);
    setIsOtherPopoverOpen(true);
  }

  function toggleReason(reason: FailureReason) {
    if (!isEnabled) {
      return;
    }

    const exists = selectedReasons.includes(reason);

    if (reason === "Lainnya") {
      if (exists) {
        onChange(value.filter((item) => item.reason !== reason));
        return;
      }

      openOtherPopover();
      return;
    }

    if (exists) {
      onChange(value.filter((item) => item.reason !== reason));
      return;
    }

    onChange(orderReasons([...value, { reason }]));
  }

  function saveOtherReason() {
    const note = otherDraft.trim();

    if (!note) {
      return;
    }

    const withoutOther = value.filter((item) => item.reason !== "Lainnya");

    onChange(
      orderReasons([
        ...withoutOther,
        {
          reason: "Lainnya",
          note,
        },
      ]),
    );

    setIsOtherPopoverOpen(false);
    setIsReasonPopoverOpen(true);
    setOtherDraft("");
  }

  function cancelOtherReason() {
    setIsOtherPopoverOpen(false);
    setIsReasonPopoverOpen(true);
    setOtherDraft(otherNote);
  }

  return (
    <div>
      <div className="mb-2">
        <span className="text-sm font-black text-[var(--steel)]">Alasan</span>
      </div>

      <button
        ref={triggerRef}
        className={`flex min-h-12 w-full items-center justify-between gap-3 border-2 px-3 py-2 text-left outline-none transition ${
          isEnabled
            ? "border-[var(--border)] bg-[var(--surface)] text-[var(--steel)] hover:border-[var(--primary-dark)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/15"
            : "cursor-not-allowed border-[var(--border-soft)] bg-[var(--surface-soft)] text-[var(--muted)]"
        }`}
        type="button"
        aria-expanded={isReasonPopoverOpen || isOtherPopoverOpen}
        aria-haspopup="dialog"
        disabled={!isEnabled}
        onClick={openReasonPopover}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {isEnabled && selectedItems.length > 0 ? (
            selectedItems.map((item) => (
              <span
                key={item.reason}
                className="max-w-full truncate border-2 border-[var(--primary)] bg-[var(--primary-soft)] px-2 py-1 text-xs font-black text-[var(--primary-dark)]"
              >
                {item.label}
              </span>
            ))
          ) : (
            <span className="text-sm font-black text-[var(--muted)]">Alasan</span>
          )}
        </span>

        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center border-2 text-white transition ${
            isEnabled
              ? "border-[var(--steel)] bg-[var(--primary-dark)] hover:bg-[var(--primary)]"
              : "border-[var(--border-soft)] bg-[var(--border-soft)]"
          }`}
        >
          <Plus className="h-4 w-4" />
        </span>
      </button>

      {isReasonPopoverOpen && isEnabled ? (
        <div
          className="ind-modal-overlay z-[100]"
          role="presentation"
          onMouseDown={closePopover}
        >
          <div
            className="ind-modal max-w-md p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Popover multi select alasan gagal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3 border-b-2 border-[var(--border-soft)] pb-3">
              <div>
                <p className="ind-label">Alasan Gagal</p>
                <p className="mt-1 text-sm font-black text-[var(--steel)]">
                  Pilih satu atau beberapa alasan
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                  Hasil pilihan akan tampil di dalam kotak Alasan.
                </p>
              </div>

              <button
                className="flex min-h-10 items-center justify-center border-2 border-[var(--border-soft)] bg-[var(--surface)] p-2 text-[var(--steel)] transition hover:border-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                type="button"
                aria-label="Tutup pilihan alasan"
                onClick={closePopover}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {FAILURE_REASONS.map((reason) => {
                const checked = selectedReasons.includes(reason);
                const label =
                  reason === "Lainnya" && otherNote
                    ? `Lainnya: ${otherNote}`
                    : reason;

                return (
                  <button
                    key={reason}
                    className={`flex min-h-11 items-center gap-2 border-2 px-3 py-2 text-left text-sm font-black transition ${
                      checked
                        ? "border-[var(--primary-dark)] bg-[var(--primary-soft)] text-[var(--primary-dark)]"
                        : "border-[var(--border-soft)] bg-[var(--surface-soft)] text-[var(--steel)] hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
                    }`}
                    type="button"
                    onClick={() => toggleReason(reason)}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${
                        checked
                          ? "border-[var(--steel)] bg-[var(--primary-dark)] text-white"
                          : "border-[var(--border)] bg-[var(--surface)] text-transparent"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>

                    <span className="min-w-0 flex-1 truncate">{label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex justify-end border-t-2 border-[var(--border-soft)] pt-3">
              <button
                className="ind-btn-primary px-4 py-2 text-sm"
                type="button"
                onClick={closePopover}
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isOtherPopoverOpen && isEnabled ? (
        <div
          className="ind-modal-overlay z-[110]"
          role="presentation"
          onMouseDown={cancelOtherReason}
        >
          <div
            className="ind-modal max-w-md p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Popover alasan lainnya"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3 border-b-2 border-[var(--border-soft)] pb-3">
              <div>
                <p className="ind-label">Alasan Lainnya</p>
                <p className="mt-1 text-sm font-black text-[var(--steel)]">
                  Isi alasan tambahan
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
                  Tekan centang untuk menyimpan ke dalam kotak Alasan.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="flex min-h-10 items-center justify-center border-2 border-[var(--border-soft)] bg-[var(--surface)] p-2 text-[var(--steel)] transition hover:border-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                  type="button"
                  aria-label="Batal alasan lainnya"
                  onClick={cancelOtherReason}
                >
                  <X className="h-4 w-4" />
                </button>

                <button
                  className="ind-btn-primary p-2 disabled:cursor-not-allowed"
                  type="button"
                  aria-label="Simpan alasan lainnya"
                  disabled={!otherDraft.trim()}
                  onClick={saveOtherReason}
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            </div>

            <textarea
              className="ind-input min-h-28 resize-none placeholder:text-[var(--muted)]"
              placeholder="Contoh: toko pindah lokasi, akses jalan ditutup, penerima tidak ada..."
              value={otherDraft}
              autoFocus
              onChange={(event) => setOtherDraft(event.target.value)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}