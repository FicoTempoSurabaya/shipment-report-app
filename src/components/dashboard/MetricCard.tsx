import type { CSSProperties, ReactNode } from "react";

type MetricCardProps = {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  accentColor?: string;
  iconBorderColor?: string;
  iconBackgroundColor?: string;
  iconColor?: string;
};

export function MetricCard({
  title,
  value,
  description,
  icon,
  accentColor,
  iconBorderColor,
  iconBackgroundColor,
  iconColor,
}: MetricCardProps) {
  const cardStyle: CSSProperties = accentColor
    ? {
        borderLeftColor: accentColor,
      }
    : {};

  const iconStyle: CSSProperties = {
    borderColor: iconBorderColor ?? accentColor ?? "var(--primary)",
    background: iconBackgroundColor ?? "var(--primary-soft)",
    color: iconColor ?? accentColor ?? "var(--primary-dark)",
  };

  return (
    <div className="ind-card p-4 sm:p-5" style={cardStyle}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="ind-label">{title}</p>
          <p className="ind-heading mt-2 truncate text-3xl sm:text-4xl">{value}</p>
        </div>

        {icon ? (
          <div className="ind-metric-icon" style={iconStyle}>
            {icon}
          </div>
        ) : null}
      </div>

      {description ? (
        <p className="mt-3 text-xs leading-5 text-[var(--muted)] sm:text-sm sm:leading-6">
          {description}
        </p>
      ) : null}
    </div>
  );
}