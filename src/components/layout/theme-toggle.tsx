/**
 * Theme Toggle Button
 * Animated sun/moon toggle for the header.
 * Uses CSS animations for smooth, premium-feeling transitions.
 */

"use client";

import { useTheme } from "@/components/theme-provider";
import { useHydrated } from "@/hooks/useHydrated";
import { cn } from "@/lib/cn";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const mounted = useHydrated();

  const isDark = resolvedTheme === "dark";

  // Show placeholder before hydration to prevent flash
  if (!mounted) {
    return (
      <div className={cn(
        "w-8 h-8 rounded-lg bg-background-tertiary animate-pulse",
        className
      )} />
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "relative w-8 h-8 flex items-center justify-center rounded-lg",
        "text-text-secondary hover:text-text-primary",
        "hover:bg-background-hover active:bg-background-active",
        "transition-colors duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background-primary",
        className
      )}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode (⌘\\)" : "Switch to dark mode (⌘\\)"}
    >
      <div className="relative w-5 h-5">
        {/* Sun */}
        <svg
          className={cn(
            "absolute inset-0 w-5 h-5 transition-all duration-300 ease-out",
            isDark
              ? "opacity-0 rotate-90 scale-50"
              : "opacity-100 rotate-0 scale-100"
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Sun circle */}
          <circle cx="12" cy="12" r="4" />
          {/* Sun rays - animated by parent transform */}
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="M4.93 4.93l1.41 1.41" />
          <path d="M17.66 17.66l1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="M6.34 17.66l-1.41 1.41" />
          <path d="M19.07 4.93l-1.41 1.41" />
        </svg>

        {/* Moon */}
        <svg
          className={cn(
            "absolute inset-0 w-5 h-5 transition-all duration-300 ease-out",
            isDark
              ? "opacity-100 rotate-0 scale-100"
              : "opacity-0 -rotate-90 scale-50"
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </div>
    </button>
  );
}
