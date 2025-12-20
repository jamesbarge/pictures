/**
 * Postboxd Unified Header
 * Single filter bar with date, film search, and cinema selection
 * Uses design system primitives for consistent styling
 */

"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Calendar,
  Search,
  MapPin,
  ChevronDown,
  X,
  Settings,
  Check,
} from "lucide-react";
import { format, addDays, startOfToday, isSameDay } from "date-fns";
import { cn } from "@/lib/cn";
import { useFilters } from "@/stores/filters";
import { Button, IconButton } from "@/components/ui";

interface Cinema {
  id: string;
  name: string;
  shortName: string | null;
}

interface HeaderProps {
  cinemas: Cinema[];
}

export function Header({ cinemas }: HeaderProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-background-primary border-b border-white/[0.06]">
      {/* Top Bar - Logo and Settings */}
      <div className="border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="group">
            <span className="font-display text-xl text-text-primary tracking-tight hover:text-accent-gold transition-colors">
              Postboxd
            </span>
          </Link>

          {/* Settings */}
          <Link href="/settings">
            <IconButton
              variant="ghost"
              size="sm"
              icon={<Settings className="w-5 h-5" />}
              label="Settings"
            />
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Date Picker */}
          <DateFilter mounted={mounted} />

          {/* Film Search */}
          <FilmSearchFilter mounted={mounted} />

          {/* Cinema Filter */}
          <CinemaFilter cinemas={cinemas} mounted={mounted} />

          {/* Clear All */}
          {mounted && <ClearFiltersButton />}
        </div>
      </div>
    </header>
  );
}

// Date Filter Component
function DateFilter({ mounted }: { mounted: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { dateFrom, dateTo, setDateRange } = useFilters();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const today = startOfToday();
  const quickOptions = [
    { label: "Today", from: today, to: today },
    { label: "This Weekend", from: getNextWeekend(), to: addDays(getNextWeekend(), 1) },
    { label: "Next 7 Days", from: today, to: addDays(today, 6) },
    { label: "Next 30 Days", from: today, to: addDays(today, 29) },
  ];

  const displayText = useMemo(() => {
    if (!mounted) return "Any Date";
    if (!dateFrom && !dateTo) return "Any Date";
    if (dateFrom && dateTo && isSameDay(dateFrom, dateTo)) {
      return format(dateFrom, "d MMM");
    }
    if (dateFrom && dateTo) {
      return `${format(dateFrom, "d MMM")} - ${format(dateTo, "d MMM")}`;
    }
    return "Any Date";
  }, [mounted, dateFrom, dateTo]);

  const hasDateFilter = mounted && (dateFrom || dateTo);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all min-w-[140px]",
          hasDateFilter
            ? "bg-accent-gold/10 border-accent-gold/30 text-accent-gold"
            : "bg-background-secondary border-white/10 text-text-secondary hover:border-white/20 hover:text-text-primary"
        )}
      >
        <Calendar className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate">{displayText}</span>
        <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 w-64 bg-background-secondary border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2">
            <button
              onClick={() => {
                setDateRange(null, null);
                setIsOpen(false);
              }}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                !dateFrom && !dateTo
                  ? "bg-accent-gold/10 text-accent-gold"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
              )}
            >
              Any Date
            </button>
            {quickOptions.map((option) => {
              const isSelected = dateFrom && dateTo &&
                isSameDay(dateFrom, option.from) &&
                isSameDay(dateTo, option.to);
              return (
                <button
                  key={option.label}
                  onClick={() => {
                    setDateRange(option.from, option.to);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                    isSelected
                      ? "bg-accent-gold/10 text-accent-gold"
                      : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Film Search Filter Component
function FilmSearchFilter({ mounted }: { mounted: boolean }) {
  const { filmSearch, setFilmSearch } = useFilters();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      // Escape to clear and blur
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        setFilmSearch("");
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setFilmSearch]);

  const hasValue = mounted && filmSearch.trim();
  const showShortcutHint = !isFocused && !hasValue;

  return (
    <div className="relative flex-1 max-w-xs">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={mounted ? filmSearch : ""}
        onChange={(e) => setFilmSearch(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="Search films..."
        aria-label="Search films"
        className={cn(
          "w-full pl-9 py-2 rounded-lg border bg-background-secondary text-sm text-text-primary placeholder:text-text-tertiary",
          "transition-all duration-150",
          "focus:outline-none focus:ring-2 focus:ring-accent-gold/50 focus:border-accent-gold/50",
          hasValue
            ? "border-accent-gold/40 pr-8"
            : "border-border-default hover:border-border-emphasis pr-16"
        )}
      />
      {/* Keyboard shortcut hint */}
      {showShortcutHint && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-text-muted bg-background-tertiary rounded border border-border-subtle">
            <span className="text-[9px]">⌘</span>K
          </kbd>
        </div>
      )}
      {/* Clear button */}
      {hasValue && (
        <button
          onClick={() => setFilmSearch("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-surface-overlay-hover text-text-tertiary hover:text-text-primary transition-colors"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// Cinema Filter Component
function CinemaFilter({ cinemas, mounted }: { cinemas: Cinema[]; mounted: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { cinemaIds, toggleCinema, setCinemas } = useFilters();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const filteredCinemas = useMemo(() => {
    if (!searchTerm.trim()) return cinemas;
    const term = searchTerm.toLowerCase();
    return cinemas.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.shortName?.toLowerCase().includes(term)
    );
  }, [cinemas, searchTerm]);

  const displayText = useMemo(() => {
    if (!mounted || cinemaIds.length === 0) return "All Cinemas";
    if (cinemaIds.length === 1) {
      const cinema = cinemas.find((c) => c.id === cinemaIds[0]);
      return cinema?.shortName || cinema?.name || "1 Cinema";
    }
    return `${cinemaIds.length} Cinemas`;
  }, [mounted, cinemaIds, cinemas]);

  const hasSelection = mounted && cinemaIds.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all min-w-[140px]",
          hasSelection
            ? "bg-accent-gold/10 border-accent-gold/30 text-accent-gold"
            : "bg-background-secondary border-white/10 text-text-secondary hover:border-white/20 hover:text-text-primary"
        )}
      >
        <MapPin className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate">{displayText}</span>
        <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 w-72 bg-background-secondary border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search cinemas..."
                className="w-full pl-9 pr-3 py-2 bg-background-tertiary rounded-lg text-sm text-text-primary placeholder:text-text-tertiary border border-white/5 focus:outline-none focus:border-white/20"
              />
            </div>
          </div>

          {/* Cinema List */}
          <div className="max-h-64 overflow-y-auto p-2">
            {/* All Cinemas option */}
            <button
              onClick={() => {
                setCinemas([]);
                setIsOpen(false);
                setSearchTerm("");
              }}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                cinemaIds.length === 0
                  ? "bg-accent-gold/10 text-accent-gold"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                  cinemaIds.length === 0 ? "bg-accent-gold border-accent-gold" : "border-white/20"
                )}
              >
                {cinemaIds.length === 0 && <Check className="w-3 h-3 text-background-primary" />}
              </div>
              All Cinemas
            </button>

            {/* Divider */}
            <div className="h-px bg-white/5 my-2" />

            {/* Individual Cinemas */}
            {filteredCinemas.map((cinema) => {
              const isSelected = cinemaIds.includes(cinema.id);
              return (
                <button
                  key={cinema.id}
                  onClick={() => toggleCinema(cinema.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                    isSelected
                      ? "bg-accent-gold/10 text-accent-gold"
                      : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                      isSelected ? "bg-accent-gold border-accent-gold" : "border-white/20"
                    )}
                  >
                    {isSelected && <Check className="w-3 h-3 text-background-primary" />}
                  </div>
                  <span className="truncate">{cinema.name}</span>
                </button>
              );
            })}

            {filteredCinemas.length === 0 && (
              <p className="px-3 py-4 text-sm text-text-tertiary text-center">
                No cinemas found
              </p>
            )}
          </div>

          {/* Clear Selection */}
          {cinemaIds.length > 0 && (
            <div className="border-t border-white/5 p-2">
              <button
                onClick={() => {
                  setCinemas([]);
                  setSearchTerm("");
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-text-tertiary hover:bg-white/5 hover:text-text-primary transition-colors"
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

// Clear All Filters Button
function ClearFiltersButton() {
  const { getActiveFilterCount, clearAllFilters } = useFilters();
  const count = getActiveFilterCount();

  if (count === 0) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={clearAllFilters}
      leftIcon={<X className="w-4 h-4" />}
    >
      Clear ({count})
    </Button>
  );
}

// Helper function to get next weekend
function getNextWeekend(): Date {
  const today = startOfToday();
  const dayOfWeek = today.getDay();
  // Saturday = 6, Sunday = 0
  const daysUntilSaturday = dayOfWeek === 0 ? 6 : dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
  return addDays(today, daysUntilSaturday);
}
