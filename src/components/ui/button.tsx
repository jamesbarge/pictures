/**
 * Button Component
 * Design system primitive with multiple variants, sizes, and states
 *
 * Uses Base UI for accessibility and interaction handling
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: cn(
    "bg-accent-primary text-text-inverse",
    "hover:bg-accent-primary-hover",
    "active:bg-accent-primary-light",
    "disabled:bg-accent-primary/50 disabled:text-text-inverse/70"
  ),
  secondary: cn(
    "bg-background-secondary text-text-primary border border-border-default",
    "hover:bg-background-hover hover:border-border-emphasis",
    "active:bg-background-active",
    "disabled:bg-background-secondary/50 disabled:text-text-tertiary disabled:border-border-subtle"
  ),
  ghost: cn(
    "bg-transparent text-text-secondary",
    "hover:bg-surface-overlay-hover hover:text-text-primary",
    "active:bg-surface-overlay-active",
    "disabled:text-text-muted disabled:bg-transparent"
  ),
  danger: cn(
    "bg-accent-danger text-text-inverse",
    "hover:bg-accent-danger/90",
    "active:bg-accent-danger/80",
    "disabled:bg-accent-danger/50"
  ),
  gold: cn(
    "bg-accent-highlight/10 text-accent-highlight-dark border border-accent-highlight/30",
    "hover:bg-accent-highlight/20 hover:border-accent-highlight/50",
    "active:bg-accent-highlight/30",
    "disabled:bg-accent-highlight/5 disabled:text-accent-highlight/50 disabled:border-accent-highlight/20"
  ),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-[var(--button-height-sm)] px-[var(--button-padding-x-sm)] text-sm gap-1.5",
  md: "h-[var(--button-height-md)] px-[var(--button-padding-x-md)] text-sm gap-2",
  lg: "h-[var(--button-height-lg)] px-[var(--button-padding-x-lg)] text-base gap-2.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className,
      disabled,
      children,
      ...props
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center font-medium",
          "rounded-[var(--button-radius)]",
          "transition-colors duration-[var(--duration-fast)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary",
          "disabled:cursor-not-allowed",
          // Variant styles
          variantStyles[variant],
          // Size styles
          sizeStyles[size],
          // Full width
          fullWidth && "w-full",
          // Loading state
          isLoading && "relative text-transparent",
          className
        )}
        {...props}
      >
        {/* Loading spinner overlay */}
        {isLoading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <LoadingSpinner size={size} />
          </span>
        )}

        {/* Left icon */}
        {leftIcon && !isLoading && (
          <span className="shrink-0">{leftIcon}</span>
        )}

        {/* Content */}
        {children}

        {/* Right icon */}
        {rightIcon && !isLoading && (
          <span className="shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);

// Loading spinner component
function LoadingSpinner({ size }: { size: ButtonSize }) {
  const spinnerSize = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <svg
      className={cn(spinnerSize[size], "animate-spin")}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// Icon button variant - square button for icons only
export interface IconButtonProps extends Omit<ButtonProps, "leftIcon" | "rightIcon" | "children"> {
  icon: ReactNode;
  label: string; // Required for accessibility
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ icon, label, size = "md", className, ...props }, ref) {
    const sizeClass = {
      sm: "w-[var(--button-height-sm)] h-[var(--button-height-sm)]",
      md: "w-[var(--button-height-md)] h-[var(--button-height-md)]",
      lg: "w-[var(--button-height-lg)] h-[var(--button-height-lg)]",
    };

    return (
      <Button
        ref={ref}
        size={size}
        className={cn("!px-0", sizeClass[size], className)}
        aria-label={label}
        {...props}
      >
        {icon}
      </Button>
    );
  }
);
