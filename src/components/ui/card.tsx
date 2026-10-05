/**
 * Card Component
 * Flexible container component with multiple variants for content display
 */

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CardVariant = "default" | "elevated" | "outlined" | "ghost" | "interactive";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: "none" | "sm" | "md" | "lg";
  as?: "div" | "article" | "section";
}

const variantStyles: Record<CardVariant, string> = {
  default: "bg-background-secondary border border-border-subtle shadow-card",
  elevated: "bg-background-secondary border border-border-subtle shadow-card-hover",
  outlined: "bg-transparent border border-border-default",
  ghost: "bg-transparent border-none",
  interactive: cn(
    "bg-background-secondary border border-border-subtle shadow-card",
    "transition-[border-color,box-shadow] duration-[var(--duration-normal)]",
    "hover:border-accent-primary/30 hover:shadow-card-hover",
    "cursor-pointer"
  ),
};

const paddingStyles: Record<string, string> = {
  none: "p-0",
  sm: "p-[var(--space-3)]",
  md: "p-[var(--card-padding)]",
  lg: "p-[var(--space-6)]",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    variant = "default",
    padding = "md",
    as: Component = "div",
    className,
    children,
    ...props
  },
  ref
) {
  return (
    <Component
      ref={ref}
      className={cn(
        "rounded-[var(--card-radius)]",
        variantStyles[variant],
        paddingStyles[padding],
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
});

/** Card header with optional heading, subtitle, and action slot. */
export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  heading?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}

export function CardHeader({
  heading,
  subtitle,
  action,
  className,
  children,
  ...props
}: CardHeaderProps) {
  return (
    <div
      className={cn("flex items-start justify-between gap-4", className)}
      {...props}
    >
      <div className="flex-1 min-w-0">
        {heading && (
          <h3 className="font-display text-lg text-text-primary truncate">
            {heading}
          </h3>
        )}
        {subtitle && (
          <p className="text-sm text-text-secondary mt-0.5">{subtitle}</p>
        )}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Card body content area with top margin spacing. */
export function CardContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mt-3", className)} {...props}>
      {children}
    </div>
  );
}
