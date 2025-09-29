import type { ReactNode } from "react";

type AlertVariant = "success" | "warning" | "error" | "info";

type AlertProps = {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  variant?: AlertVariant;
  className?: string;
};

const variantStyles: Record<AlertVariant, string> = {
  success: "border-success/30 bg-success-light text-success shadow-small",
  warning: "border-warning/30 bg-warning-light text-warning shadow-small",
  error: "border-error/30 bg-error-light text-error shadow-small",
  info: "border-info/30 bg-info-light text-info shadow-small",
};

const iconStyles: Record<AlertVariant, string> = {
  success: "text-success",
  warning: "text-warning", 
  error: "text-error",
  info: "text-info",
};

export function Alert({ 
  title, 
  description, 
  action, 
  variant = "info", 
  className = "" 
}: AlertProps) {
  return (
    <div
      role="alert"
      className={[
        "flex flex-wrap items-start justify-between gap-4 rounded-large border px-4 py-3 text-sm transition-all duration-fast",
        variantStyles[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start gap-3 flex-1">
        {/* Ícone indicativo */}
        <div className={`mt-0.5 ${iconStyles[variant]}`}>
          {variant === "success" && (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
          {variant === "warning" && (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
          {variant === "error" && (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          )}
          {variant === "info" && (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        
        <div className="space-y-1 flex-1">
          {title && <p className="font-semibold text-foreground">{title}</p>}
          {description && (
            <div className="text-sm leading-relaxed text-foreground-secondary">
              {description}
            </div>
          )}
        </div>
      </div>
      
      {action && (
        <div className="text-sm font-medium flex-shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}

export default Alert;
