import type { ReactNode } from "react";

type Trend = {
  label: string;
  direction?: "up" | "down" | "neutral";
};

type KpiTileProps = {
  label: string;
  value: ReactNode;
  trend?: Trend;
  helperText?: string;
  icon?: ReactNode;
  className?: string;
};

const trendColors: Record<Trend["direction"], string> = {
  up: "text-emerald-600",
  down: "text-rose-600",
  neutral: "text-gray-500",
};

export function KpiTile({ label, value, trend, helperText, icon, className = "" }: KpiTileProps) {
  const trendDir = trend?.direction ?? "neutral";
  const trendLabel = trend?.label;

  return (
    <div
      className={["rounded-xl bg-white ring-1 ring-gray-200 shadow-sm p-4 sm:p-5", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <div className="text-2xl font-semibold text-gray-900">{value}</div>
        </div>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
      {(helperText || trendLabel) && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          {trendLabel && (
            <span className={["font-medium", trendColors[trendDir]].join(" ")}>{trendLabel}</span>
          )}
          {helperText && <span className="text-gray-500">{helperText}</span>}
        </div>
      )}
    </div>
  );
}

export default KpiTile;
