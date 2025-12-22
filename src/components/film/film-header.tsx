/**
 * Film Header Component
 * Displays film poster, backdrop, and key metadata
 * Features: Ken Burns animation on backdrop, smooth transitions
 */

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Calendar, Globe, Star, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import { getTmdbUrl, getImdbUrl, generateLetterboxdUrl } from "@/lib/external-urls";
import { useFilters } from "@/stores/filters";
import type { CastMember } from "@/types/film";

interface FilmHeaderProps {
  film: {
    id: string;
    title: string;
    originalTitle?: string | null;
    year?: number | null;
    runtime?: number | null;
    directors: string[];
    cast: CastMember[];
    genres: string[];
    countries: string[];
    synopsis?: string | null;
    tagline?: string | null;
    posterUrl?: string | null;
    backdropUrl?: string | null;
    isRepertory: boolean;
    decade?: string | null;
    certification?: string | null;
    tmdbRating?: number | null;
    // External IDs for linking
    tmdbId?: number | null;
    imdbId?: string | null;
    letterboxdUrl?: string | null;
  };
}

export function FilmHeader({ film }: FilmHeaderProps) {
  const [backdropLoaded, setBackdropLoaded] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const router = useRouter();
  const { setGenres, clearAllFilters } = useFilters();

  const handleGenreClick = (genre: string) => {
    // Clear other filters and set just this genre
    clearAllFilters();
    setGenres([genre]);
    router.push("/");
  };

  const { setDecades } = useFilters.getState();
  const handleDecadeClick = (decade: string) => {
    clearAllFilters();
    setDecades([decade]);
    router.push("/");
  };

  return (
    <div className="relative">
      {/* Backdrop with Ken Burns effect */}
      {film.backdropUrl && (
        <div className="absolute inset-0 h-64 sm:h-80 overflow-hidden">
          <Image
            src={film.backdropUrl}
            alt=""
            fill
            className={cn(
              "object-cover transition-all duration-1000 ease-out",
              "animate-ken-burns",
              backdropLoaded ? "opacity-30 scale-100" : "opacity-0 scale-105"
            )}
            priority
            onLoad={() => setBackdropLoaded(true)}
          />
          {/* Gradient overlays for light theme */}
          <div className="absolute inset-0 bg-gradient-to-b from-background-primary/30 via-background-primary/70 to-background-primary" />
          <div className="absolute inset-0 bg-gradient-to-r from-background-primary/50 via-transparent to-background-primary/50" />
          {/* Subtle vignette - warm neutral */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(26,26,26,0.15)_100%)]" />
        </div>
      )}

      {/* Content */}
      <div className="relative pt-8 sm:pt-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Poster */}
            <div className="shrink-0 mx-auto sm:mx-0">
              <div className="relative w-48 h-72 sm:w-56 sm:h-84 rounded-lg overflow-hidden shadow-elevated bg-background-secondary border border-border-subtle">
                {/* Use poster URL or fall back to generated placeholder */}
                {film.posterUrl && !film.posterUrl.includes('poster-placeholder') ? (
                  <Image
                    src={film.posterUrl}
                    alt={film.title}
                    fill
                    className={cn(
                      "object-cover transition-all duration-700 ease-out",
                      posterLoaded ? "opacity-100 scale-100" : "opacity-0 scale-105"
                    )}
                    priority
                    onLoad={() => setPosterLoaded(true)}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/api/poster-placeholder?title=${encodeURIComponent(film.title)}${film.year ? `&year=${film.year}` : ""}`}
                    alt={film.title}
                    className={cn(
                      "absolute inset-0 w-full h-full object-cover transition-all duration-700 ease-out",
                      posterLoaded ? "opacity-100 scale-100" : "opacity-0 scale-105"
                    )}
                    onLoad={() => setPosterLoaded(true)}
                  />
                )}

                {/* Loading skeleton */}
                {!posterLoaded && (
                  <div className="absolute inset-0 skeleton" />
                )}

                {/* Repertory Badge */}
                {film.isRepertory && (
                  <div className="absolute top-2 left-2 px-2 py-1 text-xs font-medium bg-accent-highlight text-text-inverse rounded shadow-sm">
                    REPERTORY
                  </div>
                )}

                {/* Subtle poster border on hover */}
                <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-border-subtle pointer-events-none" />
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              {/* Title */}
              <h1 className="font-display text-3xl sm:text-4xl text-text-primary">
                {film.title}
              </h1>
              {film.originalTitle && film.originalTitle !== film.title && (
                <p className="text-text-secondary text-lg mt-1 italic">
                  {film.originalTitle}
                </p>
              )}

              {/* Tagline */}
              {film.tagline && (
                <p className="text-text-secondary italic mt-2">
                  "{film.tagline}"
                </p>
              )}

              {/* Meta Row */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-4 text-sm text-text-secondary">
                {film.year && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {film.year}
                  </span>
                )}
                {film.runtime && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {film.runtime} min
                  </span>
                )}
                {film.certification && (
                  <span className="px-2 py-0.5 border border-border-default rounded text-xs font-mono text-text-secondary">
                    {film.certification}
                  </span>
                )}
                {film.tmdbRating && film.tmdbRating > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-accent-highlight fill-accent-highlight" />
                    {film.tmdbRating.toFixed(1)}
                  </span>
                )}
                {film.countries.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-4 h-4" />
                    {film.countries.slice(0, 2).join(", ")}
                  </span>
                )}
              </div>

              {/* Directors */}
              {film.directors.length > 0 && (
                <div className="mt-4">
                  <span className="text-text-tertiary text-sm">Directed by </span>
                  <span className="text-text-primary">
                    {film.directors.join(", ")}
                  </span>
                </div>
              )}

              {/* Cast */}
              {film.cast.length > 0 && (
                <div className="mt-2">
                  <span className="text-text-tertiary text-sm">With </span>
                  <span className="text-text-secondary">
                    {film.cast.slice(0, 5).map(c => c.name).join(", ")}
                  </span>
                </div>
              )}

              {/* Genres - Clickable to filter */}
              {film.genres.length > 0 && (
                <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4">
                  {film.genres.map((genre) => (
                    <button
                      key={genre}
                      onClick={() => handleGenreClick(genre)}
                      className={cn(
                        "px-3 py-1 text-sm rounded-full capitalize transition-all",
                        "bg-background-tertiary text-text-secondary border border-border-subtle",
                        "hover:bg-accent-primary/10 hover:text-accent-primary hover:border-accent-primary/30",
                        "focus:outline-none focus:ring-2 focus:ring-accent-primary/40",
                        "cursor-pointer"
                      )}
                      aria-label={`View all ${genre} films`}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              )}

              {/* Decade Badge - Clickable to filter */}
              {film.decade && (
                <div className="mt-4">
                  <button
                    onClick={() => handleDecadeClick(film.decade!)}
                    className={cn(
                      "px-3 py-1 text-sm rounded-full transition-all",
                      "bg-accent-highlight/15 text-accent-highlight-dark border border-accent-highlight/30",
                      "hover:bg-accent-highlight/25 hover:border-accent-highlight/50",
                      "focus:outline-none focus:ring-2 focus:ring-accent-highlight/40",
                      "cursor-pointer"
                    )}
                    aria-label={`View all films from the ${film.decade}`}
                  >
                    {film.decade}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Synopsis */}
          {film.synopsis && (
            <div className="mt-8 max-w-2xl">
              <h2 className="text-sm font-medium text-text-tertiary uppercase tracking-wider mb-2">
                Synopsis
              </h2>
              <p className="text-text-secondary leading-relaxed">
                {film.synopsis}
              </p>
            </div>
          )}

          {/* External Links */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {film.tmdbId && (
              <a
                href={getTmdbUrl(film.tmdbId)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg",
                  "text-sm text-text-tertiary hover:text-text-primary",
                  "bg-background-tertiary hover:bg-surface-overlay-hover",
                  "border border-border-subtle hover:border-border-default",
                  "transition-all"
                )}
              >
                <span className="font-medium">TMDB</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {film.imdbId && (
              <a
                href={getImdbUrl(film.imdbId)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg",
                  "text-sm text-text-tertiary hover:text-text-primary",
                  "bg-background-tertiary hover:bg-surface-overlay-hover",
                  "border border-border-subtle hover:border-border-default",
                  "transition-all"
                )}
              >
                <span className="font-medium">IMDb</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <a
              href={film.letterboxdUrl || generateLetterboxdUrl(film.title)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg",
                "text-sm text-text-tertiary hover:text-text-primary",
                "bg-background-tertiary hover:bg-surface-overlay-hover",
                "border border-border-subtle hover:border-border-default",
                "transition-all"
              )}
            >
              <span className="font-medium">Letterboxd</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
