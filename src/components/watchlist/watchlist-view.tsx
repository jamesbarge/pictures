/**
 * Watchlist View Component
 * Client component that filters films based on localStorage watchlist
 */

"use client";

import { useState, useMemo, useEffect } from "react";
import { useFilmStatus } from "@/stores/film-status";
import { format } from "date-fns";
import Link from "next/link";
import Image from "next/image";
import {
  Heart,
  Calendar,
  Clock,
  MapPin,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Film,
  Eye,
  Trash2,
  Cloud,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";
import { SignInButton, SignedOut } from "@clerk/nextjs";

interface Film {
  id: string;
  title: string;
  year: number | null;
  directors: string[];
  posterUrl: string | null;
  runtime: number | null;
  genres: string[];
  upcomingCount: number;
  nextScreening: Date | null;
}

interface Screening {
  id: string;
  filmId: string;
  datetime: Date;
  format: string | null;
  screen: string | null;
  bookingUrl: string;
  cinema: {
    id: string;
    name: string;
    shortName: string | null;
  };
}

interface WatchlistViewProps {
  films: Film[];
  screeningsByFilm: Record<string, Screening[]>;
}

type SortOption = "next_screening" | "date_added" | "alphabetical";

// Blur placeholder for poster images to prevent CLS
const POSTER_BLUR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAPCAYAAADd/14OAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAKklEQVQoz2Nk+M/AQAxgZGBg+M9AB2BkYGBgZGRgYGCgF2D4T7wexAAGABPmAhHXnXDuAAAAAElFTkSuQmCC";

export function WatchlistView({ films, screeningsByFilm }: WatchlistViewProps) {
  const { films: filmStatuses, getWatchlist, setStatus } = useFilmStatus();
  const [mounted, setMounted] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("next_screening");
  const [expandedFilms, setExpandedFilms] = useState<Set<string>>(new Set());
  const [syncBannerDismissed, setSyncBannerDismissed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Standard hydration pattern
    setMounted(true);
  }, []);

  // Get watchlist film IDs from localStorage
  const watchlistIds = useMemo(() => {
    if (!mounted) return [];
    return getWatchlist();
  }, [mounted, getWatchlist]);

  // Filter and enrich films that are on the watchlist
  const watchlistFilms = useMemo(() => {
    return films
      .filter((f) => watchlistIds.includes(f.id))
      .map((f) => ({
        ...f,
        addedAt: filmStatuses[f.id]?.addedAt,
        screenings: screeningsByFilm[f.id] || [],
      }));
  }, [films, watchlistIds, filmStatuses, screeningsByFilm]);

  // Split into currently showing and not showing
  const { currentlyShowing, notShowing } = useMemo(() => {
    const showing: typeof watchlistFilms = [];
    const notPlaying: typeof watchlistFilms = [];

    for (const film of watchlistFilms) {
      if (film.upcomingCount > 0) {
        showing.push(film);
      } else {
        notPlaying.push(film);
      }
    }

    // Sort based on selected option
    const sortFn = (a: typeof watchlistFilms[0], b: typeof watchlistFilms[0]) => {
      switch (sortBy) {
        case "next_screening":
          if (!a.nextScreening && !b.nextScreening) return 0;
          if (!a.nextScreening) return 1;
          if (!b.nextScreening) return -1;
          return new Date(a.nextScreening).getTime() - new Date(b.nextScreening).getTime();
        case "date_added":
          if (!a.addedAt && !b.addedAt) return 0;
          if (!a.addedAt) return 1;
          if (!b.addedAt) return -1;
          return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
        case "alphabetical":
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    };

    showing.sort(sortFn);
    notPlaying.sort((a, b) =>
      sortBy === "alphabetical" ? a.title.localeCompare(b.title) : sortFn(a, b)
    );

    return { currentlyShowing: showing, notShowing: notPlaying };
  }, [watchlistFilms, sortBy]);

  const toggleExpanded = (filmId: string) => {
    setExpandedFilms((prev) => {
      const next = new Set(prev);
      if (next.has(filmId)) {
        next.delete(filmId);
      } else {
        next.add(filmId);
      }
      return next;
    });
  };

  const handleRemoveFromWatchlist = (filmId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setStatus(filmId, null);
  };

  const handleMarkAsSeen = (filmId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setStatus(filmId, "seen");
  };

  if (!mounted) {
    return <WatchlistSkeleton />;
  }

  if (watchlistIds.length === 0) {
    return <EmptyWatchlist />;
  }

  return (
    <div className="space-y-8">
      {/* Sign in to sync banner */}
      {mounted && !syncBannerDismissed && (
        <SignedOut>
          <SyncBanner onDismiss={() => setSyncBannerDismissed(true)} />
        </SignedOut>
      )}

      {/* Sort Controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-tertiary">
          {watchlistIds.length} film{watchlistIds.length !== 1 ? "s" : ""} on your watchlist
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-tertiary">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="bg-background-secondary border border-border-default rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-primary/50"
          >
            <option value="next_screening">Next Screening</option>
            <option value="date_added">Date Added</option>
            <option value="alphabetical">A-Z</option>
          </select>
        </div>
      </div>

      {/* Currently Showing Section */}
      {currentlyShowing.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <h2 className="text-lg font-display text-text-primary">
              Currently Showing ({currentlyShowing.length})
            </h2>
          </div>
          <div className="space-y-3">
            {currentlyShowing.map((film) => (
              <WatchlistFilmCard
                key={film.id}
                film={film}
                isExpanded={expandedFilms.has(film.id)}
                onToggleExpand={() => toggleExpanded(film.id)}
                onRemove={(e) => handleRemoveFromWatchlist(film.id, e)}
                onMarkSeen={(e) => handleMarkAsSeen(film.id, e)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Not Currently Playing Section */}
      {notShowing.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-text-tertiary" />
            <h2 className="text-lg font-display text-text-primary">
              Not Currently Playing ({notShowing.length})
            </h2>
          </div>
          <div className="space-y-3">
            {notShowing.map((film) => (
              <WatchlistFilmCard
                key={film.id}
                film={film}
                isExpanded={false}
                onToggleExpand={() => {}}
                onRemove={(e) => handleRemoveFromWatchlist(film.id, e)}
                onMarkSeen={(e) => handleMarkAsSeen(film.id, e)}
                isNotPlaying
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

interface WatchlistFilmCardProps {
  film: Film & { screenings: Screening[]; addedAt?: string };
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRemove: (e: React.MouseEvent) => void;
  onMarkSeen: (e: React.MouseEvent) => void;
  isNotPlaying?: boolean;
}

function WatchlistFilmCard({
  film,
  isExpanded,
  onToggleExpand,
  onRemove,
  onMarkSeen,
  isNotPlaying,
}: WatchlistFilmCardProps) {
  return (
    <div
      className={cn(
        "border rounded-xl overflow-hidden transition-all",
        isNotPlaying
          ? "border-border-subtle bg-background-secondary/30"
          : "border-border-default bg-background-secondary"
      )}
    >
      {/* Main Card Content */}
      <div className="flex gap-4 p-4">
        {/* Poster */}
        <Link href={`/film/${film.id}`} className="shrink-0">
          <div className="relative w-16 h-24 rounded overflow-hidden bg-background-tertiary">
            {film.posterUrl ? (
              <Image
                src={film.posterUrl}
                alt={film.title}
                fill
                className="object-cover"
                sizes="64px"
                placeholder="blur"
                blurDataURL={POSTER_BLUR}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Film className="w-6 h-6 text-text-tertiary" />
              </div>
            )}
          </div>
        </Link>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <Link href={`/film/${film.id}`} className="group">
            <h3 className="font-display text-text-primary group-hover:text-accent-primary transition-colors truncate">
              {film.title}
            </h3>
          </Link>

          <div className="flex items-center gap-2 text-sm text-text-tertiary mt-1">
            {film.year && <span>{film.year}</span>}
            {film.directors.length > 0 && (
              <>
                <span className="text-border-subtle">•</span>
                <span className="truncate">{film.directors[0]}</span>
              </>
            )}
            {film.runtime && (
              <>
                <span className="text-border-subtle">•</span>
                <span>{film.runtime}m</span>
              </>
            )}
          </div>

          {/* Screening Info */}
          {!isNotPlaying && film.upcomingCount > 0 && (
            <div className="mt-2">
              <button
                onClick={onToggleExpand}
                className="inline-flex items-center gap-2 text-sm text-accent-primary hover:text-accent-hover transition-colors"
              >
                <Calendar className="w-4 h-4" />
                <span>
                  {film.upcomingCount} screening{film.upcomingCount !== 1 ? "s" : ""}
                </span>
                {film.nextScreening && (
                  <span className="text-text-tertiary">
                    • Next: {format(new Date(film.nextScreening), "EEE d MMM, HH:mm")}
                  </span>
                )}
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>
          )}

          {isNotPlaying && (
            <p className="text-sm text-text-tertiary mt-2">
              No upcoming screenings
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={onMarkSeen}
            className="p-2 rounded-lg text-text-tertiary hover:text-green-400 hover:bg-green-500/10 transition-colors"
            title="Mark as seen"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={onRemove}
            className="p-2 rounded-lg text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Remove from watchlist"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded Screenings */}
      {isExpanded && film.screenings.length > 0 && (
        <div className="border-t border-border-subtle bg-background-tertiary/30">
          <div className="p-4 space-y-2">
            {film.screenings.slice(0, 10).map((screening) => (
              <a
                key={screening.id}
                href={screening.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-3 rounded-lg bg-background-secondary/50 hover:bg-background-secondary transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-text-tertiary" />
                    <span className="text-text-primary font-medium">
                      {format(new Date(screening.datetime), "EEE d MMM, HH:mm")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-text-tertiary mt-1">
                    <MapPin className="w-4 h-4" />
                    <span>{screening.cinema.name}</span>
                    {screening.format && (
                      <>
                        <span className="text-border-subtle">•</span>
                        <span className="uppercase text-xs">{screening.format}</span>
                      </>
                    )}
                    {screening.screen && (
                      <>
                        <span className="text-border-subtle">•</span>
                        <span>{screening.screen}</span>
                      </>
                    )}
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-text-tertiary group-hover:text-accent-primary transition-colors" />
              </a>
            ))}
            {film.screenings.length > 10 && (
              <Link
                href={`/film/${film.id}`}
                className="block text-center text-sm text-accent-primary hover:text-accent-hover transition-colors py-2"
              >
                View all {film.screenings.length} screenings
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SyncBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="relative flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-accent-primary/10 to-accent-secondary/10 border border-accent-primary/20">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent-primary/20 flex items-center justify-center">
        <Cloud className="w-5 h-5 text-accent-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">
          Sign in to sync your watchlist
        </p>
        <p className="text-xs text-text-secondary mt-0.5">
          Access your watchlist on any device and never lose your saved films
        </p>
      </div>
      <SignInButton mode="modal">
        <button className="flex-shrink-0 px-4 py-2 text-sm font-medium text-white bg-accent-primary hover:bg-accent-primary-hover rounded-lg transition-colors">
          Sign In
        </button>
      </SignInButton>
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 p-1 text-text-tertiary hover:text-text-secondary transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function EmptyWatchlist() {
  return (
    <div className="text-center py-16">
      <Heart className="w-16 h-16 text-text-tertiary mx-auto mb-4" />
      <h2 className="text-xl font-display text-text-primary mb-2">
        Your watchlist is empty
      </h2>
      <p className="text-text-secondary mb-6 max-w-md mx-auto">
        Browse the calendar and mark films you want to see. They&apos;ll appear here
        so you never miss a screening.
      </p>
      <Link href="/">
        <Button variant="primary">Browse Screenings</Button>
      </Link>
    </div>
  );
}

function WatchlistSkeleton() {
  return (
    <div className="space-y-8">
      {/* SyncBanner Placeholder - reserve space to prevent CLS when banner appears */}
      <div className="h-[76px] rounded-xl bg-background-tertiary/30 animate-pulse" />

      {/* Sort Controls Skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-5 w-32 bg-background-tertiary rounded animate-pulse" />
        <div className="h-8 w-40 bg-background-tertiary rounded animate-pulse" />
      </div>

      {/* Cards Skeleton */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="border border-border-subtle rounded-xl p-4 bg-background-secondary/50"
          >
            <div className="flex gap-4">
              <div className="w-16 h-24 bg-background-tertiary rounded animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-48 bg-background-tertiary rounded animate-pulse" />
                <div className="h-4 w-32 bg-surface-muted rounded animate-pulse" />
                <div className="h-4 w-40 bg-surface-muted rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
