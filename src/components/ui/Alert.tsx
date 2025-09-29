import type { ReactNode } from "react";

type AlertVariant = "success" | "warn" | "error" | "info";

type AlertProps = {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  variant?: AlertVariant;
  className?: string;
};

const variantStyles: Record<AlertVariant, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
};

export function Alert({ title, description, action, variant = "info", className = "" }: AlertProps) {
  return (
    <div
      role="status"
      className={[
        "flex flex-wrap items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm",
        variantStyles[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {description && <div className="text-sm leading-relaxed">{description}</div>}
      </div>
      {action && <div className="text-sm font-medium">{action}</div>}
    </div>
  );
}

export default Alert;
