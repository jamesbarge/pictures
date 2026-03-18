/**
 * Film View Tracker Component
 * Tracks when a user views a film's detail page
 */

"use client";

import { useEffect, useRef } from "react";
import { trackFilmView } from "@/lib/analytics";

interface FilmViewTrackerProps {
  filmId: string;
  filmTitle: string;
  filmYear?: number | null;
  isRepertory?: boolean;
  genres?: string[] | null;
  directors?: string[] | null;
}

/** Invisible tracker that fires a PostHog film-view event once per mount. */
export function FilmViewTracker({
  filmId,
  filmTitle,
  filmYear,
  isRepertory,
  genres,
  directors,
}: FilmViewTrackerProps) {
  const hasTracked = useRef(false);

  useEffect(() => {
    // Only track once per component mount
    if (hasTracked.current) return;
    hasTracked.current = true;

    // Track film view
    trackFilmView({
      filmId,
      filmTitle,
      filmYear,
      isRepertory,
      genres,
      directors,
    });
  }, [filmId, filmTitle, filmYear, isRepertory, genres, directors]);

  // This component doesn't render anything
  return null;
}
