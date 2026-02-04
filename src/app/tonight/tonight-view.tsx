/**
 * Tonight View — Client Component
 * Groups screenings into "Starting Soon" (< 2 hours) and "Later Tonight"
 * with live countdown timers and urgency-driven UX.
 */

"use client";

import { useMemo, useState, useEffect } from "react";
import { format, differenceInMinutes } from "date-fns";
import { Clock, ExternalLink, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { ShareScreeningButton } from "@/components/film/share-screening-button";
import { AddToCalendarButton } from "@/components/film/add-to-calendar-button";
import { usePostHog } from "posthog-js/react";
import Link from "next/link";
import Image from "next/image";
import { POSTER_BLUR_PLACEHOLDER } from "@/lib/constants";

interface TonightScreening {
  id: string;
  datetime: Date;
  format?: string | null;
  screen?: string | null;
  eventType?: string | null;
  eventDescription?: string | null;
  bookingUrl: string;
  availabilityStatus?: string | null;
  film: {
    id: string;
    title: string;
    year?: number | null;
    directors: string[];
    posterUrl?: string | null;
    runtime?: number | null;
    isRepertory: boolean;
    letterboxdRating?: number | null;
  };
  cinema: {
    id: string;
    name: string;
    shortName?: string | null;
  };
}

interface TonightViewProps {
  screenings: TonightScreening[];
}

const STARTING_SOON_MINUTES = 120; // 2 hours

function getUrgencyLabel(minutesUntil: number): { text: string; className: string } {
  if (minutesUntil <= 0) {
    return { text: "Starting now", className: "text-accent-danger font-semibold animate-pulse" };
  }
  if (minutesUntil <= 15) {
    return { text: `${minutesUntil} min`, className: "text-accent-danger font-semibold" };
  }
  if (minutesUntil <= 30) {
    return { text: `${minutesUntil} min`, className: "text-amber-500 font-medium" };
  }
  if (minutesUntil <= 60) {
    return { text: `${minutesUntil} min`, className: "text-accent-highlight font-medium" };
  }
  const hours = Math.floor(minutesUntil / 60);
  const mins = minutesUntil % 60;
  return {
    text: mins > 0 ? `${hours}h ${mins}m` : `${hours}h`,
    className: "text-text-secondary",
  };
}

function CountdownBadge({ datetime }: { datetime: Date }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000); // Update every 30s
    return () => clearInterval(interval);
  }, []);

  const minutesUntil = differenceInMinutes(new Date(datetime), now);
  const urgency = getUrgencyLabel(Math.max(0, minutesUntil));

  return (
    <span className={cn("text-xs font-mono flex items-center gap-1", urgency.className)}>
      <Clock className="w-3 h-3" aria-hidden="true" />
      {urgency.text}
    </span>
  );
}

const formatBadgeColors: Record<string, string> = {
  "35mm": "bg-format-35mm/20 text-format-35mm",
  "70mm": "bg-format-70mm/20 text-format-70mm",
  imax: "bg-format-imax/20 text-format-imax",
  "4k": "bg-format-4k/20 text-format-4k",
};

const eventTypeBadges: Record<string, { label: string; className: string }> = {
  q_and_a: { label: "Q&A", className: "bg-accent-highlight/20 text-accent-highlight-dark" },
  intro: { label: "Intro", className: "bg-accent-success/20 text-accent-success" },
  discussion: { label: "Discussion", className: "bg-accent-primary/20 text-accent-primary" },
  preview: { label: "Preview", className: "bg-purple-500/20 text-purple-400" },
  premiere: { label: "Premiere", className: "bg-accent-gold/20 text-accent-gold" },
};

function TonightScreeningCard({ screening }: { screening: TonightScreening }) {
  const { film, cinema, datetime } = screening;
  const posthog = usePostHog();
  const time = format(new Date(datetime), "HH:mm");

  const trackBookingClick = () => {
    posthog.capture("booking_link_clicked", {
      film_id: film.id,
      film_title: film.title,
      screening_id: screening.id,
      cinema_name: cinema.name,
      source: "tonight_page",
    });
  };

  return (
    <article className="flex gap-4 p-4 rounded-lg bg-background-secondary border border-border-subtle hover:border-accent-primary/30 transition-colors">
      {/* Poster */}
      <Link href={`/film/${film.id}`} className="shrink-0 w-16 sm:w-20">
        <div className="relative aspect-[2/3] rounded overflow-hidden">
          {film.posterUrl && !film.posterUrl.includes("poster-placeholder") ? (
            <Image
              src={film.posterUrl}
              alt=""
              fill
              className="object-cover"
              sizes="80px"
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
        </div>
      </Link>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/film/${film.id}`}
              className="font-display text-base sm:text-lg text-text-primary hover:text-accent-primary transition-colors line-clamp-1"
            >
              {film.title}
              {film.year && (
                <span className="text-text-tertiary font-body text-sm ml-1.5">
                  ({film.year})
                </span>
              )}
            </Link>
            {film.directors.length > 0 && (
              <p className="text-xs text-text-secondary mt-0.5">
                {film.directors.slice(0, 2).join(", ")}
              </p>
            )}
          </div>
          <CountdownBadge datetime={datetime} />
        </div>

        {/* Cinema + Time */}
        <div className="flex items-center gap-2 mt-2 text-sm">
          <MapPin className="w-3.5 h-3.5 text-text-tertiary shrink-0" aria-hidden="true" />
          <span className="text-text-secondary truncate">
            {cinema.shortName || cinema.name}
          </span>
          <span className="text-text-tertiary">·</span>
          <time
            dateTime={new Date(datetime).toISOString()}
            className="font-mono text-accent-highlight font-semibold"
          >
            {time}
          </time>
          {film.runtime && (
            <>
              <span className="text-text-tertiary">·</span>
              <span className="text-text-tertiary text-xs">{film.runtime} min</span>
            </>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {screening.format && formatBadgeColors[screening.format] && (
            <span
              className={cn(
                "px-2 py-0.5 text-[10px] font-mono uppercase rounded",
                formatBadgeColors[screening.format]
              )}
            >
              {screening.format}
            </span>
          )}
          {screening.eventType && eventTypeBadges[screening.eventType] && (
            <span
              className={cn(
                "px-2 py-0.5 text-[10px] font-medium rounded",
                eventTypeBadges[screening.eventType].className
              )}
            >
              {eventTypeBadges[screening.eventType].label}
            </span>
          )}
          {film.letterboxdRating && film.letterboxdRating >= 4.0 && (
            <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-accent-success/20 text-accent-success">
              {film.letterboxdRating.toFixed(1)} LB
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3">
          <a
            href={screening.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={trackBookingClick}
            className="px-4 py-1.5 text-sm font-medium text-text-inverse bg-accent-primary hover:bg-accent-primary-hover rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
          >
            Book
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
          <AddToCalendarButton
            screeningId={screening.id}
            filmTitle={film.title}
            cinemaName={cinema.name}
          />
          <ShareScreeningButton
            filmTitle={film.title}
            filmId={film.id}
            cinemaName={cinema.name}
            datetime={datetime}
            format={screening.format}
            eventType={screening.eventType}
          />
        </div>
      </div>
    </article>
  );
}

export function TonightView({ screenings }: TonightViewProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const { startingSoon, laterTonight } = useMemo(() => {
    const soon: TonightScreening[] = [];
    const later: TonightScreening[] = [];

    for (const screening of screenings) {
      const minutesUntil = differenceInMinutes(
        new Date(screening.datetime),
        now
      );
      if (minutesUntil <= STARTING_SOON_MINUTES) {
        soon.push(screening);
      } else {
        later.push(screening);
      }
    }

    return { startingSoon: soon, laterTonight: later };
  }, [screenings, now]);

  return (
    <div className="space-y-10">
      {/* Starting Soon Section */}
      {startingSoon.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-display text-text-primary">
              Starting Soon
            </h2>
            <span className="px-2 py-0.5 text-xs font-mono bg-accent-danger/10 text-accent-danger rounded-full">
              {startingSoon.length}
            </span>
          </div>
          <div className="grid gap-3">
            {startingSoon.map((screening) => (
              <TonightScreeningCard
                key={screening.id}
                screening={screening}
              />
            ))}
          </div>
        </section>
      )}

      {/* Later Tonight Section */}
      {laterTonight.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-display text-text-primary">
              Later Tonight
            </h2>
            <span className="px-2 py-0.5 text-xs font-mono bg-background-tertiary text-text-tertiary rounded-full">
              {laterTonight.length}
            </span>
          </div>
          <div className="grid gap-3">
            {laterTonight.map((screening) => (
              <TonightScreeningCard
                key={screening.id}
                screening={screening}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
