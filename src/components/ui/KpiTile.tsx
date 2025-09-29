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
  interactive?: boolean;
};

const trendColors: Record<Trend["direction"], string> = {
  up: "text-success",
  down: "text-error",
  neutral: "text-foreground-tertiary",
};

const trendIcons: Record<Trend["direction"], ReactNode> = {
  up: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
    </svg>
  ),
  down: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  ),
  neutral: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
    </svg>
  ),
};

export function KpiTile({ 
  label, 
  value, 
  trend, 
  helperText, 
  icon, 
  className = "",
  interactive = false 
}: KpiTileProps) {
  const trendDir = trend?.direction ?? "neutral";
  const trendLabel = trend?.label;

  const baseClasses = "rounded-large bg-surface border border-border shadow-small p-4 sm:p-6";
  const interactiveClasses = interactive 
    ? "transition-all duration-medium hover:shadow-card-hover hover:border-border-secondary hover:-translate-y-0.5 cursor-pointer focus-within:shadow-card-hover focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10"
    : "";

  return (
    <div
      className={[baseClasses, interactiveClasses, className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <p className="text-sm font-medium text-foreground-tertiary uppercase tracking-wide">
            {label}
          </p>
          <div className="text-3xl font-bold text-foreground leading-none">
            {value}
          </div>
        </div>
        {icon && (
          <div className="text-foreground-tertiary p-2 bg-gray-50 rounded-medium">
            {icon}
          </div>
        )}
      </div>
      
      {(helperText || trendLabel) && (
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-2 text-sm">
          {trendLabel && (
            <div className={`flex items-center gap-1.5 font-medium ${trendColors[trendDir]}`}>
              {trendIcons[trendDir]}
              <span>{trendLabel}</span>
            </div>
          )}
          {helperText && (
            <span className="text-foreground-tertiary text-xs">
              {helperText}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default KpiTile;
