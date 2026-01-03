/**
 * Theme Provider
 * Manages dark/light mode based on user preference or system setting.
 * Applies .dark class to html element and handles keyboard shortcuts.
 */

"use client";

import { useEffect, useLayoutEffect, useCallback, createContext, useContext } from "react";
import { usePreferences } from "@/stores/preferences";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Hook to access theme state and actions
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/**
 * Resolves the actual theme to apply based on preference and system setting
 */
function getResolvedTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    // Check system preference (only on client)
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "light"; // SSR fallback
  }
  return theme;
}

/**
 * Apply theme class to document
 */
function applyThemeToDOM(resolvedTheme: ResolvedTheme) {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const theme = usePreferences((state) => state.theme);
  const setThemePreference = usePreferences((state) => state.setTheme);

  const resolvedTheme = getResolvedTheme(theme);

  // Apply theme class synchronously to avoid flash
  useLayoutEffect(() => {
    applyThemeToDOM(resolvedTheme);
  }, [resolvedTheme]);

  // Toggle between light and dark (overrides to explicit, not system)
  const toggleTheme = useCallback(() => {
    const currentResolved = getResolvedTheme(theme);
    const newTheme = currentResolved === "dark" ? "light" : "dark";
    setThemePreference(newTheme);
  }, [theme, setThemePreference]);

  // Keyboard shortcut: Cmd/Ctrl + \
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleTheme();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleTheme]);

  const contextValue: ThemeContextValue = {
    theme,
    resolvedTheme,
    setTheme: setThemePreference,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}
