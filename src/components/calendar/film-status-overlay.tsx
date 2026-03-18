/**
 * Film Status Overlay Component
 * Reusable status buttons (watchlist + not interested) for film/screening cards
 * Handles PostHog analytics and Zustand state updates
 *
 * Used by: FilmCard, ScreeningCard
 */

"use client";

import { cn } from "@/lib/cn";
import { Heart, X } from "lucide-react";
import { useFilmStatus, type FilmStatus } from "@/stores/film-status";
import { useHydrated } from "@/hooks/useHydrated";

interface FilmData {
  id: string;
  title: string;
  year?: number | null;
  directors: string[];
  posterUrl?: string | null;
}

interface FilmStatusOverlayProps {
  film: FilmData;
  /** Additional class names for positioning container */
  className?: string;
}

/** Reusable watchlist and not-interested buttons for film/screening cards, synced to Zustand and PostHog. */
export function FilmStatusOverlay({ film, className }: FilmStatusOverlayProps) {
  const mounted = useHydrated();

  // Performance: Use selectors to only subscribe to this specific film's status
  // This prevents all cards from re-rendering when any status changes
  const rawStatus = useFilmStatus((state) => state.films[film.id]?.status ?? null);
  const setStatus = useFilmStatus((state) => state.setStatus);

  // Apply mounted guard for hydration safety (localStorage not available during SSR)
  const status = mounted ? rawStatus : null;

  const handleStatusClick = (e: React.MouseEvent, newStatus: FilmStatus) => {
    e.preventDefault();
    e.stopPropagation();

    // Toggle off if already set to this status; analytics tracked by the store
    if (status === newStatus) {
      setStatus(film.id, null);
      return;
    }

    // Always pass film metadata so it can be displayed in settings/lists
    setStatus(film.id, newStatus, {
      title: film.title,
      year: film.year,
      directors: film.directors,
      posterUrl: film.posterUrl,
    });
  };

  // Don't render until client-side hydration is complete
  if (!mounted) return null;

  return (
    <div
      className={cn(
        "absolute top-2 left-2 z-10 flex flex-col gap-1",
        "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
        // Always show if a status is set
        status && "opacity-100",
        className
      )}
    >
      <button
        onClick={(e) => handleStatusClick(e, "want_to_see")}
        className={cn(
          "w-7 h-7 flex items-center justify-center rounded-full transition-colors shadow-sm",
          status === "want_to_see"
            ? "bg-accent-danger text-text-inverse"
            : "bg-black/60 text-text-inverse/80 hover:bg-accent-danger hover:text-text-inverse"
        )}
        aria-label={status === "want_to_see" ? "Remove from watchlist" : "Add to watchlist"}
      >
        <Heart className={cn("w-3.5 h-3.5", status === "want_to_see" && "fill-current")} />
      </button>
      <button
        onClick={(e) => handleStatusClick(e, "not_interested")}
        className={cn(
          "w-7 h-7 flex items-center justify-center rounded-full transition-colors shadow-sm",
          status === "not_interested"
            ? "bg-status-not-interested text-text-inverse"
            : "bg-black/60 text-text-inverse/80 hover:bg-status-not-interested hover:text-text-inverse"
        )}
        aria-label={
          status === "not_interested" ? "Show this film again" : "Not interested in this film"
        }
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
