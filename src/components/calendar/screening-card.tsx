/**
 * Screening Card Component
 * Displays a single screening with film poster, title, cinema, time, and format
 * Uses design system primitives for badges and buttons
 *
 * Accessibility: Proper aria-labels, focus states, and keyboard navigation
 */

"use client";

import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";

// Tiny 10x15 dark gray placeholder for blur effect during image load
// This matches the 2:3 aspect ratio of movie posters
const POSTER_BLUR_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAPCAYAAADd/14OAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAKklEQVQoz2Nk+M/AQAxgZGBg+M9AB2BkYGBgZGRgYGCgF2D4T7wexAAGABPmAhHXnXDuAAAAAElFTkSuQmCC";
import { cn } from "@/lib/cn";
import { Heart, X } from "lucide-react";
import { useFilmStatus, type FilmStatus } from "@/stores/film-status";
import { memo } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { usePostHog } from "posthog-js/react";
import { usePrefetch } from "@/hooks/usePrefetch";

interface ScreeningCardProps {
  screening: {
    id: string;
    datetime: Date;
    format?: string | null;
    screen?: string | null;
    eventType?: string | null;
    eventDescription?: string | null;
    bookingUrl: string;
    availabilityStatus?: "available" | "low" | "sold_out" | "returns" | "unknown" | null;
    film: {
      id: string;
      title: string;
      year?: number | null;
      directors: string[];
      posterUrl?: string | null;
      runtime?: number | null;
      isRepertory: boolean;
    };
    cinema: {
      id: string;
      name: string;
      shortName?: string | null;
    };
  };
}

// Formats considered "special" and worth highlighting
const SPECIAL_FORMATS = ["35mm", "70mm", "imax", "4k"];

function getSpecialFormat(format: string | null | undefined): string | null {
  if (!format) return null;
  const lower = format.toLowerCase();
  // Return the original format string if it matches a special format
  for (const special of SPECIAL_FORMATS) {
    if (lower.includes(special)) {
      // Return a normalized display version
      if (lower.includes("70mm")) return "70mm";
      if (lower.includes("35mm")) return "35mm";
      if (lower.includes("imax")) return "IMAX";
      if (lower.includes("4k")) return "4K";
    }
  }
  return null;
}

export const ScreeningCard = memo(function ScreeningCard({ screening }: ScreeningCardProps) {
  const { film, cinema, datetime } = screening;
  const time = format(new Date(datetime), "HH:mm");
  const specialFormat = getSpecialFormat(screening.format);
  const formattedDate = format(new Date(datetime), "EEEE d MMMM");
  const posthog = usePostHog();

  // Performance: Use selectors to only subscribe to this specific film's status
  // This prevents all cards from re-rendering when any status changes
  const filmId = film.id;
  const rawStatus = useFilmStatus((state) => state.films[filmId]?.status ?? null);
  const setStatus = useFilmStatus((state) => state.setStatus);

  const mounted = useHydrated();

  // Prefetch film page on hover for instant navigation
  const prefetch = usePrefetch(`/film/${film.id}`);

  // Track screening card clicks
  const trackCardClick = () => {
    posthog.capture("screening_card_clicked", {
      film_id: film.id,
      film_title: film.title,
      film_year: film.year,
      cinema_id: cinema.id,
      cinema_name: cinema.name,
      screening_id: screening.id,
      screening_time: datetime,
      is_repertory: film.isRepertory,
    });
  };

  // Apply mounted guard for hydration safety (localStorage not available during SSR)
  const status = mounted ? rawStatus : null;

  const handleStatusClick = (e: React.MouseEvent, newStatus: FilmStatus) => {
    e.preventDefault();
    e.stopPropagation();

    // Toggle off if already set to this status
    if (status === newStatus) {
      posthog.capture("film_status_removed", {
        film_id: film.id,
        film_title: film.title,
        previous_status: newStatus,
      });
      setStatus(film.id, null);
      return;
    }

    // Track status change
    posthog.capture("film_status_set", {
      film_id: film.id,
      film_title: film.title,
      status: newStatus,
      cinema_id: cinema.id,
      cinema_name: cinema.name,
    });

    // Always pass film metadata so it can be displayed in settings/lists
    setStatus(film.id, newStatus, {
      title: film.title,
      year: film.year,
      directors: film.directors,
      posterUrl: film.posterUrl,
    });
  };

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded overflow-hidden cursor-pointer h-full",
        "bg-background-secondary border border-border-subtle",
        // Refined hover state - subtle lift with warm shadow
        "hover:border-accent-primary/30 hover:shadow-card-hover",
        "hover:-translate-y-0.5 transform-gpu",
        "transition-all duration-300 ease-out",
        // Focus-within for keyboard navigation
        "focus-within:ring-2 focus-within:ring-accent-primary/40 focus-within:ring-offset-2 focus-within:ring-offset-background-primary"
      )}
      aria-label={`${film.title} screening at ${cinema.name}, ${formattedDate} at ${time}`}
      onMouseEnter={prefetch.onMouseEnter}
      onMouseLeave={prefetch.onMouseLeave}
      onTouchStart={prefetch.onTouchStart}
    >
      {/* Poster area - contains link and buttons */}
      <div className="relative aspect-[2/3] w-full overflow-hidden">
        {/* Poster link - decorative, not for keyboard nav */}
        <Link
          href={`/film/${film.id}`}
          className="absolute inset-0 focus:outline-none"
          tabIndex={-1}
          aria-hidden="true"
          onClick={trackCardClick}
        >
          {film.posterUrl && !film.posterUrl.includes('poster-placeholder') ? (
            <Image
              src={film.posterUrl}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 20vw, 15vw"
              placeholder="blur"
              blurDataURL={POSTER_BLUR_PLACEHOLDER}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/poster-placeholder?title=${encodeURIComponent(film.title)}${film.year ? `&year=${film.year}` : ""}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {/* Gradient overlay for better text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-50 group-hover:opacity-60 transition-opacity" />
        </Link>

        {/* Status buttons - outside aria-hidden Link for accessibility */}
        {mounted && (
          <div className={cn(
            "absolute top-2 left-2 z-10 flex flex-col gap-1",
            "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
            // Always show if a status is set
            status && "opacity-100"
          )}>
            <button
              onClick={(e) => handleStatusClick(e, "want_to_see")}
              className={cn(
                "w-7 h-7 flex items-center justify-center rounded-full transition-all shadow-sm",
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
                "w-7 h-7 flex items-center justify-center rounded-full transition-all shadow-sm",
                status === "not_interested"
                  ? "bg-neutral-700 text-white"
                  : "bg-black/60 text-white/80 hover:bg-neutral-600 hover:text-white"
              )}
              aria-label={status === "not_interested" ? "Show this film again" : "Not interested in this film"}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Availability badge - shows sold out or low availability */}
        {screening.availabilityStatus === "sold_out" && (
          <div className="absolute top-3 right-3 z-10">
            <span className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide rounded bg-accent-danger/90 text-white backdrop-blur-sm">
              Sold Out
            </span>
          </div>
        )}
        {screening.availabilityStatus === "low" && (
          <div className="absolute top-3 right-3 z-10">
            <span className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide rounded bg-amber-500/90 text-white backdrop-blur-sm">
              Low Availability
            </span>
          </div>
        )}
        {screening.availabilityStatus === "returns" && (
          <div className="absolute top-3 right-3 z-10">
            <span className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide rounded bg-accent-gold/90 text-black backdrop-blur-sm">
              Returns Only
            </span>
          </div>
        )}
      </div>

      {/* Content - Compact below poster */}
      <Link
        href={`/film/${film.id}`}
        className="flex flex-col flex-1 p-2 focus:outline-none"
        onClick={trackCardClick}
      >
        {/* Time and Cinema row */}
        <div className="flex items-center gap-2 mb-1">
          <time
            dateTime={new Date(datetime).toISOString()}
            className="font-mono text-xs font-semibold text-accent-highlight"
          >
            {time}
          </time>
          <span className="text-[10px] text-text-tertiary">•</span>
          <span className="text-[10px] text-text-secondary truncate">
            {cinema.shortName || cinema.name}
          </span>
          {film.isRepertory && (
            <span className="px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide rounded bg-white/10 text-text-secondary">
              rep
            </span>
          )}
          {specialFormat && (
            <span className="px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide rounded bg-white/10 text-text-secondary">
              {specialFormat}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-display text-xs sm:text-sm text-text-primary group-hover:text-accent-primary transition-colors line-clamp-1 leading-tight">
          {film.title}
          {film.year && (
            <span className="text-text-tertiary font-body text-[10px] ml-1">
              ({film.year})
            </span>
          )}
        </h3>

        {/* Director */}
        {film.directors.length > 0 && (
          <p className="text-[10px] text-text-secondary mt-0.5 line-clamp-1">
            {film.directors[0]}
          </p>
        )}
      </Link>
    </article>
  );
});
