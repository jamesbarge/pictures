/**
 * Postboxd Unified Header
 * Single filter bar with date, film search, and cinema selection
 * Uses design system primitives for consistent styling
 */

"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import Link from "next/link";
import {
  Calendar,
  Search,
  MapPin,
  ChevronDown,
  X,
  Settings,
  Check,
  Heart,
} from "lucide-react";
import { format, addDays, startOfToday, isSameDay, startOfMonth, endOfMonth } from "date-fns";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/cn";
import { useFilters, TIME_PRESETS, formatTimeRange, formatHour } from "@/stores/filters";
import { Button, IconButton } from "@/components/ui";
import { Clock } from "lucide-react";

interface Cinema {
  id: string;
  name: string;
  shortName: string | null;
}

interface HeaderProps {
  cinemas: Cinema[];
}

export function Header({ cinemas }: HeaderProps) {
  const mounted = useHydrated();

  return (
    <header className="sticky top-0 z-50 bg-background-primary border-b border-border-subtle shadow-sm">
      {/* Top Bar - Logo and Settings */}
      <div className="border-b border-border-subtle">
        <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="group">
            <span className="font-display text-2xl text-text-primary tracking-tight hover:text-accent-primary transition-colors">
              Postboxd
            </span>
          </Link>

          {/* Navigation Icons */}
          <div className="flex items-center gap-1">
            <Link href="/watchlist">
              <IconButton
                variant="ghost"
                size="sm"
                icon={<Heart className="w-5 h-5" />}
                label="Watchlist"
              />
            </Link>
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
      </div>

      {/* Filter Bar */}
      <div className="px-4 sm:px-6 lg:px-8 py-3">
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

// Date & Time Filter Component
function DateFilter({ mounted }: { mounted: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTimeCustom, setShowTimeCustom] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { dateFrom, dateTo, setDateRange, timeFrom, timeTo, setTimeRange } = useFilters();

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

  const displayText = useMemo(() => {
    if (!mounted) return "When";

    const datePart = (() => {
      if (!dateFrom && !dateTo) return null;
      if (dateFrom && dateTo && isSameDay(dateFrom, dateTo)) {
        return format(dateFrom, "EEE d MMM");
      }
      if (dateFrom && dateTo) {
        return `${format(dateFrom, "d MMM")} - ${format(dateTo, "d MMM")}`;
      }
      return null;
    })();

    const timePart = timeFrom !== null || timeTo !== null
      ? formatTimeRange(timeFrom, timeTo)
      : null;

    if (!datePart && !timePart) return "When";
    if (datePart && timePart) return `${datePart}, ${timePart}`;
    return datePart || timePart || "When";
  }, [mounted, dateFrom, dateTo, timeFrom, timeTo]);

  const hasFilter = mounted && (dateFrom || dateTo || timeFrom !== null || timeTo !== null);

  const handleDaySelect = (day: Date | undefined) => {
    if (day) {
      setDateRange(day, day);
    }
  };

  const handleTimePreset = (preset: typeof TIME_PRESETS[number] | null) => {
    if (preset === null) {
      setTimeRange(null, null);
    } else {
      setTimeRange(preset.from, preset.to);
    }
    setShowTimeCustom(false);
  };

  const isTimePresetActive = (preset: typeof TIME_PRESETS[number]) => {
    return timeFrom === preset.from && timeTo === preset.to;
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all min-w-[140px]",
          hasFilter
            ? "bg-accent-primary/10 border-accent-primary/30 text-accent-primary"
            : "bg-background-secondary border-border-default text-text-secondary hover:border-border-emphasis hover:text-text-primary"
        )}
      >
        <Calendar className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate">{displayText}</span>
        <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 sm:left-0 right-0 sm:right-auto mt-2 z-50 w-[calc(100vw-2rem)] sm:w-auto bg-background-secondary border border-border-default rounded-xl shadow-elevated overflow-hidden">
          {/* Date Section */}
          <div className="p-3 border-b border-border-subtle">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-text-tertiary" />
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">Date</span>
            </div>

            {/* Quick Date Options */}
            <div className="flex flex-wrap gap-1 mb-3">
              <button
                onClick={() => setDateRange(null, null)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  !dateFrom && !dateTo
                    ? "bg-accent-primary text-text-inverse"
                    : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
                )}
              >
                Any Date
              </button>
              <button
                onClick={() => setDateRange(today, today)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  dateFrom && isSameDay(dateFrom, today) && dateTo && isSameDay(dateTo, today)
                    ? "bg-accent-primary text-text-inverse"
                    : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
                )}
              >
                Today
              </button>
              <button
                onClick={() => {
                  const weekend = getNextWeekend();
                  setDateRange(weekend, addDays(weekend, 1));
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
                )}
              >
                Weekend
              </button>
              <button
                onClick={() => setDateRange(today, addDays(today, 6))}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
                )}
              >
                7 Days
              </button>
            </div>

            {/* Calendar */}
            <DayPicker
              mode="single"
              selected={dateFrom || undefined}
              onSelect={handleDaySelect}
              defaultMonth={dateFrom || today}
              disabled={{ before: today }}
              showOutsideDays
              classNames={{
                root: "text-text-primary w-[280px]",
                months: "flex flex-col",
                month: "space-y-2",
                month_caption: "flex justify-center relative items-center h-8 mb-2",
                caption_label: "text-sm font-medium text-text-primary",
                nav: "flex items-center gap-1 absolute inset-x-0 justify-between",
                button_previous: "p-1.5 rounded-lg hover:bg-background-active text-text-secondary hover:text-text-primary transition-colors",
                button_next: "p-1.5 rounded-lg hover:bg-background-active text-text-secondary hover:text-text-primary transition-colors",
                month_grid: "w-full",
                weekdays: "grid grid-cols-7 gap-1 mb-1",
                weekday: "text-text-tertiary text-xs font-medium h-8 flex items-center justify-center",
                week: "grid grid-cols-7 gap-1",
                day: "h-9 p-0",
                day_button: "w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-colors hover:bg-background-active text-text-secondary hover:text-text-primary",
                selected: "[&>button]:!bg-accent-primary [&>button]:!text-text-inverse [&>button]:hover:!bg-accent-primary [&>button]:font-medium",
                today: "[&>button]:ring-1 [&>button]:ring-accent-primary/50 [&>button]:text-accent-primary [&>button]:font-medium",
                outside: "[&>button]:text-text-muted [&>button]:opacity-50",
                disabled: "[&>button]:text-text-muted [&>button]:opacity-30 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent",
              }}
            />
          </div>

          {/* Time Section */}
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-text-tertiary" />
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">Time</span>
            </div>

            {/* Time Presets */}
            <div className="flex flex-wrap gap-1 mb-2">
              <button
                onClick={() => handleTimePreset(null)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  timeFrom === null && timeTo === null
                    ? "bg-accent-primary text-text-inverse"
                    : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
                )}
              >
                Any Time
              </button>
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handleTimePreset(preset)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                    isTimePresetActive(preset)
                      ? "bg-accent-primary text-text-inverse"
                      : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
                  )}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Time Toggle */}
            <button
              onClick={() => setShowTimeCustom(!showTimeCustom)}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {showTimeCustom ? "Hide custom" : "Custom time range..."}
            </button>

            {/* Custom Time Inputs */}
            {showTimeCustom && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-text-tertiary mb-1">From</label>
                  <select
                    value={timeFrom ?? ""}
                    onChange={(e) => setTimeRange(
                      e.target.value === "" ? null : Number(e.target.value),
                      timeTo
                    )}
                    className="w-full px-2 py-1.5 rounded-lg bg-background-tertiary border border-border-default text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                  >
                    <option value="">Any</option>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{formatHour(i)}</option>
                    ))}
                  </select>
                </div>
                <span className="text-text-tertiary mt-5">–</span>
                <div className="flex-1">
                  <label className="block text-xs text-text-tertiary mb-1">To</label>
                  <select
                    value={timeTo ?? ""}
                    onChange={(e) => setTimeRange(
                      timeFrom,
                      e.target.value === "" ? null : Number(e.target.value)
                    )}
                    className="w-full px-2 py-1.5 rounded-lg bg-background-tertiary border border-border-default text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                  >
                    <option value="">Any</option>
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{formatHour(i)}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Done Button */}
          {hasFilter && (
            <div className="p-2 border-t border-border-subtle">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-accent-primary text-text-inverse hover:bg-accent-primary-hover transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Film Search Filter Component
interface FilmSuggestion {
  id: string;
  title: string;
  year: number | null;
  directors: string[];
  posterUrl: string | null;
}

function FilmSearchFilter({ mounted }: { mounted: boolean }) {
  const { filmSearch, setFilmSearch } = useFilters();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<FilmSuggestion[]>([]);
  const [allFilms, setAllFilms] = useState<FilmSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Fetch all films once for browse mode
  useEffect(() => {
    async function fetchAllFilms() {
      try {
        const res = await fetch("/api/films/search?browse=true");
        const data = await res.json();
        setAllFilms(data.results || []);
      } catch {
        setAllFilms([]);
      }
    }
    fetchAllFilms();
  }, []);

  // Fetch suggestions with debounce when searching
  useEffect(() => {
    // If no search term, don't fetch (we'll use allFilms for browsing)
    if (!filmSearch.trim()) {
      setSuggestions([]);
      return;
    }

    if (filmSearch.length < 2) {
      setSuggestions([]);
      return;
    }

    const debounceTimer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/films/search?q=${encodeURIComponent(filmSearch)}`);
        const data = await res.json();
        setSuggestions(data.results || []);
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(debounceTimer);
  }, [filmSearch]);

  // Get display list: search results if searching, all films if browsing
  const displayList = filmSearch.trim() ? suggestions : allFilms;

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }

      if (document.activeElement === inputRef.current) {
        if (e.key === "Escape") {
          setFilmSearch("");
          setSuggestions([]);
          inputRef.current?.blur();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, displayList.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, -1));
        } else if (e.key === "Enter" && selectedIndex >= 0 && displayList[selectedIndex]) {
          e.preventDefault();
          handleSelectFilm(displayList[selectedIndex]);
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setFilmSearch, displayList, selectedIndex]);

  // Reset selection when display list changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [displayList]);

  const handleSelectFilm = (film: FilmSuggestion) => {
    setFilmSearch(film.title);
    setSuggestions([]);
    setIsFocused(false);
    inputRef.current?.blur();
  };

  const hasValue = mounted && filmSearch.trim();
  const showShortcutHint = !isFocused && !hasValue;
  const showDropdown = isFocused && (displayList.length > 0 || isLoading);

  return (
    <div ref={containerRef} className="relative flex-1 max-w-xs">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none z-10" />
      <input
        ref={inputRef}
        type="text"
        value={mounted ? filmSearch : ""}
        onChange={(e) => setFilmSearch(e.target.value)}
        onFocus={() => setIsFocused(true)}
        placeholder="Search films..."
        aria-label="Search films"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        autoComplete="off"
        className={cn(
          "w-full pl-9 py-2 rounded-lg border bg-background-secondary text-sm text-text-primary placeholder:text-text-tertiary",
          "transition-all duration-150",
          "focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary",
          hasValue
            ? "border-accent-primary/40 pr-8"
            : "border-border-default hover:border-border-emphasis pr-16"
        )}
      />
      {/* Keyboard shortcut hint */}
      {showShortcutHint && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <kbd className="hidden sm:inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[11px] font-mono text-text-muted bg-background-tertiary rounded border border-border-subtle leading-none">
            <span>⌘</span><span>K</span>
          </kbd>
        </div>
      )}
      {/* Clear button */}
      {hasValue && (
        <button
          onClick={() => {
            setFilmSearch("");
            setSuggestions([]);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-surface-overlay-hover text-text-tertiary hover:text-text-primary transition-colors z-10"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Films Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-background-secondary border border-border-default rounded-xl shadow-elevated overflow-hidden">
          {/* Header showing count */}
          {!filmSearch.trim() && displayList.length > 0 && (
            <div className="px-3 py-2 border-b border-border-subtle text-xs text-text-tertiary">
              {displayList.length} films • scroll to browse
            </div>
          )}
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-text-tertiary">Searching...</div>
          ) : (
            <ul role="listbox" className="max-h-96 overflow-y-auto">
              {displayList.map((film, index) => (
                <li key={film.id} role="option" aria-selected={index === selectedIndex}>
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectFilm(film);
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                      index === selectedIndex
                        ? "bg-accent-primary/10 text-text-primary"
                        : "text-text-secondary hover:bg-background-hover"
                    )}
                  >
                    {/* Mini Poster */}
                    <div className="w-8 h-12 rounded overflow-hidden bg-background-tertiary shrink-0">
                      {film.posterUrl && !film.posterUrl.includes('poster-placeholder') ? (
                        <img
                          src={film.posterUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-text-tertiary">
                          <Search className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                    {/* Film Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {film.title}
                        {film.year && (
                          <span className="text-text-tertiary font-normal ml-1">
                            ({film.year})
                          </span>
                        )}
                      </div>
                      {film.directors.length > 0 && (
                        <div className="text-xs text-text-tertiary truncate">
                          {film.directors.slice(0, 2).join(", ")}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
            ? "bg-accent-primary/10 border-accent-primary/30 text-accent-primary"
            : "bg-background-secondary border-border-default text-text-secondary hover:border-border-emphasis hover:text-text-primary"
        )}
      >
        <MapPin className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate">{displayText}</span>
        <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 sm:left-0 sm:right-auto mt-2 z-50 w-[calc(100vw-2rem)] sm:w-72 max-w-72 bg-background-secondary border border-border-default rounded-xl shadow-elevated overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-border-subtle">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search cinemas..."
                className="w-full pl-9 pr-3 py-2 bg-background-tertiary rounded-lg text-sm text-text-primary placeholder:text-text-tertiary border border-border-subtle focus:outline-none focus:border-border-emphasis"
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
                  ? "bg-accent-primary/10 text-accent-primary"
                  : "text-text-secondary hover:bg-background-hover hover:text-text-primary"
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                  cinemaIds.length === 0 ? "bg-accent-primary border-accent-primary" : "border-border-default"
                )}
              >
                {cinemaIds.length === 0 && <Check className="w-3 h-3 text-text-inverse" />}
              </div>
              All Cinemas
            </button>

            {/* Divider */}
            <div className="h-px bg-border-subtle my-2" />

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
                    {isSelected && <Check className="w-3 h-3 text-text-inverse" />}
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
            <div className="border-t border-border-subtle p-2">
              <button
                onClick={() => {
                  setCinemas([]);
                  setSearchTerm("");
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
