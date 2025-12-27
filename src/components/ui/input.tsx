/**
 * Input Component
 * Design system primitive for text inputs with icons, states, and validation
 */

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useId,
} from "react";
import { cn } from "@/lib/cn";

export type InputSize = "sm" | "md" | "lg";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: InputSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  error?: string;
  hint?: string;
  label?: string;
  clearable?: boolean;
  onClear?: () => void;
  containerClassName?: string;
}

const sizeStyles: Record<InputSize, string> = {
  sm: "h-[var(--input-height-sm)] text-sm",
  md: "h-[var(--input-height-md)] text-sm",
  lg: "h-[var(--input-height-lg)] text-base",
};

const iconSizeStyles: Record<InputSize, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    size = "md",
    leftIcon,
    rightIcon,
    error,
    hint,
    label,
    clearable,
    onClear,
    containerClassName,
    className,
    disabled,
    id: providedId,
    value,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const hasValue = value !== undefined && value !== "";

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      {/* Label */}
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium text-text-secondary"
        >
          {label}
        </label>
      )}

      {/* Input wrapper */}
      <div className="relative">
        {/* Left icon */}
        {leftIcon && (
          <span
            className={cn(
              "absolute left-[var(--input-padding-x)] top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none",
              iconSizeStyles[size]
            )}
          >
            {leftIcon}
          </span>
        )}

        {/* Input element */}
        <input
          ref={ref}
          id={id}
          disabled={disabled}
          value={value}
          className={cn(
            // Base styles
            "w-full rounded-[var(--input-radius)]",
            "bg-background-secondary",
            "border border-border-default",
            "text-text-primary placeholder:text-text-tertiary",
            "transition-all duration-[var(--duration-fast)]",
            // Focus styles
            "focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary",
            // Hover styles
            "hover:border-border-emphasis",
            // Disabled styles
            "disabled:bg-background-tertiary disabled:text-text-muted disabled:cursor-not-allowed disabled:border-border-subtle",
            // Error styles
            error && "border-accent-danger focus:ring-accent-danger/30 focus:border-accent-danger",
            // Size styles
            sizeStyles[size],
            // Padding based on icons
            leftIcon ? "pl-9" : "pl-[var(--input-padding-x)]",
            rightIcon || clearable ? "pr-9" : "pr-[var(--input-padding-x)]",
            className
          )}
          {...props}
        />

        {/* Right icon / Clear button */}
        {(rightIcon || (clearable && hasValue)) && (
          <span
            className={cn(
              "absolute right-[var(--input-padding-x)] top-1/2 -translate-y-1/2",
              iconSizeStyles[size]
            )}
          >
            {clearable && hasValue ? (
              <button
                type="button"
                onClick={onClear}
                className="p-1 -m-1 rounded hover:bg-surface-overlay-hover text-text-tertiary hover:text-text-primary transition-colors"
                aria-label="Clear input"
              >
                <ClearIcon className={iconSizeStyles[size]} />
              </button>
            ) : (
              <span className="text-text-tertiary">{rightIcon}</span>
            )}
          </span>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-accent-danger flex items-center gap-1.5">
          <ErrorIcon className="w-3.5 h-3.5 shrink-0" />
          {error}
        </p>
      )}

      {/* Hint text */}
      {hint && !error && (
        <p className="text-sm text-text-tertiary">{hint}</p>
      )}
    </div>
  );
});

// Search-specific input variant
export interface SearchInputProps extends Omit<InputProps, "leftIcon" | "clearable"> {
  onSearch?: (value: string) => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput({ onSearch, value, onChange, ...props }, ref) {
    const handleClear = () => {
      onSearch?.("");
    };

    return (
      <Input
        ref={ref}
        leftIcon={<SearchIcon />}
        clearable
        onClear={handleClear}
        value={value}
        onChange={onChange}
        {...props}
      />
    );
  }
);

// Icon components
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function ClearIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}
