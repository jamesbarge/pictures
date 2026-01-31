/**
 * Theme Setting Component
 * Segmented control for selecting light, dark, or system theme.
 */

"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useHydrated } from "@/hooks/useHydrated";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark" | "system";

const themes: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeSetting() {
  const { theme, setTheme } = useTheme();
  const mounted = useHydrated();

  // Show loading skeleton before hydration to prevent flash
  if (!mounted) {
    return (
      <div className="space-y-3">
        <div className="h-12 rounded-lg bg-background-secondary animate-pulse" />
        <div className="h-4 w-48 rounded bg-background-secondary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Segmented Control */}
      <div
        className="inline-flex rounded-lg border border-border-subtle bg-background-tertiary p-1"
        role="radiogroup"
        aria-label="Theme selection"
      >
        {themes.map(({ value, label, icon: Icon }) => {
          const isSelected = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setTheme(value)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-[color,background-color,box-shadow] duration-200",
                isSelected
                  ? "bg-accent-primary text-text-inverse shadow-sm"
                  : "text-text-secondary hover:text-text-primary hover:bg-background-hover"
              )}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Helper text */}
      <p className="text-text-tertiary text-sm">
        {theme === "system"
          ? "Follows your device's dark mode setting"
          : theme === "dark"
            ? "Always use dark mode"
            : "Always use light mode"}
      </p>
    </div>
  );
}
