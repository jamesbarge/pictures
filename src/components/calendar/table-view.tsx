/**
 * Table View Component
 * Dense text-only listing of all films across all dates
 * Sortable columns, expandable rows for full screening details
 */

"use client";

import { useMemo, useState, useCallback, memo } from "react";
import { format, differenceInDays } from "date-fns";
import { ChevronUp, ChevronDown, ChevronRight, Star, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useSafeDateLabels } from "@/hooks/useSafeDateLabels";

interface Screening {
  id: string;
  datetime: Date;
  format?: string | null;
  bookingUrl: string;
  film: {
    id: string;
    title: string;
    year?: number | null;
    directors: string[];
    letterboxdRating?: number | null;
  };
  cinema: {
    id: string;
    name: string;
    shortName?: string | null;
  };
}

interface TableFilmRow {
  film: {
    id: string;
    title: string;
    year?: number | null;
    letterboxdRating?: number | null;
  };
  primaryCinema: { id: string; name: string; shortName?: string | null };
  additionalCinemaCount: number;
  allScreenings: Screening[];
  screeningCount: number;
  firstDate: Date;
  lastDate: Date;
  uniqueDates: Date[];
}

type SortColumn = "title" | "rating" | "cinema" | "showing";
type SortDirection = "asc" | "desc";

interface TableViewProps {
  screenings: Screening[];
}

export const TableView = memo(function TableView({ screenings }: TableViewProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("rating");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [expandedFilmId, setExpandedFilmId] = useState<string | null>(null);
  const [ratingsHidden, setRatingsHidden] = useState(false);

  // Aggregate screenings by film (across ALL dates)
  const aggregatedFilms = useMemo(() => {
    const filmMap = new Map<string, {
      film: Screening["film"];
      screenings: Screening[];
      cinemas: Map<string, Screening["cinema"]>;
      dates: Set<string>;
    }>();

    for (const screening of screenings) {
      const filmId = screening.film.id;
      if (!filmMap.has(filmId)) {
        filmMap.set(filmId, {
          film: screening.film,
          screenings: [],
          cinemas: new Map(),
          dates: new Set(),
        });
      }
      const entry = filmMap.get(filmId)!;
      entry.screenings.push(screening);
      entry.cinemas.set(screening.cinema.id, screening.cinema);
      entry.dates.add(format(new Date(screening.datetime), "yyyy-MM-dd"));
    }

    // Transform to TableFilmRow array
    return Array.from(filmMap.values()).map(({ film, screenings, cinemas, dates }): TableFilmRow => {
      const sortedScreenings = [...screenings].sort(
        (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
      );
      const cinemaArray = Array.from(cinemas.values());
      const sortedDates = Array.from(dates).sort().map(d => new Date(d));

      return {
        film,
        primaryCinema: cinemaArray[0],
        additionalCinemaCount: cinemaArray.length - 1,
        allScreenings: sortedScreenings,
        screeningCount: screenings.length,
        firstDate: sortedDates[0],
        lastDate: sortedDates[sortedDates.length - 1],
        uniqueDates: sortedDates,
      };
    });
  }, [screenings]);

  // Sort the aggregated films
  const sortedFilms = useMemo(() => {
    const sorted = [...aggregatedFilms];

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case "title":
          comparison = a.film.title.localeCompare(b.film.title);
          break;
        case "rating":
          // Sort by rating, nulls last
          const aRating = a.film.letterboxdRating ?? -1;
          const bRating = b.film.letterboxdRating ?? -1;
          comparison = aRating - bRating;
          break;
        case "cinema":
          const cinemaA = a.primaryCinema.shortName || a.primaryCinema.name;
          const cinemaB = b.primaryCinema.shortName || b.primaryCinema.name;
          comparison = cinemaA.localeCompare(cinemaB);
          break;
        case "showing":
          comparison = a.firstDate.getTime() - b.firstDate.getTime();
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [aggregatedFilms, sortColumn, sortDirection]);

  // Handle column header click for sorting
  const handleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      // Default to desc for rating, asc for others
      setSortDirection(column === "rating" ? "desc" : "asc");
    }
  }, [sortColumn]);

  // Toggle row expansion
  const toggleExpanded = useCallback((filmId: string) => {
    setExpandedFilmId(prev => prev === filmId ? null : filmId);
  }, []);

  return (
    <div className="table-view-container">
      <table className="table-view">
        <thead>
          <tr className="table-view-header">
            <SortableHeader
              column="title"
              label="Film"
              currentColumn={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
            />
            <SortableHeader
              column="cinema"
              label="Cinema"
              currentColumn={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
            />
            <SortableHeader
              column="showing"
              label="Showing"
              currentColumn={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
              className="hidden sm:table-cell"
            />
            <th className="w-16 sm:w-20">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSort("rating")}
                  className={cn(
                    "inline-flex items-center gap-1 select-none whitespace-nowrap",
                    sortColumn === "rating" && "text-text-primary"
                  )}
                >
                  Rating
                  {sortColumn === "rating" && (
                    sortDirection === "asc"
                      ? <ChevronUp className="w-3 h-3" />
                      : <ChevronDown className="w-3 h-3" />
                  )}
                </button>
                <button
                  onClick={() => setRatingsHidden(h => !h)}
                  className="p-0.5 rounded hover:bg-background-tertiary transition-colors"
                  title={ratingsHidden ? "Show ratings" : "Hide ratings"}
                >
                  {ratingsHidden ? (
                    <EyeOff className="w-3.5 h-3.5 text-text-tertiary" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-text-tertiary hover:text-text-secondary" />
                  )}
                </button>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedFilms.map(row => (
            <TableRow
              key={row.film.id}
              row={row}
              isExpanded={expandedFilmId === row.film.id}
              onToggleExpand={() => toggleExpanded(row.film.id)}
              ratingsHidden={ratingsHidden}
            />
          ))}
        </tbody>
      </table>

      {/* Film count footer */}
      <div className="text-text-tertiary text-xs text-center py-3 border-t border-border-subtle">
        {sortedFilms.length} films
      </div>
    </div>
  );
});

// Sortable column header
interface SortableHeaderProps {
  column: SortColumn;
  label: string;
  currentColumn: SortColumn;
  direction: SortDirection;
  onSort: (column: SortColumn) => void;
  className?: string;
}

function SortableHeader({ column, label, currentColumn, direction, onSort, className }: SortableHeaderProps) {
  const isActive = currentColumn === column;

  return (
    <th
      onClick={() => onSort(column)}
      className={cn(
        "select-none whitespace-nowrap",
        isActive && "text-text-primary",
        className
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          direction === "asc"
            ? <ChevronUp className="w-3 h-3" />
            : <ChevronDown className="w-3 h-3" />
        )}
      </span>
    </th>
  );
}

// Format the "Showing" dates in a compact way
function formatShowingDates(
  firstDate: Date,
  lastDate: Date,
  uniqueDates: Date[],
  isClientToday: (date: Date) => boolean
): string {
  const isTodayResult = isClientToday(firstDate);
  const daySpan = differenceInDays(lastDate, firstDate);

  if (uniqueDates.length === 1) {
    // Single date
    return isTodayResult ? "Today" : format(firstDate, "EEE d");
  }

  if (daySpan <= 6) {
    // Show day abbreviations for short runs
    return `${format(firstDate, "EEE")}-${format(lastDate, "EEE")}`;
  }

  // Longer runs: show date range
  return `${format(firstDate, "d MMM")} - ${format(lastDate, "d MMM")}`;
}

// Individual table row
interface TableRowProps {
  row: TableFilmRow;
  isExpanded: boolean;
  onToggleExpand: () => void;
  ratingsHidden: boolean;
}

const TableRow = memo(function TableRow({ row, isExpanded, onToggleExpand, ratingsHidden }: TableRowProps) {
  const { isClientToday } = useSafeDateLabels();
  const cinemaDisplay = row.primaryCinema.shortName || row.primaryCinema.name;
  const showingText = formatShowingDates(row.firstDate, row.lastDate, row.uniqueDates, isClientToday);
  const rating = row.film.letterboxdRating;

  return (
    <>
      <tr
        className={cn("table-view-row", isExpanded && "table-view-row-expanded")}
        onClick={onToggleExpand}
      >
        {/* Film title with year */}
        <td className="table-view-film">
          <div className="flex items-center gap-1.5">
            <ChevronRight
              className={cn(
                "w-3.5 h-3.5 text-text-tertiary transition-transform flex-shrink-0",
                isExpanded && "rotate-90"
              )}
            />
            <Link
              href={`/film/${row.film.id}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:text-accent-primary transition-colors truncate"
            >
              <span className="font-medium">{row.film.title}</span>
              {row.film.year && (
                <span className="text-text-tertiary ml-1">({row.film.year})</span>
              )}
            </Link>
          </div>
        </td>

        {/* Cinema */}
        <td className="table-view-cinema">
          {cinemaDisplay}
          {row.additionalCinemaCount > 0 && (
            <span className="text-text-tertiary ml-1">+{row.additionalCinemaCount}</span>
          )}
        </td>

        {/* Showing dates */}
        <td className="table-view-showing hidden sm:table-cell">
          <span className="whitespace-nowrap">{showingText}</span>
          {row.screeningCount > 1 && (
            <span className="text-text-tertiary ml-1">({row.screeningCount})</span>
          )}
        </td>

        {/* Letterboxd Rating */}
        <td className="table-view-rating">
          {ratingsHidden ? (
            <span className="text-text-tertiary">•••</span>
          ) : rating ? (
            <span className="inline-flex items-center gap-0.5">
              <Star className="w-3 h-3 fill-accent-highlight text-accent-highlight" />
              <span>{rating.toFixed(1)}</span>
            </span>
          ) : (
            <span className="text-text-tertiary">—</span>
          )}
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded && (
        <tr className="table-expanded">
          <td colSpan={4}>
            <ExpandedDetail screenings={row.allScreenings} />
          </td>
        </tr>
      )}
    </>
  );
});

// Expanded row detail showing all screenings
interface ExpandedDetailProps {
  screenings: Screening[];
}

function ExpandedDetail({ screenings }: ExpandedDetailProps) {
  // Group screenings by date
  const groupedByDate = useMemo(() => {
    const groups = new Map<string, Screening[]>();

    for (const s of screenings) {
      const dateKey = format(new Date(s.datetime), "yyyy-MM-dd");
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(s);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, screenings]) => ({
        date: new Date(dateKey),
        screenings: screenings.sort(
          (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
        ),
      }));
  }, [screenings]);

  return (
    <div className="table-expanded-inner">
      {groupedByDate.map(({ date, screenings }) => (
        <div key={date.toISOString()} className="mb-3 last:mb-0">
          <div className="text-xs font-medium text-text-secondary mb-1">
            {format(date, "EEEE d MMMM")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {screenings.map((s) => (
              <a
                key={s.id}
                href={s.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-background-tertiary hover:bg-accent-primary hover:text-text-inverse transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="font-mono font-medium">
                  {format(new Date(s.datetime), "HH:mm")}
                </span>
                <span className="text-text-secondary">
                  {s.cinema.shortName || s.cinema.name}
                </span>
                {s.format && (
                  <span className="text-text-tertiary">
                    {s.format}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
