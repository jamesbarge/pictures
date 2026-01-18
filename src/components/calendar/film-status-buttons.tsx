/**
 * Film Status Buttons Component
 * Shared component for watchlist and not-interested buttons
 * Used by ScreeningCard and FilmCard to reduce duplication
 */

"use client";

import { cn } from "@/lib/cn";
import { Heart, X } from "lucide-react";
import { useFilmStatus, type FilmStatus, type FilmMetadata } from "@/stores/film-status";
import { usePostHog } from "posthog-js/react";

interface FilmStatusButtonsProps {
  filmId: string;
  filmData: FilmMetadata;
  status: FilmStatus;
  /** Additional context for analytics (cinema, screening, etc.) */
  analyticsContext?: Record<string, unknown>;
}

export function FilmStatusButtons({
  filmId,
  filmData,
  status,
  analyticsContext,
}: FilmStatusButtonsProps): React.ReactElement {
  const setStatus = useFilmStatus((state) => state.setStatus);
  const posthog = usePostHog();

  function handleStatusClick(e: React.MouseEvent, newStatus: FilmStatus): void {
    e.preventDefault();
    e.stopPropagation();

    // Toggle off if already set to this status
    if (status === newStatus) {
      posthog.capture("film_status_removed", {
        film_id: filmId,
        film_title: filmData.title,
        previous_status: newStatus,
        ...analyticsContext,
      });
      setStatus(filmId, null);
      return;
    }

    // Track status change
    posthog.capture("film_status_set", {
      film_id: filmId,
      film_title: filmData.title,
      status: newStatus,
      ...analyticsContext,
    });

    setStatus(filmId, newStatus, filmData);
  }

  return (
    <div
      className={cn(
        "absolute top-2 left-2 z-10 flex flex-col gap-1",
        "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
        status && "opacity-100"
      )}
    >
      <button
        onClick={(e) => handleStatusClick(e, "want_to_see")}
        className={cn(
          "w-7 h-7 flex items-center justify-center rounded-full transition-colors shadow-sm",
          status === "want_to_see"
            ? "bg-accent-danger text-white"
            : "bg-black/60 text-white/80 hover:bg-accent-danger hover:text-white"
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
            ? "bg-neutral-700 text-white"
            : "bg-black/60 text-white/80 hover:bg-neutral-600 hover:text-white"
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
