/**
 * Film Screenings Component
 * Shows upcoming screenings for a film, grouped by cinema
 */

import { format, isToday, isTomorrow } from "date-fns";
import { MapPin, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";

interface Screening {
  id: string;
  datetime: Date;
  format?: string | null;
  screen?: string | null;
  eventType?: string | null;
  bookingUrl: string;
  cinema: {
    id: string;
    name: string;
    shortName?: string | null;
    address?: {
      area?: string;
    } | null;
  };
}

interface FilmScreeningsProps {
  screenings: Screening[];
}

const formatBadgeColors: Record<string, string> = {
  "35mm": "bg-format-35mm/20 text-format-35mm border-format-35mm/50",
  "70mm": "bg-format-70mm/20 text-format-70mm border-format-70mm/50",
  imax: "bg-format-imax/20 text-format-imax border-format-imax/50",
  "4k": "bg-format-4k/20 text-format-4k border-format-4k/50",
};

const eventTypeBadges: Record<string, { label: string; className: string }> = {
  q_and_a: { label: "Q&A", className: "bg-accent-highlight/20 text-accent-highlight-dark" },
  intro: { label: "Intro", className: "bg-accent-success/20 text-accent-success" },
  discussion: { label: "Discussion", className: "bg-accent-primary/20 text-accent-primary" },
};

function formatScreeningDate(date: Date): string {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEE d MMM");
}

export function FilmScreenings({ screenings }: FilmScreeningsProps) {
  if (screenings.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">No upcoming screenings scheduled.</p>
      </div>
    );
  }

  // Group by cinema
  const byCinema = new Map<string, { cinema: Screening["cinema"]; screenings: Screening[] }>();

  for (const screening of screenings) {
    if (!byCinema.has(screening.cinema.id)) {
      byCinema.set(screening.cinema.id, { cinema: screening.cinema, screenings: [] });
    }
    byCinema.get(screening.cinema.id)!.screenings.push(screening);
  }

  // Sort cinemas by next screening date
  const sortedCinemas = Array.from(byCinema.values()).sort((a, b) => {
    const aNext = Math.min(...a.screenings.map(s => new Date(s.datetime).getTime()));
    const bNext = Math.min(...b.screenings.map(s => new Date(s.datetime).getTime()));
    return aNext - bNext;
  });

  return (
    <div className="space-y-6">
      {sortedCinemas.map(({ cinema, screenings: cinemaScreenings }) => (
        <div key={cinema.id} className="bg-background-secondary rounded-lg border border-border-subtle shadow-card overflow-hidden">
          {/* Cinema Header */}
          <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg text-text-primary">{cinema.name}</h3>
              {cinema.address?.area && (
                <p className="text-sm text-text-tertiary flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  {cinema.address.area}
                </p>
              )}
            </div>
            <span className="text-sm text-text-tertiary font-mono">
              {cinemaScreenings.length} {cinemaScreenings.length === 1 ? "show" : "shows"}
            </span>
          </div>

          {/* Screenings List */}
          <div className="divide-y divide-border-subtle">
            {cinemaScreenings
              .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
              .map((screening) => (
                <div
                  key={screening.id}
                  className="px-4 py-3 flex items-center gap-4 hover:bg-surface-overlay-hover transition-colors"
                >
                  {/* Date & Time */}
                  <div className="w-28 shrink-0">
                    <div className="text-text-primary font-medium">
                      {formatScreeningDate(new Date(screening.datetime))}
                    </div>
                    <div className="text-accent-highlight font-mono text-lg font-semibold">
                      {format(new Date(screening.datetime), "HH:mm")}
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex-1 flex flex-wrap gap-1.5">
                    {screening.format && formatBadgeColors[screening.format] && (
                      <span className={cn(
                        "px-2 py-0.5 text-xs font-mono uppercase rounded border",
                        formatBadgeColors[screening.format]
                      )}>
                        {screening.format}
                      </span>
                    )}
                    {screening.eventType && eventTypeBadges[screening.eventType] && (
                      <span className={cn(
                        "px-2 py-0.5 text-xs font-medium rounded",
                        eventTypeBadges[screening.eventType].className
                      )}>
                        {eventTypeBadges[screening.eventType].label}
                      </span>
                    )}
                    {screening.screen && (
                      <span className="px-2 py-0.5 text-xs text-text-tertiary bg-background-tertiary rounded border border-border-subtle">
                        {screening.screen}
                      </span>
                    )}
                  </div>

                  {/* Book Button */}
                  <a
                    href={screening.bookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 px-4 py-2 text-sm font-medium text-text-inverse bg-accent-primary hover:bg-accent-primary-hover rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    Book
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
