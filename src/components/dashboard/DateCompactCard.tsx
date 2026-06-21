import { CalendarDays, Lock, Pencil, Plus } from "lucide-react";

export type DateCardStatus = "holiday" | "sunday" | "locked" | "filled" | "empty";

type DateCompactCardProps = {
  date: string;
  status: DateCardStatus;
  keterangan: string;
  readOnly: boolean;
  action: "none" | "input" | "edit";
  onClick?: () => void;
};

function formatDisplayDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00`);

  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function getStatusClass(status: DateCardStatus) {
  if (status === "sunday" || status === "holiday") {
    return "border-[var(--danger)] bg-[var(--danger-soft)] text-[#b91c1c]";
  }

  if (status === "locked") {
    return "border-[var(--warning)] bg-[var(--warning-soft)] text-[#92400e]";
  }

  if (status === "filled") {
    return "border-[var(--primary-dark)] bg-[var(--primary-soft)] text-[var(--primary-dark)]";
  }

  return "border-[var(--border)] bg-[var(--surface)] text-[var(--steel)]";
}

function getStatusPill(status: DateCardStatus) {
  if (status === "sunday" || status === "holiday") {
    return "Libur";
  }

  if (status === "locked") {
    return "Kunci";
  }

  if (status === "filled") {
    return "Terisi";
  }

  return "Belum";
}

function getActionIcon(action: DateCompactCardProps["action"], readOnly: boolean) {
  if (readOnly || action === "none") {
    return <Lock className="h-4 w-4" />;
  }

  if (action === "edit") {
    return <Pencil className="h-4 w-4" />;
  }

  return <Plus className="h-4 w-4" />;
}

function getActionBoxClass(
  action: DateCompactCardProps["action"],
  readOnly: boolean,
) {
  if (readOnly || action === "none") {
    return "border-[var(--border-soft)] bg-[var(--surface)]/90 text-[var(--muted)]";
  }

  if (action === "edit") {
    return "border-[var(--primary)] bg-[var(--surface)]/95 text-[var(--primary-dark)]";
  }

  return "border-[var(--success)] bg-[var(--surface)]/95 text-[#15803d]";
}

export function DateCompactCard({
  date,
  status,
  keterangan,
  readOnly,
  action,
  onClick,
}: DateCompactCardProps) {
  const clickable = !readOnly && Boolean(onClick);

  return (
    <button
      className={[
        "group min-h-36 border-2 p-4 text-left shadow-[3px_3px_0_rgba(15,23,42,0.06)] transition sm:min-h-40",
        getStatusClass(status),
        clickable
          ? "cursor-pointer hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_rgba(6,182,212,0.2)]"
          : "cursor-not-allowed opacity-90",
      ].join(" ")}
      disabled={!clickable}
      type="button"
      onClick={onClick}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="ind-badge bg-[var(--surface)]/90">
          <CalendarDays className="h-4 w-4" />
          {getStatusPill(status)}
        </div>

        <div
          className={[
            "border-2 bg-[var(--surface)]/90 p-2",
            getActionBoxClass(action, readOnly),
          ].join(" ")}
        >
          {getActionIcon(action, readOnly)}
        </div>
      </div>

      <p className="text-sm font-black leading-5 sm:leading-6">
        {formatDisplayDate(date)}
      </p>
      <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 opacity-80 sm:mt-3">
        {keterangan}
      </p>
    </button>
  );
}