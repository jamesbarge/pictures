"use client";

/**
 * Gap Table Component
 * Displays films with missing data in a filterable table
 */

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { FilmDataGap } from "@/scripts/audit-film-data";

const FIELD_LABELS: Record<string, string> = {
  tmdbId: "TMDB",
  posterUrl: "Poster",
  synopsis: "Synopsis",
  letterboxdRating: "Letterboxd",
  year: "Year",
  runtime: "Runtime",
  directors: "Directors",
  genres: "Genres",
};

interface GapTableProps {
  gaps: FilmDataGap[];
}

export function GapTable({ gaps }: GapTableProps) {
  const [filter, setFilter] = useState<"all" | "upcoming">("upcoming");
  const [fieldFilter, setFieldFilter] = useState<string>("all");

  let filtered = gaps;

  if (filter === "upcoming") {
    filtered = filtered.filter((g) => g.hasUpcomingScreenings);
  }

  if (fieldFilter !== "all") {
    filtered = filtered.filter((g) => g.missingFields.includes(fieldFilter));
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter("upcoming")}
            className={cn(
              "px-3 py-1 text-xs rounded-full transition-colors",
              filter === "upcoming"
                ? "bg-accent-primary text-white"
                : "bg-background-hover text-text-secondary hover:text-text-primary"
            )}
          >
            Upcoming only
          </button>
          <button
            onClick={() => setFilter("all")}
            className={cn(
              "px-3 py-1 text-xs rounded-full transition-colors",
              filter === "all"
                ? "bg-accent-primary text-white"
                : "bg-background-hover text-text-secondary hover:text-text-primary"
            )}
          >
            All films
          </button>
        </div>

        <select
          value={fieldFilter}
          onChange={(e) => setFieldFilter(e.target.value)}
          className="text-xs bg-background-hover border border-border-subtle rounded px-2 py-1 text-text-secondary"
        >
          <option value="all">All fields</option>
          {Object.entries(FIELD_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              Missing {label}
            </option>
          ))}
        </select>

        <span className="text-xs text-text-tertiary">
          {filtered.length} films
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left">
              <th className="pb-2 font-medium text-text-secondary">Film</th>
              <th className="pb-2 font-medium text-text-secondary w-16">Year</th>
              <th className="pb-2 font-medium text-text-secondary w-24">Upcoming</th>
              <th className="pb-2 font-medium text-text-secondary w-20">Strategy</th>
              <th className="pb-2 font-medium text-text-secondary">Missing</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((gap) => (
              <tr
                key={gap.id}
                className="border-b border-border-subtle/50 hover:bg-background-hover/50"
              >
                <td className="py-2 text-text-primary">
                  <span className="font-medium">{gap.title}</span>
                </td>
                <td className="py-2 text-text-tertiary">
                  {gap.year || "—"}
                </td>
                <td className="py-2">
                  {gap.hasUpcomingScreenings ? (
                    <span className="text-green-600 font-medium">
                      {gap.upcomingScreeningCount}
                    </span>
                  ) : (
                    <span className="text-text-tertiary">0</span>
                  )}
                </td>
                <td className="py-2 text-text-tertiary text-xs">
                  {gap.matchStrategy || "none"}
                </td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-1">
                    {gap.missingFields.map((field) => (
                      <span
                        key={field}
                        className={cn(
                          "px-1.5 py-0.5 text-xs rounded",
                          field === "tmdbId" || field === "posterUrl"
                            ? "bg-red-500/10 text-red-600"
                            : "bg-yellow-500/10 text-yellow-700"
                        )}
                      >
                        {FIELD_LABELS[field] || field}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length > 100 && (
          <p className="text-xs text-text-tertiary mt-2 text-center">
            Showing 100 of {filtered.length} films
          </p>
        )}

        {filtered.length === 0 && (
          <p className="text-sm text-text-tertiary text-center py-8">
            No films match the current filters
          </p>
        )}
      </div>
    </div>
  );
}
