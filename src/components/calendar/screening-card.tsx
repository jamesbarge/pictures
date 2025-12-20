/**
 * Screening Card Component
 * Displays a single screening with film poster, title, cinema, time, and format
 * Uses design system primitives for badges and buttons
 *
 * Accessibility: Proper aria-labels, focus states, and keyboard navigation
 */

import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { cn } from "@/lib/cn";
import { Button, FormatBadge, EventBadge, Badge } from "@/components/ui";
import { ExternalLink } from "lucide-react";

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
  const { film, cinema, datetime, format: screeningFormat, eventType } = screening;
  const time = format(new Date(datetime), "HH:mm");
  const formattedDate = format(new Date(datetime), "EEEE d MMMM");

  return (
    <article
      className={cn(
        "group relative flex gap-4 p-4 rounded-lg cursor-pointer",
        "bg-background-secondary/50 border border-border-subtle",
        // Enhanced hover state with scale and shadow
        "hover:border-accent-gold/40 hover:bg-background-secondary",
        "hover:shadow-lg hover:shadow-black/20",
        "hover:scale-[1.01] transform-gpu",
        "transition-all duration-200 ease-out",
        // Focus-within for keyboard navigation
        "focus-within:ring-2 focus-within:ring-accent-gold/50 focus-within:ring-offset-2 focus-within:ring-offset-background-primary"
      )}
      aria-label={`${film.title} screening at ${cinema.name}, ${formattedDate} at ${time}`}
    >
      {/* Poster */}
      <Link
        href={`/film/${film.id}`}
        className="shrink-0 focus:outline-none"
        tabIndex={-1}
        aria-hidden="true"
      >
        <div className="relative w-20 h-28 sm:w-24 sm:h-36 rounded-md overflow-hidden bg-background-tertiary shadow-md">
          <Image
            src={film.posterUrl || `/api/poster-placeholder?title=${encodeURIComponent(film.title)}${film.year ? `&year=${film.year}` : ""}`}
            alt=""
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 80px, 96px"
            unoptimized={!film.posterUrl}
          />
        </div>
      </Link>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Title - main focusable element */}
        <Link
          href={`/film/${film.id}`}
          className="focus:outline-none focus-visible:underline focus-visible:decoration-accent-gold"
        >
          <h3 className="font-display text-lg sm:text-xl text-text-primary group-hover:text-accent-gold transition-colors line-clamp-2">
            {film.title}
            {film.year && (
              <span className="text-text-secondary font-body text-sm ml-2">
                ({film.year})
              </span>
            )}
          </h3>
        </Link>

        {/* Director - improved contrast */}
        {film.directors.length > 0 && (
          <p className="text-sm text-text-secondary mt-0.5 line-clamp-1">
            {film.directors.slice(0, 2).join(", ")}
          </p>
        )}

        {/* Cinema & Time */}
        <div className="flex items-center gap-2 mt-2 text-sm">
          <time
            dateTime={new Date(datetime).toISOString()}
            className="font-mono text-accent-gold font-semibold"
          >
            {time}
          </time>
          <span className="text-text-muted" aria-hidden="true">•</span>
          <span
            className="text-text-secondary"
            title={cinema.name}
          >
            {cinema.shortName || cinema.name}
          </span>
          {film.runtime && (
            <>
              <span className="text-text-muted" aria-hidden="true">•</span>
              <span className="text-text-tertiary">
                {film.runtime} min
              </span>
            </>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mt-2" role="list" aria-label="Screening details">
          {screeningFormat && (
            <span role="listitem">
              <FormatBadge format={screeningFormat} />
            </span>
          )}
          {eventType && (
            <span role="listitem">
              <EventBadge type={eventType} />
            </span>
          )}
          {screening.screen && (
            <span role="listitem">
              <Badge variant="outline" size="sm">
                {screening.screen}
              </Badge>
            </span>
          )}
        </div>

        {/* Book Button */}
        <div className="mt-auto pt-3">
          <a
            href={screening.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block focus:outline-none"
            aria-label={`Book tickets for ${film.title} at ${cinema.name} (opens in new tab)`}
          >
            <Button
              size="sm"
              variant="primary"
              rightIcon={<ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              Book
              <span className="sr-only"> (opens in new tab)</span>
            </Button>
          </a>
        </div>
      </div>
    </article>
  );
}
