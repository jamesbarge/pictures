"use client";

import { Film, Sparkles, History } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFilters } from "@/stores/filters";

/** Film Type Filter Component - All / New Releases / Repertory */
export function FilmTypeFilter({ mounted, fullWidth }: { mounted: boolean; fullWidth?: boolean }) {
  const { programmingTypes, setProgrammingTypes } = useFilters();

  // Determine current selection
  const currentType = mounted
    ? programmingTypes.length === 0
      ? "all"
      : programmingTypes.includes("repertory")
      ? "repertory"
      : programmingTypes.includes("new_release")
      ? "new_release"
      : "all"
    : "all";

  const handleSelect = (type: "all" | "new_release" | "repertory") => {
    if (type === "all") {
      setProgrammingTypes([]);
    } else {
      setProgrammingTypes([type]);
    }
  };

  const options = [
    { value: "all", label: "All", icon: Film },
    { value: "new_release", label: "New", icon: Sparkles },
    { value: "repertory", label: "Repertory", icon: History },
  ] as const;

  return (
    <div
      role="group"
      aria-label="Film type filter"
      className={cn(
        "flex rounded-lg border border-border-default bg-background-tertiary overflow-hidden",
        fullWidth && "w-full"
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = currentType === option.value;
        return (
          <button
            key={option.value}
            onClick={() => handleSelect(option.value)}
            aria-pressed={isActive}
            className={cn(
              "flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors",
              "border-r border-border-default last:border-r-0",
              fullWidth && "flex-1",
              isActive
                ? "bg-accent-primary text-text-inverse"
                : "text-text-secondary hover:text-text-primary hover:bg-background-hover"
            )}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
