/**
 * Badge Component
 * Small labels for status, categories, and metadata display
 */

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant =
  | "default"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger"
  | "gold"
  | "outline";

export type BadgeSize = "sm" | "md";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: ReactNode;
  removable?: boolean;
  onRemove?: () => void;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-background-tertiary text-text-secondary border-transparent",
  primary: "bg-accent-gold/20 text-accent-gold border-accent-gold/30",
  secondary: "bg-accent-blue/20 text-accent-blue border-accent-blue/30",
  success: "bg-accent-green/20 text-accent-green border-accent-green/30",
  warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  danger: "bg-accent-red/20 text-accent-red border-accent-red/30",
  gold: "bg-accent-gold text-background-primary border-transparent",
  outline: "bg-transparent text-text-secondary border-border-emphasis",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "h-5 px-1.5 text-[10px] gap-1",
  md: "h-6 px-2 text-xs gap-1.5",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  {
    variant = "default",
    size = "md",
    icon,
    removable,
    onRemove,
    className,
    children,
    ...props
  },
  ref
) {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center font-medium",
        "rounded-[var(--badge-radius)] border",
        "transition-colors duration-[var(--duration-fast)]",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
      {removable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="shrink-0 ml-0.5 -mr-0.5 p-0.5 rounded hover:bg-white/10 transition-colors"
          aria-label="Remove"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
});

// Pre-configured format badges for film screenings
export function FormatBadge({ format }: { format: string }) {
  const formatVariants: Record<string, BadgeVariant> = {
    "35mm": "gold",
    "70mm": "danger",
    imax: "secondary",
    "4k": "primary",
    dcp: "default",
    dolby_atmos: "primary",
  };

  return (
    <Badge
      variant={formatVariants[format.toLowerCase()] || "default"}
      size="sm"
      className="font-mono uppercase"
    >
      {format}
    </Badge>
  );
}

// Pre-configured event badges
export function EventBadge({ type, label }: { type: string; label?: string }) {
  const eventVariants: Record<string, { variant: BadgeVariant; text: string }> = {
    q_and_a: { variant: "gold", text: "Q&A" },
    intro: { variant: "success", text: "Intro" },
    discussion: { variant: "secondary", text: "Discussion" },
    double_bill: { variant: "warning", text: "Double Bill" },
  };

  const config = eventVariants[type];
  if (!config) return null;

  return (
    <Badge variant={config.variant} size="sm">
      {label || config.text}
    </Badge>
  );
}

// Repertory badge for classic films
export function RepertoryBadge({ size = "sm" }: { size?: BadgeSize }) {
  return (
    <Badge variant="gold" size={size}>
      REP
    </Badge>
  );
}
