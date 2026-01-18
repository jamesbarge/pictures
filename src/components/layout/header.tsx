/**
 * Pictures Unified Header
 * Single filter bar with date, film search, and cinema selection
 * Uses design system primitives for consistent styling
 */

"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Search,
  MapPin,
  ChevronDown,
  X,
  Check,
  Film,
  Sparkles,
  History,
  SlidersHorizontal,
  Share2,
  CheckCircle,
  Image,
  List,
} from "lucide-react";
import { HeaderNavButtons } from "@/components/layout/header-nav-buttons";
import { format, addDays, startOfToday, isSameDay, isSaturday, isSunday, differenceInDays } from "date-fns";
import { MobileDatePickerModal } from "@/components/filters/mobile-date-picker-modal";
import { MobileCinemaPickerModal } from "@/components/filters/mobile-cinema-picker-modal";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/cn";
import { useFilters, TIME_PRESETS, FORMAT_OPTIONS, formatTimeRange, formatHour } from "@/stores/filters";
import { usePreferences } from "@/stores/preferences";
import { Button } from "@/components/ui";
import { Clock } from "lucide-react";
import { useUrlFilters } from "@/hooks/useUrlFilters";

interface Cinema {
  id: string;
  name: string;
  shortName: string | null;
  chain: string | null;
}

interface Festival {
  id: string;
  name: string;
  slug: string;
}

interface Season {
  id: string;
  name: string;
  slug: string;
  directorName: string | null;
}

interface HeaderProps {
  cinemas: Cinema[];
  festivals: Festival[];
  seasons: Season[];
  availableFormats: string[];
}

export function Header({ cinemas, festivals, seasons, availableFormats }: HeaderProps) {
  const mounted = useHydrated();
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background-primary border-b border-border-subtle shadow-sm">
      {/* Top Bar - Logo and Settings */}
      <div className="border-b border-border-subtle">
        <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="group flex items-center gap-2">
            <span className="font-display text-2xl text-text-primary tracking-tight group-hover:text-accent-primary transition-colors">
              Pictures
            </span>
            <span className="text-text-muted/40 text-lg font-light">|</span>
            <span className="text-sm text-text-tertiary font-normal hidden sm:inline">
              London Cinema Listings
            </span>
          </Link>

          {/* Navigation Icons */}
          <HeaderNavButtons mounted={mounted} />
        </div>
      </div>

      {/* Mobile Filter Bar - Search + Filters Button */}
      <div className="sm:hidden px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Search - Always visible on mobile */}
          <div className="flex-1">
            <FilmSearchFilter mounted={mounted} />
          </div>

          {/* Filters Toggle Button */}
          <MobileFiltersButton
            isOpen={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
            mounted={mounted}
          />
        </div>

        {/* Active Filter Chips - always render container to prevent CLS */}
        <ActiveFilterChips cinemas={cinemas} seasons={seasons} mounted={mounted} />

        {/* Collapsible Filter Panel */}
        {filtersOpen && (
          <div className="mt-3 p-4 bg-background-secondary rounded-xl border border-border-subtle divide-y divide-border-subtle">
            {/* Film Type */}
            <div className="pb-4">
              <label className="block text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                Film Type
              </label>
              <FilmTypeFilter mounted={mounted} fullWidth />
            </div>

            {/* Date & Time */}
            <div className="py-4">
              <label className="block text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                When
              </label>
              <DateFilter mounted={mounted} fullWidth />
            </div>

            {/* Cinema */}
            <div className="py-4">
              <label className="block text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                Cinema
              </label>
              <CinemaFilter cinemas={cinemas} mounted={mounted} fullWidth />
            </div>

            {/* Format - only show if formats are available */}
            {availableFormats.length > 0 && (
              <div className="py-4">
                <label className="block text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                  Projection Format
                </label>
                <FormatFilter mounted={mounted} availableFormats={availableFormats} fullWidth />
              </div>
            )}

            {/* View Mode */}
            <div className="py-4">
              <label className="block text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                View
              </label>
              <ViewModeToggle mounted={mounted} fullWidth />
            </div>

            {/* Actions */}
            <div className="pt-4 flex gap-2">
              {mounted && <ShareFiltersButton fullWidth />}
              {mounted && <ClearFiltersButton fullWidth />}
            </div>
          </div>
        )}
      </div>

      {/* Desktop Filter Bar - All filters visible */}
      <div className="hidden sm:block px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center gap-3">
          {/* Film Type Filter */}
          <FilmTypeFilter mounted={mounted} />

          {/* Date Picker */}
          <DateFilter mounted={mounted} />

          {/* Film Search */}
          <FilmSearchFilter mounted={mounted} />

          {/* Cinema Filter */}
          <CinemaFilter cinemas={cinemas} mounted={mounted} />

          {/* Format Filter */}
          <FormatFilter mounted={mounted} availableFormats={availableFormats} />

          {/* View Mode Toggle */}
          <ViewModeToggle mounted={mounted} />

          {/* Share & Clear */}
          {mounted && <ShareFiltersButton />}
          {mounted && <ClearFiltersButton />}
        </div>
      </div>
    </header>
  );
}

// Mobile Filters Button with active count indicator
function MobileFiltersButton({
  isOpen,
  onClick,
  mounted
}: {
  isOpen: boolean;
  onClick: () => void;
  mounted: boolean;
}) {
  const filters = useFilters();

  // Access state properties directly to create Zustand subscriptions
  // (calling getActiveFilterCount() alone doesn't trigger re-renders)
  const count = mounted
    ? (filters.filmSearch.trim() ? 1 : 0) +
      (filters.cinemaIds.length > 0 ? 1 : 0) +
      (filters.dateFrom || filters.dateTo ? 1 : 0) +
      (filters.timeFrom !== null || filters.timeTo !== null ? 1 : 0) +
      filters.formats.length +
      filters.programmingTypes.length +
      filters.decades.length +
      filters.genres.length +
      filters.timesOfDay.length +
      (filters.festivalSlug ? 1 : 0) +
      (filters.festivalOnly ? 1 : 0) +
      (filters.seasonSlug ? 1 : 0) +
      (filters.hideSeen ? 1 : 0) +
      (filters.onlySingleShowings ? 1 : 0)
      // Note: hideNotInterested is NOT counted - it's the default behavior
    : 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
        isOpen || count > 0
          ? "bg-accent-primary/10 border-accent-primary/30 text-accent-primary"
          : "bg-background-secondary border-border-default text-text-secondary"
      )}
    >
      <SlidersHorizontal className="w-4 h-4" />
      <span>Filters</span>
      {count > 0 && (
        <span className="bg-accent-primary text-text-inverse text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
          {count}
        </span>
      )}
      <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
    </button>
  );
}

// Active Filter Chips - Shows what's currently filtered
// Always renders container to prevent CLS, content only after hydration
function ActiveFilterChips({ cinemas, seasons, mounted }: { cinemas: Cinema[]; seasons: Season[]; mounted: boolean }) {
  const filters = useFilters();

  // Only compute chips after hydration (localStorage not available during SSR)
  const chips: { label: string; onRemove: () => void }[] = [];

  if (mounted) {
    // Film type chip
    if (filters.programmingTypes.length > 0) {
      const type = filters.programmingTypes[0];
      const label = type === "repertory" ? "Repertory" : type === "new_release" ? "New Releases" : type;
      chips.push({
        label,
        onRemove: () => filters.setProgrammingTypes([]),
      });
    }

    // Date chip
    if (filters.dateFrom || filters.dateTo) {
      let label = "Date set";
      if (filters.dateFrom && filters.dateTo && isSameDay(filters.dateFrom, filters.dateTo)) {
        label = format(filters.dateFrom, "EEE d MMM");
      } else if (filters.dateFrom && filters.dateTo) {
        label = `${format(filters.dateFrom, "d MMM")} - ${format(filters.dateTo, "d MMM")}`;
      }
      chips.push({
        label,
        onRemove: () => filters.setDateRange(null, null),
      });
    }

    // Time chip
    if (filters.timeFrom !== null || filters.timeTo !== null) {
      chips.push({
        label: formatTimeRange(filters.timeFrom, filters.timeTo),
        onRemove: () => filters.setTimeRange(null, null),
      });
    }

    // Cinema chip (single chip for all selected cinemas)
    if (filters.cinemaIds.length > 0) {
      const count = filters.cinemaIds.length;
      chips.push({
        label: count === 1
          ? cinemas.find(c => c.id === filters.cinemaIds[0])?.shortName || "1 Cinema"
          : `${count} Cinemas`,
        onRemove: () => filters.setCinemas([]),
      });
    }

    // Format chips (show each selected format)
    if (filters.formats.length > 0) {
      const formatLabels = filters.formats
        .map(f => FORMAT_OPTIONS.find(opt => opt.value === f)?.label || f)
        .join(", ");
      chips.push({
        label: filters.formats.length === 1 ? formatLabels : `${filters.formats.length} Formats`,
        onRemove: () => filters.formats.forEach(f => filters.toggleFormat(f)),
      });
    }

    // Season chip
    if (filters.seasonSlug) {
      const season = seasons.find(s => s.slug === filters.seasonSlug);
      chips.push({
        label: season?.directorName || season?.name || "Season",
        onRemove: () => filters.clearSeasonFilter(),
      });
    }
  }

  // Always render container with min-height to prevent CLS
  // Height matches one row of chips (28px) + margin (8px)
  if (chips.length === 0) {
    return null; // No chips = no space needed
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2 min-h-[28px]">
      {chips.map((chip, i) => (
        <button
          key={i}
          onClick={chip.onRemove}
          aria-label={`Remove ${chip.label} filter`}
          className="flex items-center gap-1 px-2 py-1 bg-accent-primary/10 text-accent-primary text-xs font-medium rounded-full hover:bg-accent-primary/20 transition-colors"
        >
          <span>{chip.label}</span>
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

// Film Type Filter Component - All / New Releases / Repertory
function FilmTypeFilter({ mounted, fullWidth }: { mounted: boolean; fullWidth?: boolean }) {
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

// Date & Time Filter Component
function DateFilter({ mounted }: { mounted: boolean; fullWidth?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTimeCustom, setShowTimeCustom] = useState(false);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { dateFrom, dateTo, setDateRange, timeFrom, timeTo, setTimeRange } = useFilters();

  // Check if Weekend preset is active
  const isWeekendActive = () => {
    if (!dateFrom || !dateTo) return false;
    return isSaturday(dateFrom) && isSunday(dateTo) && differenceInDays(dateTo, dateFrom) === 1;
  };

  // Check if 7 Days preset is active
  const is7DaysActive = () => {
    const today = startOfToday();
    if (!dateFrom || !dateTo) return false;
    return isSameDay(dateFrom, today) && differenceInDays(dateTo, dateFrom) === 6;
  };

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

  const handleButtonClick = () => {
    // On mobile (< 640px), open full-screen modal instead of dropdown
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setIsMobileModalOpen(true);
    } else {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleButtonClick}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors min-w-[140px]",
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
        <div className="absolute top-full left-0 mt-2 z-50 w-auto bg-background-secondary border border-border-default rounded-xl shadow-elevated overflow-hidden">
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
                  isWeekendActive()
                    ? "bg-accent-primary text-text-inverse"
                    : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
                )}
              >
                Weekend
              </button>
              <button
                onClick={() => setDateRange(today, addDays(today, 6))}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                  is7DaysActive()
                    ? "bg-accent-primary text-text-inverse"
                    : "bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary"
                )}
              >
                7 Days
              </button>
            </div>

            {/* Calendar */}
            <DayPicker
              mode="single"
              weekStartsOn={1}
              selected={dateFrom || undefined}
              onSelect={handleDaySelect}
              defaultMonth={dateFrom || today}
              disabled={{ before: today }}
              showOutsideDays
              classNames={{
                root: "text-text-primary w-[320px] relative",
                months: "flex flex-col",
                month: "space-y-2",
                month_caption: "flex justify-center items-center h-10",
                caption_label: "text-sm font-medium text-text-primary",
                nav: "absolute top-0 left-0 right-0 h-10 flex items-center justify-between px-2 pointer-events-none",
                button_previous: "pointer-events-auto p-1.5 rounded-md bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary transition-colors",
                button_next: "pointer-events-auto p-1.5 rounded-md bg-background-tertiary text-text-secondary hover:bg-background-active hover:text-text-primary transition-colors",
                month_grid: "w-full",
                weekdays: "grid grid-cols-7 gap-1 mb-1",
                weekday: "text-text-tertiary text-xs font-medium h-10 flex items-center justify-center",
                week: "grid grid-cols-7 gap-1",
                day: "h-10 p-0",
                day_button: "w-10 h-10 rounded-lg flex items-center justify-center text-sm transition-colors hover:bg-background-active text-text-secondary hover:text-text-primary",
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
              className={cn(
                "mt-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                showTimeCustom
                  ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                  : "border-border-default bg-background-secondary text-text-secondary hover:border-border-emphasis hover:text-text-primary"
              )}
            >
              {showTimeCustom ? "Hide custom range" : "Set custom range"}
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

      {/* Mobile Full-Screen Modal */}
      <MobileDatePickerModal
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
      />
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

interface CinemaSuggestion {
  id: string;
  name: string;
  shortName: string | null;
  address: string | null;
}

function FilmSearchFilter({ mounted }: { mounted: boolean }) {
  const { filmSearch, setFilmSearch } = useFilters();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<FilmSuggestion[]>([]);
  const [cinemaSuggestions, setCinemaSuggestions] = useState<CinemaSuggestion[]>([]);
  const [allFilms, setAllFilms] = useState<FilmSuggestion[]>([]);
  const [allCinemas, setAllCinemas] = useState<CinemaSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Fetch all films and cinemas once for browse mode
  useEffect(() => {
    async function fetchBrowseData() {
      try {
        const res = await fetch("/api/films/search?browse=true");
        const data = await res.json();
        setAllFilms(data.results || []);
        setAllCinemas(data.cinemas || []);
      } catch {
        setAllFilms([]);
        setAllCinemas([]);
      }
    }
    fetchBrowseData();
  }, []);

  // Fetch suggestions with debounce when searching
  useEffect(() => {
    // If no search term, don't fetch (we'll use browse data)
    if (!filmSearch.trim()) {
      setSuggestions([]);
      setCinemaSuggestions([]);
      return;
    }

    if (filmSearch.length < 2) {
      setSuggestions([]);
      setCinemaSuggestions([]);
      return;
    }

    const debounceTimer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/films/search?q=${encodeURIComponent(filmSearch)}`);
        const data = await res.json();
        setSuggestions(data.results || []);
        setCinemaSuggestions(data.cinemas || []);
      } catch {
        setSuggestions([]);
        setCinemaSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(debounceTimer);
  }, [filmSearch]);

  // Get display lists: search results if searching, all data if browsing
  const displayFilms = filmSearch.trim() ? suggestions : allFilms;
  const displayCinemas = filmSearch.trim() ? cinemaSuggestions : allCinemas;
  // Combined list for keyboard navigation: films first, then cinemas
  const displayList = [...displayFilms.map(f => ({ type: 'film' as const, item: f })), ...displayCinemas.map(c => ({ type: 'cinema' as const, item: c }))];

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

  const router = useRouter();

  const handleSelectFilm = useCallback((film: FilmSuggestion) => {
    setFilmSearch(film.title);
    setSuggestions([]);
    setCinemaSuggestions([]);
    setIsFocused(false);
    inputRef.current?.blur();
  }, [setFilmSearch]);

  const handleSelectCinema = useCallback((cinema: CinemaSuggestion) => {
    setFilmSearch("");
    setSuggestions([]);
    setCinemaSuggestions([]);
    setIsFocused(false);
    inputRef.current?.blur();
    router.push(`/cinemas/${cinema.id}`);
  }, [setFilmSearch, router]);

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
          setCinemaSuggestions([]);
          inputRef.current?.blur();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, displayList.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, -1));
        } else if (e.key === "Enter" && selectedIndex >= 0 && displayList[selectedIndex]) {
          e.preventDefault();
          const selected = displayList[selectedIndex];
          if (selected.type === 'cinema') {
            handleSelectCinema(selected.item as CinemaSuggestion);
          } else {
            handleSelectFilm(selected.item as FilmSuggestion);
          }
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setFilmSearch, displayList, displayFilms, displayCinemas, selectedIndex, handleSelectFilm, handleSelectCinema]);

  // Reset selection when display lists change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [displayFilms, displayCinemas]);

  const hasValue = mounted && filmSearch.trim();
  const showShortcutHint = !isFocused && !hasValue;
  const showDropdown = isFocused && (displayFilms.length > 0 || displayCinemas.length > 0 || isLoading);

  return (
    <div ref={containerRef} className="relative flex-1 max-w-xs">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none z-10" />
      <input
        ref={inputRef}
        type="text"
        value={mounted ? filmSearch : ""}
        onChange={(e) => setFilmSearch(e.target.value)}
        onFocus={() => setIsFocused(true)}
        placeholder="Search..."
        aria-label="Search films and cinemas"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="film-search-listbox"
        aria-autocomplete="list"
        autoComplete="off"
        className={cn(
          "w-full pl-9 py-2 rounded-lg border bg-background-secondary text-sm text-text-primary placeholder:text-text-tertiary",
          "transition-colors duration-150",
          "focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary",
          hasValue
            ? "border-accent-primary/40 pr-8"
            : "border-border-default hover:border-border-emphasis pr-16"
        )}
      />
      {/* Keyboard shortcut hint - right side, vertically centered */}
      {showShortcutHint && (
        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
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
            setCinemaSuggestions([]);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-surface-overlay-hover text-text-tertiary hover:text-text-primary transition-colors z-10"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Search Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-background-secondary border border-border-default rounded-xl shadow-elevated overflow-hidden">
          {/* Header showing counts in browse mode */}
          {!filmSearch.trim() && (displayCinemas.length > 0 || displayFilms.length > 0) && (
            <div className="px-3 py-2 border-b border-border-subtle text-xs text-text-tertiary">
              {displayFilms.length} films, {displayCinemas.length} cinemas • scroll to browse
            </div>
          )}
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-text-tertiary">Searching...</div>
          ) : (
            <ul id="film-search-listbox" role="listbox" className="max-h-96 overflow-y-auto">
              {/* Film Results - shown first */}
              {displayFilms.length > 0 && (
                <>
                  {filmSearch.trim() && (
                    <li className="px-3 py-1.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider bg-background-tertiary/50">
                      Films
                    </li>
                  )}
                  {displayFilms.map((film, index) => (
                    <li key={`film-${film.id}`} role="option" aria-selected={index === selectedIndex}>
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
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={film.posterUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-text-tertiary">
                              <Film className="w-3 h-3" />
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
                </>
              )}

              {/* Cinema Results - shown after films */}
              {displayCinemas.length > 0 && (
                <>
                  {filmSearch.trim() && (
                    <li className="px-3 py-1.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider bg-background-tertiary/50">
                      Cinemas
                    </li>
                  )}
                  {displayCinemas.map((cinema, index) => {
                    const globalIndex = displayFilms.length + index;
                    const addressText = typeof cinema.address === "string" ? cinema.address : null;
                    return (
                      <li key={`cinema-${cinema.id}`} role="option" aria-selected={globalIndex === selectedIndex}>
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectCinema(cinema);
                          }}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                            globalIndex === selectedIndex
                              ? "bg-accent-primary/10 text-text-primary"
                              : "text-text-secondary hover:bg-background-hover"
                          )}
                        >
                          {/* Cinema Icon */}
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-accent-primary/10 shrink-0 flex items-center justify-center">
                            <MapPin className="w-4 h-4 text-accent-primary" />
                          </div>
                          {/* Cinema Info */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {cinema.name}
                            </div>
                            {addressText && (
                              <div className="text-xs text-text-tertiary truncate">
                                {addressText}
                              </div>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </>
              )}

              {/* Empty state */}
              {displayCinemas.length === 0 && displayFilms.length === 0 && filmSearch.trim() && (
                <li className="px-4 py-6 text-center text-sm text-text-tertiary">
                  No results found
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Cinema Filter Component
function CinemaFilter({ cinemas, mounted }: { cinemas: Cinema[]; mounted: boolean; fullWidth?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
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

  // Filter cinemas by search term - matches if ALL words appear in name, shortName, or chain
  const filteredCinemas = useMemo(() => {
    if (!searchTerm.trim()) return cinemas;
    const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    return cinemas.filter((c) => {
      const searchableText = [
        c.name.toLowerCase(),
        c.shortName?.toLowerCase() || "",
        c.chain?.toLowerCase() || "",
      ].join(" ");
      return searchWords.every((word) => searchableText.includes(word));
    });
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

  const handleButtonClick = () => {
    // On mobile (< 640px), open full-screen modal instead of dropdown
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setIsMobileModalOpen(true);
    } else {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleButtonClick}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors min-w-[140px]",
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

      {/* Mobile Full-Screen Modal */}
      <MobileCinemaPickerModal
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
        cinemas={cinemas}
      />
    </div>
  );
}

// Format Filter Component - 35mm, 70mm, IMAX, etc.
function FormatFilter({ mounted, availableFormats, fullWidth }: { mounted: boolean; availableFormats: string[]; fullWidth?: boolean }) {
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
        <Film className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate">{displayText}</span>
        <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
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
                    {isSelected && <Check className="w-3 h-3 text-text-inverse" />}
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

// Clear All Filters Button
function ClearFiltersButton({ fullWidth }: { fullWidth?: boolean } = {}) {
  const filters = useFilters();
  const { clearMapArea } = usePreferences();

  // Access state properties directly to create Zustand subscriptions
  // (calling getActiveFilterCount() alone doesn't trigger re-renders)
  const count =
    (filters.filmSearch.trim() ? 1 : 0) +
    (filters.cinemaIds.length > 0 ? 1 : 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0) +
    (filters.timeFrom !== null || filters.timeTo !== null ? 1 : 0) +
    filters.formats.length +
    filters.programmingTypes.length +
    filters.decades.length +
    filters.genres.length +
    filters.timesOfDay.length +
    (filters.festivalSlug ? 1 : 0) +
    (filters.festivalOnly ? 1 : 0) +
    (filters.seasonSlug ? 1 : 0) +
    (filters.hideSeen ? 1 : 0) +
    (filters.onlySingleShowings ? 1 : 0);
    // Note: hideNotInterested is NOT counted - it's the default behavior

  if (count === 0) return null;

  const handleClear = () => {
    filters.clearAllFilters();
    clearMapArea(); // Also clear map polygon when clearing all filters
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClear}
      leftIcon={<X className="w-4 h-4" />}
      className={fullWidth ? "w-full justify-center" : undefined}
    >
      Clear ({count})
    </Button>
  );
}

// Share Filters Button - copies shareable URL to clipboard
function ShareFiltersButton({ fullWidth }: { fullWidth?: boolean } = {}) {
  const [copied, setCopied] = useState(false);
  const { copyShareableUrl } = useUrlFilters();
  const filters = useFilters();

  // Calculate filter count (same logic as ClearFiltersButton)
  const count =
    (filters.filmSearch.trim() ? 1 : 0) +
    (filters.cinemaIds.length > 0 ? 1 : 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0) +
    (filters.timeFrom !== null || filters.timeTo !== null ? 1 : 0) +
    filters.formats.length +
    filters.programmingTypes.length +
    filters.decades.length +
    filters.genres.length +
    filters.timesOfDay.length +
    (filters.festivalSlug ? 1 : 0) +
    (filters.festivalOnly ? 1 : 0) +
    (filters.seasonSlug ? 1 : 0) +
    (filters.hideSeen ? 1 : 0) +
    (filters.onlySingleShowings ? 1 : 0);

  // Don't show if no filters are active
  if (count === 0) return null;

  const handleShare = async () => {
    const success = await copyShareableUrl();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleShare}
      leftIcon={copied ? <CheckCircle className="w-4 h-4 text-status-success" /> : <Share2 className="w-4 h-4" />}
      className={cn(
        fullWidth ? "w-full justify-center" : undefined,
        copied && "text-status-success"
      )}
    >
      {copied ? "Copied!" : "Share"}
    </Button>
  );
}

// View Mode Toggle - Posters / Text
function ViewModeToggle({ mounted, fullWidth }: { mounted: boolean; fullWidth?: boolean }) {
  const { calendarViewMode, setCalendarViewMode } = usePreferences();

  // Map "films" and "screenings" to "posters", "table" stays as "text"
  const currentMode = mounted
    ? calendarViewMode === "table"
      ? "text"
      : "posters"
    : "posters";

  const handleSelect = (mode: "posters" | "text") => {
    if (mode === "posters") {
      setCalendarViewMode("films");
    } else {
      setCalendarViewMode("table");
    }
  };

  const options = [
    { value: "posters", label: "Posters", icon: Image },
    { value: "text", label: "Text", icon: List },
  ] as const;

  return (
    <div
      role="group"
      aria-label="View mode"
      className={cn(
        "flex rounded-lg border border-border-default bg-background-tertiary overflow-hidden",
        fullWidth && "w-full"
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const isActive = currentMode === option.value;
        return (
          <button
            key={option.value}
            onClick={() => handleSelect(option.value)}
            aria-pressed={isActive}
            className={cn(
              "flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
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

// Helper function to get next weekend
function getNextWeekend(): Date {
  const today = startOfToday();
  const dayOfWeek = today.getDay();
  // Saturday = 6, Sunday = 0
  const daysUntilSaturday = dayOfWeek === 0 ? 6 : dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
  return addDays(today, daysUntilSaturday);
}
