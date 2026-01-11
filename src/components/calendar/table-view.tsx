/**
 * Table View Component
 * Dense newspaper-style listing of all films across all dates
 * Sortable columns, expandable rows for full screening details
 */

"use client";

import { useMemo, useState, useCallback, memo } from "react";
import { format } from "date-fns";
import { ChevronUp, ChevronDown } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

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
    directors: string[];
  };
  primaryCinema: { id: string; name: string; shortName?: string | null };
  additionalCinemaCount: number;
  upcomingTimes: Array<{
    datetime: Date;
    bookingUrl: string;
    cinema: { id: string; name: string; shortName?: string | null };
  }>;
  allScreenings: Screening[];
  screeningCount: number;
  nextTime: Date;
}

type SortColumn = "title" | "director" | "cinema" | "time";
type SortDirection = "asc" | "desc";

interface TableViewProps {
  screenings: Screening[];
}

export const TableView = memo(function TableView({ screenings }: TableViewProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [expandedFilmId, setExpandedFilmId] = useState<string | null>(null);

  // Aggregate screenings by film (across ALL dates)
  const aggregatedFilms = useMemo(() => {
    const filmMap = new Map<string, {
      film: Screening["film"];
      screenings: Screening[];
      cinemas: Map<string, Screening["cinema"]>;
    }>();

    for (const screening of screenings) {
      const filmId = screening.film.id;
      if (!filmMap.has(filmId)) {
        filmMap.set(filmId, {
          film: screening.film,
          screenings: [],
          cinemas: new Map(),
        });
      }
      const entry = filmMap.get(filmId)!;
      entry.screenings.push(screening);
      entry.cinemas.set(screening.cinema.id, screening.cinema);
    }

    // Transform to TableFilmRow array
    return Array.from(filmMap.values()).map(({ film, screenings, cinemas }): TableFilmRow => {
      const sortedScreenings = [...screenings].sort(
        (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
      );
      const cinemaArray = Array.from(cinemas.values());

      return {
        film,
        primaryCinema: cinemaArray[0],
        additionalCinemaCount: cinemaArray.length - 1,
        upcomingTimes: sortedScreenings.slice(0, 5).map(s => ({
          datetime: new Date(s.datetime),
          bookingUrl: s.bookingUrl,
          cinema: s.cinema,
        })),
        allScreenings: sortedScreenings,
        screeningCount: screenings.length,
        nextTime: new Date(sortedScreenings[0].datetime),
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
        case "director":
          const dirA = a.film.directors[0] || "";
          const dirB = b.film.directors[0] || "";
          comparison = dirA.localeCompare(dirB);
          break;
        case "cinema":
          const cinemaA = a.primaryCinema.shortName || a.primaryCinema.name;
          const cinemaB = b.primaryCinema.shortName || b.primaryCinema.name;
          comparison = cinemaA.localeCompare(cinemaB);
          break;
        case "time":
          comparison = a.nextTime.getTime() - b.nextTime.getTime();
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
      setSortDirection("asc");
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
              column="director"
              label="Director"
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
              column="time"
              label="Times"
              currentColumn={sortColumn}
              direction={sortDirection}
              onSort={handleSort}
            />
          </tr>
        </thead>
        <tbody>
          {sortedFilms.map(row => (
            <TableRow
              key={row.film.id}
              row={row}
              isExpanded={expandedFilmId === row.film.id}
              onToggleExpand={() => toggleExpanded(row.film.id)}
            />
          ))}
        </tbody>
      </table>
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
}

function SortableHeader({ column, label, currentColumn, direction, onSort }: SortableHeaderProps) {
  const isActive = currentColumn === column;

  return (
    <th
      onClick={() => onSort(column)}
      className={cn(
        "select-none",
        isActive && "text-text-primary"
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

// Individual table row
interface TableRowProps {
  row: TableFilmRow;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const TableRow = memo(function TableRow({ row, isExpanded, onToggleExpand }: TableRowProps) {
  const cinemaDisplay = row.primaryCinema.shortName || row.primaryCinema.name;

  return (
    <>
      <tr
        className={cn("table-view-row", isExpanded && "table-view-row-expanded")}
        onClick={onToggleExpand}
      >
        <td>
          <Link
            href={`/film/${row.film.id}`}
            onClick={(e) => e.stopPropagation()}
            className="hover:text-accent-primary transition-colors"
          >
            <span className="table-view-title">{row.film.title}</span>
            {row.film.year && (
              <span className="table-view-year">({row.film.year})</span>
            )}
          </Link>
        </td>
        <td className="table-view-director">
          {row.film.directors[0] || "—"}
        </td>
        <td className="table-view-cinema">
          {cinemaDisplay}
          {row.additionalCinemaCount > 0 && (
            <span className="table-view-cinema-count">+{row.additionalCinemaCount}</span>
          )}
        </td>
        <td>
          <div className="table-view-times">
            {row.upcomingTimes.slice(0, 4).map((t, i) => (
              <a
                key={i}
                href={t.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="table-view-time"
                title={`${format(t.datetime, "EEE d MMM")} at ${t.cinema.shortName || t.cinema.name}`}
              >
                {format(t.datetime, "HH:mm")}
              </a>
            ))}
            {row.screeningCount > 4 && (
              <span className="text-text-tertiary text-xs">
                +{row.screeningCount - 4}
              </span>
            )}
          </div>
        </td>
      </tr>
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
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-tertiary text-xs uppercase tracking-wider">
            <th className="text-left py-1 pr-4">Date</th>
            <th className="text-left py-1 pr-4">Time</th>
            <th className="text-left py-1 pr-4">Cinema</th>
            <th className="text-left py-1">Book</th>
          </tr>
        </thead>
        <tbody>
          {groupedByDate.map(({ date, screenings }) => (
            screenings.map((s, i) => (
              <tr key={s.id} className="border-t border-border-subtle/50">
                <td className="py-1.5 pr-4 text-text-secondary">
                  {i === 0 ? format(date, "EEE d MMM") : ""}
                </td>
                <td className="py-1.5 pr-4 font-mono text-text-primary">
                  {format(new Date(s.datetime), "HH:mm")}
                </td>
                <td className="py-1.5 pr-4 text-text-secondary">
                  {s.cinema.shortName || s.cinema.name}
                </td>
                <td className="py-1.5">
                  <a
                    href={s.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-primary hover:underline"
                  >
                    Book
                  </a>
                </td>
              </tr>
            ))
          ))}
        </tbody>
      </table>
    </div>
  );
}
