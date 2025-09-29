import type { ReactNode } from "react";

type CardPadding = "none" | "sm" | "md" | "lg" | "xl";

type CardProps = {
  children: ReactNode;
  className?: string;
  padding?: CardPadding;
  interactive?: boolean;
  elevated?: boolean;
};

const paddingMap: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
  xl: "p-8",
};

export function Card({ 
  children, 
  className = "", 
  padding = "md", 
  interactive = false,
  elevated = false 
}: CardProps) {
  const base = "rounded-large bg-surface border border-border";
  
  const shadowClass = elevated ? "shadow-medium" : "shadow-small";
  
  const interactiveClasses = interactive
    ? "transition-all duration-medium hover:shadow-card-hover hover:border-border-secondary hover:-translate-y-0.5 focus-within:shadow-card-hover focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10"
    : "";
    
  const classes = [
    base, 
    shadowClass,
    paddingMap[padding], 
    interactiveClasses, 
    className
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}

export default Card;
