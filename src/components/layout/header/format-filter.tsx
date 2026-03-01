"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Film, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFilters, FORMAT_OPTIONS } from "@/stores/filters";

/** Format Filter Component - 35mm, 70mm, IMAX, etc. */
export function FormatFilter({ mounted, availableFormats, fullWidth }: { mounted: boolean; availableFormats: string[]; fullWidth?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { formats, toggleFormat } = useFilters();

  // Only show formats that have screenings
  const displayedFormats = useMemo(() => {
    return FORMAT_OPTIONS.filter((opt) => availableFormats.includes(opt.value));
  }, [availableFormats]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayText = useMemo(() => {
    if (!mounted || formats.length === 0) return "Format";
    if (formats.length === 1) {
      const format = FORMAT_OPTIONS.find((f) => f.value === formats[0]);
      return format?.label || formats[0];
    }
    return `${formats.length} Formats`;
  }, [mounted, formats]);

  const hasSelection = mounted && formats.length > 0;

  // Don't render if no formats are available
  if (displayedFormats.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className={cn("relative", fullWidth && "w-full")}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors",
          fullWidth ? "w-full" : "min-w-[120px]",
          hasSelection
            ? "bg-accent-primary/10 border-accent-primary/30 text-accent-primary"
            : "bg-background-secondary border-border-default text-text-secondary hover:border-border-emphasis hover:text-text-primary"
        )}
      >
        <Film className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left truncate">{displayText}</span>
        <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className={cn(
          "absolute top-full mt-2 z-50 bg-background-secondary border border-border-default rounded-xl shadow-elevated overflow-hidden",
          fullWidth ? "left-0 right-0" : "left-0 w-56"
        )}>
          {/* Header */}
          <div className="p-3 border-b border-border-subtle">
            <p className="text-xs text-text-tertiary">
              Filter by projection format. Select multiple to see screenings in any of these formats.
            </p>
          </div>

          {/* Format Options */}
          <div className="max-h-64 overflow-y-auto p-2">
            {displayedFormats.map((format) => {
              const isSelected = formats.includes(format.value);
              return (
                <button
                  key={format.value}
                  onClick={() => toggleFormat(format.value)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                    isSelected
                      ? "bg-accent-primary/10 text-accent-primary"
                      : "text-text-secondary hover:bg-background-hover hover:text-text-primary"
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                      isSelected ? "bg-accent-primary border-accent-primary" : "border-border-default"
                    )}
                  >
                    {isSelected && <Check className="w-3 h-3 text-text-inverse" aria-hidden="true" />}
                  </div>
                  <span>{format.label}</span>
                </button>
              );
            })}
          </div>

          {/* Clear Selection */}
          {formats.length > 0 && (
            <div className="border-t border-border-subtle p-2">
              <button
                onClick={() => {
                  formats.forEach((f) => toggleFormat(f));
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-text-tertiary hover:bg-background-hover hover:text-text-primary transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
