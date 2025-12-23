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
import { Heart, X } from "lucide-react";
import { useFilmStatus, type FilmStatus } from "@/stores/film-status";
import { useState, useEffect } from "react";

interface ScreeningCardProps {
  screening: {
    id: string;
    datetime: Date;
    format?: string | null;
    screen?: string | null;
    eventType?: string | null;
    eventDescription?: string | null;
    bookingUrl: string;
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

export function ScreeningCard({ screening }: ScreeningCardProps) {
  const { film, cinema, datetime } = screening;
  const time = format(new Date(datetime), "HH:mm");
  const formattedDate = format(new Date(datetime), "EEEE d MMMM");

  // Performance: Use selectors to only subscribe to this specific film's status
  // This prevents all cards from re-rendering when any status changes
  const filmId = film.id;
  const rawStatus = useFilmStatus((state) => state.films[filmId]?.status ?? null);
  const setStatus = useFilmStatus((state) => state.setStatus);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Apply mounted guard for hydration safety (localStorage not available during SSR)
  const status = mounted ? rawStatus : null;

  const handleStatusClick = (e: React.MouseEvent, newStatus: FilmStatus) => {
    e.preventDefault();
    e.stopPropagation();

    // Toggle off if already set to this status
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

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-lg overflow-hidden cursor-pointer h-full",
        "bg-background-secondary border border-border-subtle",
        // Refined hover state - subtle lift with warm shadow
        "hover:border-accent-primary/30 hover:shadow-card-hover",
        "hover:-translate-y-0.5 transform-gpu",
        "transition-all duration-300 ease-out",
        // Focus-within for keyboard navigation
        "focus-within:ring-2 focus-within:ring-accent-primary/40 focus-within:ring-offset-2 focus-within:ring-offset-background-primary"
      )}
      aria-label={`${film.title} screening at ${cinema.name}, ${formattedDate} at ${time}`}
    >
      {/* Poster area - contains link and buttons */}
      <div className="relative aspect-[2/3] w-full overflow-hidden">
        {/* Poster link - decorative, not for keyboard nav */}
        <Link
          href={`/film/${film.id}`}
          className="absolute inset-0 focus:outline-none"
          tabIndex={-1}
          aria-hidden="true"
        >
          {film.posterUrl && !film.posterUrl.includes('poster-placeholder') ? (
            <Image
              src={film.posterUrl}
              alt=""
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-110"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/poster-placeholder?title=${encodeURIComponent(film.title)}${film.year ? `&year=${film.year}` : ""}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          )}

          {/* Gradient overlay for better text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-50 group-hover:opacity-60 transition-opacity" />
        </Link>

        {/* Status buttons - outside aria-hidden Link for accessibility */}
        {mounted && (
          <div className={cn(
            "absolute top-3 left-3 z-10 flex flex-col gap-1.5",
            "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
            // Always show if a status is set
            status && "opacity-100"
          )}>
            <button
              onClick={(e) => handleStatusClick(e, "want_to_see")}
              className={cn(
                "group/btn flex items-center gap-1.5 p-1.5 rounded-md backdrop-blur-sm transition-all",
                status === "want_to_see"
                  ? "bg-accent-danger/40 text-accent-danger"
                  : "bg-black/50 text-white/70 hover:text-accent-danger hover:bg-accent-danger/20"
              )}
              aria-label={status === "want_to_see" ? "Remove from watchlist" : "Add to watchlist"}
            >
              <Heart className={cn("w-4 h-4 shrink-0", status === "want_to_see" && "fill-current")} />
              <span className="text-[10px] font-medium whitespace-nowrap max-w-0 overflow-hidden group-hover/btn:max-w-[100px] transition-all duration-200">
                Watchlist
              </span>
            </button>
            <button
              onClick={(e) => handleStatusClick(e, "not_interested")}
              className={cn(
                "group/btn flex items-center gap-1.5 p-1.5 rounded-md backdrop-blur-sm transition-all",
                status === "not_interested"
                  ? "bg-black/60 text-white"
                  : "bg-black/50 text-white/70 hover:text-white hover:bg-black/60"
              )}
              aria-label={status === "not_interested" ? "Show this film again" : "Not interested in this film"}
            >
              <X className="w-4 h-4 shrink-0" />
              <span className="text-[10px] font-medium whitespace-nowrap max-w-0 overflow-hidden group-hover/btn:max-w-[100px] transition-all duration-200">
                Not interested
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Content - Compact below poster */}
      <Link
        href={`/film/${film.id}`}
        className="flex flex-col flex-1 p-2 focus:outline-none"
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
}
