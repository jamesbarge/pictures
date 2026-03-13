/**
 * Cinema Search Filter Component
 * Text input for filtering screenings by cinema name
 */

"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

interface CinemaSearchFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Text input for filtering screenings by cinema name with clearable search. */
export function CinemaSearchFilter({
  value,
  onChange,
  placeholder = "Search cinemas...",
}: CinemaSearchFilterProps) {
  const hasValue = value.trim() !== "";

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full pl-9 pr-8 py-2 rounded-lg border text-sm",
          "bg-background-secondary border-border-subtle",
          "text-text-primary placeholder:text-text-tertiary",
          "focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary",
          "hover:border-border-default transition-colors"
        )}
      />
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-surface-overlay-hover text-text-tertiary hover:text-text-primary transition-colors"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
