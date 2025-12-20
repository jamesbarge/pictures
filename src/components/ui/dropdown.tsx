/**
 * Dropdown Components
 * Accessible dropdown menus and select components using Base UI primitives
 */

"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { Menu } from "@base-ui/react/menu";
import { cn } from "@/lib/cn";
import { ChevronDown, Check } from "lucide-react";

// ============================================================================
// Dropdown Menu (for actions)
// ============================================================================

export interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
}

export function DropdownMenu({ trigger, children, align = "start" }: DropdownMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger className="focus:outline-none">{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align={align} sideOffset={8}>
          <Menu.Popup
            className={cn(
              "z-50 min-w-[180px]",
              "bg-background-secondary border border-border-default",
              "rounded-[var(--dropdown-radius)] shadow-xl",
              "p-[var(--dropdown-padding)]",
              "animate-scale-in origin-top-left",
              "focus:outline-none"
            )}
          >
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export interface DropdownItemProps {
  children: ReactNode;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

export function DropdownItem({
  children,
  icon,
  destructive,
  disabled,
  onSelect,
}: DropdownItemProps) {
  return (
    <Menu.Item
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2",
        "px-[var(--dropdown-item-padding-x)] py-[var(--dropdown-item-padding-y)]",
        "rounded-[var(--dropdown-item-radius)]",
        "text-sm transition-colors cursor-pointer",
        "focus:outline-none",
        destructive
          ? "text-accent-red hover:bg-accent-red/10 focus:bg-accent-red/10"
          : "text-text-secondary hover:bg-surface-overlay-hover hover:text-text-primary focus:bg-surface-overlay-hover focus:text-text-primary",
        disabled && "opacity-50 cursor-not-allowed pointer-events-none"
      )}
    >
      {icon && <span className="w-4 h-4 shrink-0">{icon}</span>}
      {children}
    </Menu.Item>
  );
}

export function DropdownSeparator() {
  return <Menu.Separator className="h-px bg-border-subtle my-1 -mx-1" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-[var(--dropdown-item-padding-x)] py-1 text-xs font-medium text-text-tertiary uppercase tracking-wider">
      {children}
    </div>
  );
}

// ============================================================================
// Select Component (for selecting a value)
// ============================================================================

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  error?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select...",
  label,
  disabled,
  size = "md",
  fullWidth,
  error,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const sizeStyles = {
    sm: "h-[var(--button-height-sm)] text-sm",
    md: "h-[var(--button-height-md)] text-sm",
    lg: "h-[var(--button-height-lg)] text-base",
  };

  const handleSelect = useCallback(
    (option: SelectOption) => {
      if (!option.disabled) {
        onChange?.(option.value);
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < options.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : options.length - 1
          );
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (highlightedIndex >= 0) {
            handleSelect(options[highlightedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          triggerRef.current?.focus();
          break;
      }
    },
    [isOpen, highlightedIndex, options, handleSelect]
  );

  useEffect(() => {
    if (isOpen && value) {
      const index = options.findIndex((o) => o.value === value);
      if (index >= 0) setHighlightedIndex(index);
    }
  }, [isOpen, value, options]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className={cn("flex flex-col gap-1.5", fullWidth && "w-full")}>
      {label && (
        <label className="text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}

      <div className="relative" onKeyDown={handleKeyDown}>
        {/* Trigger */}
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center justify-between gap-2",
            "px-[var(--input-padding-x)]",
            "bg-background-secondary border border-border-default",
            "rounded-[var(--input-radius)]",
            "text-left transition-all duration-[var(--duration-fast)]",
            "focus:outline-none focus:ring-2 focus:ring-accent-gold/50 focus:border-accent-gold/50",
            "hover:border-border-emphasis",
            "disabled:bg-background-tertiary disabled:text-text-muted disabled:cursor-not-allowed",
            error && "border-accent-red",
            sizeStyles[size],
            fullWidth ? "w-full" : "min-w-[180px]"
          )}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span
            className={cn(
              "truncate",
              selectedOption ? "text-text-primary" : "text-text-tertiary"
            )}
          >
            {selectedOption?.label || placeholder}
          </span>
          <ChevronDown
            className={cn(
              "w-4 h-4 shrink-0 text-text-tertiary transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div
            ref={listRef}
            role="listbox"
            className={cn(
              "absolute z-50 top-full left-0 right-0 mt-2",
              "bg-background-secondary border border-border-default",
              "rounded-[var(--dropdown-radius)] shadow-xl",
              "p-[var(--dropdown-padding)]",
              "max-h-[var(--dropdown-max-height)] overflow-y-auto",
              "animate-scale-in origin-top"
            )}
          >
            {options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                disabled={option.disabled}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  "w-full flex items-center gap-2",
                  "px-[var(--dropdown-item-padding-x)] py-[var(--dropdown-item-padding-y)]",
                  "rounded-[var(--dropdown-item-radius)]",
                  "text-sm text-left transition-colors",
                  "focus:outline-none",
                  option.value === value
                    ? "bg-accent-gold/10 text-accent-gold"
                    : highlightedIndex === index
                    ? "bg-surface-overlay-hover text-text-primary"
                    : "text-text-secondary hover:bg-surface-overlay-hover hover:text-text-primary",
                  option.disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {option.icon && (
                  <span className="w-4 h-4 shrink-0">{option.icon}</span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{option.label}</div>
                  {option.description && (
                    <div className="text-xs text-text-tertiary truncate">
                      {option.description}
                    </div>
                  )}
                </div>
                {option.value === value && (
                  <Check className="w-4 h-4 shrink-0 text-accent-gold" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-accent-red">{error}</p>
      )}
    </div>
  );
}

// ============================================================================
// Multi-Select Component
// ============================================================================

export interface MultiSelectProps {
  options: SelectOption[];
  values: string[];
  onChange?: (values: string[]) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  searchable?: boolean;
  maxDisplayItems?: number;
}

export function MultiSelect({
  options,
  values,
  onChange,
  placeholder = "Select...",
  label,
  disabled,
  searchable,
  maxDisplayItems = 2,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = searchable && searchTerm.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          o.description?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;

  const selectedOptions = options.filter((o) => values.includes(o.value));

  const toggleValue = (value: string) => {
    const newValues = values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];
    onChange?.(newValues);
  };

  const getDisplayText = () => {
    if (selectedOptions.length === 0) return placeholder;
    if (selectedOptions.length <= maxDisplayItems) {
      return selectedOptions.map((o) => o.label).join(", ");
    }
    return `${selectedOptions.length} selected`;
  };

  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}

      <div ref={containerRef} className="relative">
        {/* Trigger */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-full flex items-center justify-between gap-2",
            "h-[var(--button-height-md)] px-[var(--input-padding-x)]",
            "bg-background-secondary border",
            values.length > 0 ? "border-accent-gold/30" : "border-border-default",
            "rounded-[var(--input-radius)]",
            "text-sm text-left transition-all duration-[var(--duration-fast)]",
            "focus:outline-none focus:ring-2 focus:ring-accent-gold/50",
            "hover:border-border-emphasis",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <span
            className={cn(
              "truncate",
              values.length > 0 ? "text-text-primary" : "text-text-tertiary"
            )}
          >
            {getDisplayText()}
          </span>
          <ChevronDown
            className={cn(
              "w-4 h-4 shrink-0 text-text-tertiary transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div
            className={cn(
              "absolute z-50 top-full left-0 right-0 mt-2",
              "bg-background-secondary border border-border-default",
              "rounded-[var(--dropdown-radius)] shadow-xl",
              "overflow-hidden animate-scale-in origin-top"
            )}
          >
            {/* Search input */}
            {searchable && (
              <div className="p-2 border-b border-border-subtle">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className={cn(
                    "w-full px-3 py-2",
                    "bg-background-tertiary border border-border-subtle",
                    "rounded-lg text-sm text-text-primary placeholder:text-text-tertiary",
                    "focus:outline-none focus:border-border-emphasis"
                  )}
                />
              </div>
            )}

            {/* Options */}
            <div className="max-h-64 overflow-y-auto p-[var(--dropdown-padding)]">
              {filteredOptions.map((option) => {
                const isSelected = values.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => toggleValue(option.value)}
                    className={cn(
                      "w-full flex items-center gap-2",
                      "px-[var(--dropdown-item-padding-x)] py-[var(--dropdown-item-padding-y)]",
                      "rounded-[var(--dropdown-item-radius)]",
                      "text-sm text-left transition-colors",
                      isSelected
                        ? "bg-accent-gold/10 text-accent-gold"
                        : "text-text-secondary hover:bg-surface-overlay-hover hover:text-text-primary",
                      option.disabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {/* Checkbox */}
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                        isSelected
                          ? "bg-accent-gold border-accent-gold"
                          : "border-border-emphasis"
                      )}
                    >
                      {isSelected && (
                        <Check className="w-3 h-3 text-background-primary" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="truncate">{option.label}</div>
                      {option.description && (
                        <div className="text-xs text-text-tertiary truncate">
                          {option.description}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}

              {filteredOptions.length === 0 && (
                <p className="px-3 py-4 text-sm text-text-tertiary text-center">
                  No options found
                </p>
              )}
            </div>

            {/* Clear selection */}
            {values.length > 0 && (
              <div className="border-t border-border-subtle p-2">
                <button
                  type="button"
                  onClick={() => onChange?.([])}
                  className="w-full px-3 py-2 text-sm text-text-tertiary hover:text-text-primary hover:bg-surface-overlay-hover rounded-lg transition-colors"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
