/**
 * Film Card Component
 * Displays a single film with aggregated screening count for the day
 * Used in "film view" mode to show one card per film instead of per screening
 *
 * Accessibility: Proper aria-labels, focus states, and keyboard navigation
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { FilmPoster } from "@/components/film/film-poster";
import { cn } from "@/lib/cn";
import { POSTER_BLUR_PLACEHOLDER } from "@/lib/constants";
import { useFilmStatus } from "@/stores/film-status";
import { useFilters } from "@/stores/filters";
import { memo } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { usePostHog } from "posthog-js/react";
import { usePrefetch } from "@/hooks/usePrefetch";
import { FilmStatusButtons } from "./film-status-buttons";

interface FilmCardProps {
  film: {
    id: string;
    title: string;
    year?: number | null;
    directors: string[];
    posterUrl?: string | null;
    isRepertory?: boolean;
  };
  screeningCount: number;
  cinemaCount: number;
  singleCinema?: {
    id: string;
    name: string;
    shortName?: string | null;
  };
  earliestTime: Date;
  specialFormats: string[];
}

export const FilmCard = memo(function FilmCard({
  film,
  screeningCount,
  cinemaCount,
  singleCinema,
  specialFormats,
}: FilmCardProps) {
  const posthog = usePostHog();

  // Performance: Use selectors to only subscribe to this specific film's status
  const rawStatus = useFilmStatus((state) => state.films[film.id]?.status ?? null);

  // Check if repertory filter is active - if so, don't show "rep" badge (redundant)
  const isRepertoryFilterActive = useFilters((state) => state.programmingTypes.includes("repertory"));

  const mounted = useHydrated();

  // Prefetch film page on hover for instant navigation
  const prefetch = usePrefetch(`/film/${film.id}`);

  // Track film card clicks
  function trackCardClick(): void {
    posthog.capture("film_card_clicked", {
      film_id: film.id,
      film_title: film.title,
      film_year: film.year,
      screening_count: screeningCount,
      cinema_count: cinemaCount,
      special_formats: specialFormats,
    });
  }

  // Apply mounted guard for hydration safety (localStorage not available during SSR)
  const status = mounted ? rawStatus : null;

  const screeningLabel = screeningCount === 1 ? "showing" : "showings";
  // Use cinema name when there's only one, otherwise use count
  const cinemaDisplay = singleCinema
    ? singleCinema.shortName || singleCinema.name
    : `${cinemaCount} ${cinemaCount === 1 ? "cinema" : "cinemas"}`;

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded overflow-hidden cursor-pointer h-full",
        "bg-background-secondary border border-border-subtle",
        // Refined hover state - subtle lift with warm shadow
        "hover:border-accent-primary/30 hover:shadow-card-hover",
        "hover:-translate-y-0.5 transform-gpu",
        "transition-[border-color,box-shadow,transform] duration-200 ease-out",
        // Focus-within for keyboard navigation
        "focus-within:ring-2 focus-within:ring-accent-primary/40 focus-within:ring-offset-2 focus-within:ring-offset-background-primary"
      )}
      aria-label={`${film.title} - ${screeningCount} ${screeningLabel} at ${cinemaDisplay}`}
      onMouseEnter={prefetch.onMouseEnter}
      onMouseLeave={prefetch.onMouseLeave}
      onTouchStart={prefetch.onTouchStart}
    >
      {/* Poster area - contains link and buttons */}
      <div className="relative aspect-[2/3] w-full overflow-hidden poster-glow poster-glow-hover transition-shadow duration-200">
        {/* Poster link - decorative, not for keyboard nav */}
        <Link
          href={`/film/${film.id}`}
          className="absolute inset-0 focus:outline-none"
          tabIndex={-1}
          aria-hidden="true"
          onClick={trackCardClick}
        >
          {/* Use placeholder SVG route for films without posters */}
          {film.posterUrl && !film.posterUrl.includes("poster-placeholder") ? (
            <FilmPoster
              src={film.posterUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 200px"
              className="object-cover"
              placeholder="blur"
              blurDataURL={POSTER_BLUR_PLACEHOLDER}
            />
          ) : (
            /* SVG placeholders must be unoptimized - Next.js Image optimization fails on SVGs */
            <Image
              src={`/api/poster-placeholder?title=${encodeURIComponent(film.title)}${film.year ? `&year=${film.year}` : ""}`}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 200px"
              className="object-cover"
              unoptimized
            />
          )}

          {/* Gradient overlay for better text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-50 group-hover:opacity-60 transition-opacity" />
        </Link>

        {/* Status buttons - outside aria-hidden Link for accessibility */}
        {mounted && (
          <FilmStatusButtons
            filmId={film.id}
            filmData={{
              title: film.title,
              year: film.year,
              directors: film.directors,
              posterUrl: film.posterUrl,
            }}
            status={status}
          />
        )}

      </div>

      {/* Content - Compact below poster */}
      <Link
        href={`/film/${film.id}`}
        className="flex flex-col flex-1 p-2 focus:outline-none"
        onClick={trackCardClick}
      >
        {/* Title */}
        <h3 className="font-display text-xs sm:text-sm text-text-primary group-hover:text-accent-primary transition-colors line-clamp-1 leading-tight">
          {film.title}
          {film.year && (
            <span className="text-text-tertiary font-body text-[10px] ml-1">({film.year})</span>
          )}
        </h3>

        {/* Director */}
        {film.directors.length > 0 && (
          <p className="text-[10px] text-text-secondary mt-0.5 line-clamp-1">
            {film.directors[0]}
          </p>
        )}

        {/* Screening summary */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-text-tertiary mt-auto pt-1">
          <span>{screeningCount} {screeningLabel} at {cinemaDisplay}</span>
          {film.isRepertory && !isRepertoryFilterActive && (
            <span className="px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide rounded bg-white/10 text-text-secondary">
              rep
            </span>
          )}
          {specialFormats.length > 0 && (
            <span className="px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide rounded bg-white/10 text-text-secondary">
              {specialFormats.join(" / ")}
            </span>
          )}
        </div>
      </Link>
    </article>
  );
});
