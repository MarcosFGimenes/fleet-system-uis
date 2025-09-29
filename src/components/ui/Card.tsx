import type { ReactNode } from "react";

type CardPadding = "none" | "sm" | "md" | "lg";

type CardProps = {
  children: ReactNode;
  className?: string;
  padding?: CardPadding;
  interactive?: boolean;
};

const paddingMap: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Card({ children, className = "", padding = "md", interactive = false }: CardProps) {
  const base = "rounded-xl bg-white shadow-sm ring-1 ring-gray-200";
  const interactiveClasses = interactive
    ? "transition hover:shadow-md hover:ring-gray-300 focus-within:shadow-md focus-within:ring-gray-300"
    : "";
  const classes = [base, paddingMap[padding], interactiveClasses, className]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}

export default Card;
