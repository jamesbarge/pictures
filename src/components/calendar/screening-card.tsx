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
import { cn } from "@/lib/cn";
import { POSTER_BLUR_PLACEHOLDER, getSpecialFormat } from "@/lib/constants";
import { useFilmStatus } from "@/stores/film-status";
import { useFilters } from "@/stores/filters";
import { memo } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { usePostHog } from "posthog-js/react";
import { usePrefetch } from "@/hooks/usePrefetch";
import { FilmStatusButtons } from "./film-status-buttons";

type AvailabilityStatus = "available" | "low" | "sold_out" | "returns" | "unknown" | null;

interface ScreeningCardProps {
  screening: {
    id: string;
    datetime: Date;
    format?: string | null;
    screen?: string | null;
    eventType?: string | null;
    eventDescription?: string | null;
    bookingUrl: string;
    availabilityStatus?: AvailabilityStatus;
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

const AVAILABILITY_CONFIG: Record<string, { label: string; bgClass: string; textClass: string }> = {
  sold_out: { label: "Sold Out", bgClass: "bg-accent-danger/90", textClass: "text-white" },
  low: { label: "Low Availability", bgClass: "bg-amber-500/90", textClass: "text-white" },
  returns: { label: "Returns Only", bgClass: "bg-accent-gold/90", textClass: "text-black" },
};

function AvailabilityBadge({ status }: { status: AvailabilityStatus }): React.ReactElement | null {
  if (!status || !AVAILABILITY_CONFIG[status]) return null;
  const config = AVAILABILITY_CONFIG[status];
  return (
    <div className="absolute top-3 right-3 z-10">
      <span className={cn(
        "px-2 py-1 text-[10px] font-semibold uppercase tracking-wide rounded backdrop-blur-sm",
        config.bgClass,
        config.textClass
      )}>
        {config.label}
      </span>
    </div>
  );
}


export const ScreeningCard = memo(function ScreeningCard({ screening }: ScreeningCardProps) {
  const { film, cinema, datetime } = screening;
  const time = format(new Date(datetime), "HH:mm");
  const specialFormat = getSpecialFormat(screening.format);
  const formattedDate = format(new Date(datetime), "EEEE d MMMM");
  const posthog = usePostHog();

  // Performance: Use selectors to only subscribe to this specific film's status
  const rawStatus = useFilmStatus((state) => state.films[film.id]?.status ?? null);

  // Check if repertory filter is active - if so, don't show "rep" badge (redundant)
  const isRepertoryFilterActive = useFilters((state) => state.programmingTypes.includes("repertory"));

  const mounted = useHydrated();

  // Prefetch film page on hover for instant navigation
  const prefetch = usePrefetch(`/film/${film.id}`);

  // Track screening card clicks
  function trackCardClick(): void {
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
  }

  // Apply mounted guard for hydration safety (localStorage not available during SSR)
  const status = mounted ? rawStatus : null;

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
          <FilmStatusButtons
            filmId={film.id}
            filmData={{
              title: film.title,
              year: film.year,
              directors: film.directors,
              posterUrl: film.posterUrl,
            }}
            status={status}
            analyticsContext={{
              cinema_id: cinema.id,
              cinema_name: cinema.name,
            }}
          />
        )}

        {/* Availability badge */}
        <AvailabilityBadge status={screening.availabilityStatus ?? null} />
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
          {film.isRepertory && !isRepertoryFilterActive && (
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
