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
import { Heart, Eye } from "lucide-react";
import { useFilmStatus } from "@/stores/film-status";
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

  const { getStatus, setStatus } = useFilmStatus();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const status = mounted ? getStatus(film.id) : null;

  const handleStatusClick = (e: React.MouseEvent, newStatus: "want_to_see" | "seen") => {
    e.preventDefault();
    e.stopPropagation();
    // Toggle off if already set to this status
    setStatus(film.id, status === newStatus ? null : newStatus);
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
      {/* Poster - Full width, prominent */}
      <Link
        href={`/film/${film.id}`}
        className="block relative aspect-[2/3] w-full overflow-hidden focus:outline-none"
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

        {/* Time badge - floating on poster */}
        <div className="absolute top-3 right-3">
          <time
            dateTime={new Date(datetime).toISOString()}
            className="inline-flex items-center px-2 py-1 rounded-md bg-accent-highlight font-mono text-xs font-semibold text-text-inverse shadow-sm"
          >
            {time}
          </time>
        </div>

        {/* Status buttons - floating top left */}
        {mounted && (
          <div className="absolute top-3 left-3 flex items-center gap-1">
            <button
              onClick={(e) => handleStatusClick(e, "want_to_see")}
              className={cn(
                "p-1.5 rounded-md backdrop-blur-sm transition-all",
                status === "want_to_see"
                  ? "bg-accent-danger/40 text-accent-danger"
                  : "bg-black/50 text-white/70 hover:text-accent-danger hover:bg-accent-danger/20"
              )}
              title={status === "want_to_see" ? "Remove from watchlist" : "Add to watchlist"}
              aria-label={status === "want_to_see" ? "Remove from watchlist" : "Add to watchlist"}
            >
              <Heart className={cn("w-4 h-4", status === "want_to_see" && "fill-current")} />
            </button>
            <button
              onClick={(e) => handleStatusClick(e, "seen")}
              className={cn(
                "p-1.5 rounded-md backdrop-blur-sm transition-all",
                status === "seen"
                  ? "bg-accent-success/40 text-accent-success"
                  : "bg-black/50 text-white/70 hover:text-accent-success hover:bg-accent-success/20"
              )}
              title={status === "seen" ? "Unmark as seen" : "Mark as seen"}
              aria-label={status === "seen" ? "Unmark as seen" : "Mark as seen"}
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Cinema badge - bottom of poster */}
        <div className="absolute bottom-3 left-3 right-3">
          <span className="inline-block px-2 py-1 rounded-md bg-accent-primary/90 backdrop-blur-sm text-xs font-medium text-text-inverse truncate max-w-full shadow-sm">
            {cinema.shortName || cinema.name}
          </span>
        </div>
      </Link>

      {/* Content - Compact below poster */}
      <Link
        href={`/film/${film.id}`}
        className="flex flex-col flex-1 p-2 focus:outline-none"
      >
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
