/**
 * Letterboxd Import Panel
 * Client component with a 4-state flow: idle -> scraping -> results/error.
 * Lets users enter a Letterboxd username, preview matched films with
 * screening data, and import them to their watchlist.
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import Link from "next/link";
import posthog from "posthog-js";
import { Loader2, X, AlertCircle, CheckCircle2, Film } from "lucide-react";
import { Button, Badge, FormatBadge } from "@/components/ui";
import { FilmPoster } from "@/components/film/film-poster";
import {
  SafeSignedIn,
  SafeSignedOut,
  SafeSignInButton as SignInButton,
} from "@/components/clerk-components-safe";
import { useFilmStatus } from "@/stores/film-status";
import type { EnrichedFilm, ImportError } from "@/lib/letterboxd-import";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UnmatchedEntry {
  title: string;
  year: number | null;
  slug: string;
}

interface PreviewResponse {
  matched: EnrichedFilm[];
  pendingLookup: number;
  unmatchedEntries: UnmatchedEntry[];
  total: number;
  username: string;
  capped: boolean;
}

type ImportState =
  | { step: "idle" }
  | { step: "scraping"; username: string }
  | {
      step: "results";
      data: PreviewResponse;
    }
  | { step: "error"; error: ImportError; username: string };

interface LetterboxdImportProps {
  /** Called when the user closes the panel. Optional on standalone pages. */
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POSTER_BLUR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAPCAYAAADd/14OAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAKklEQVQoz2Nk+M/AQAxgZGBg+M9AB2BkYGBgZGRgYGCgF2D4T7wexAAGABPmAhHXnXDuAAAAAElFTkSuQmCC";

const STATUS_MESSAGES = [
  "Scanning your watchlist...",
  "Checking London cinemas...",
  "Matching films and screenings...",
];

const ERROR_MESSAGES: Record<ImportError, string> = {
  user_not_found:
    "We couldn't find a Letterboxd account with that username. Check the spelling and try again.",
  private_watchlist:
    "This watchlist is set to private on Letterboxd. Make it public in your Letterboxd settings to use this feature.",
  empty_watchlist:
    "This Letterboxd watchlist is empty. Add some films on Letterboxd first!",
  rate_limited:
    "Letterboxd is a bit busy right now. Please try again in a minute.",
  network_error:
    "Something went wrong connecting to Letterboxd. Please try again.",
};

// Map HTTP status codes from the preview endpoint to ImportError codes
function httpStatusToError(status: number): ImportError {
  switch (status) {
    case 404:
      return "user_not_found";
    case 403:
      return "private_watchlist";
    case 422:
      return "empty_watchlist";
    case 429:
      return "rate_limited";
    default:
      return "network_error";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Multi-step Letterboxd watchlist import: username lookup, film matching, and bulk status save. */
export function LetterboxdImport({ onClose }: LetterboxdImportProps) {
  const [state, setState] = useState<ImportState>({ step: "idle" });
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const { setStatus } = useFilmStatus();

  // Focus management
  useEffect(() => {
    if (state.step === "idle") {
      inputRef.current?.focus();
    }
  }, [state.step]);

  useEffect(() => {
    if (state.step === "results") {
      resultsHeadingRef.current?.focus();
    }
  }, [state.step]);

  // Analytics: results viewed
  useEffect(() => {
    if (state.step === "results") {
      const { data } = state;
      const matchedWithScreenings = data.matched.filter(
        (f) => f.screenings.count > 0,
      );
      posthog.capture("letterboxd_import_results_viewed", {
        username: data.username,
        matched_count: data.matched.length,
        total_count: data.total,
        has_screenings: matchedWithScreenings.length > 0,
      });
    }
  }, [state]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const username = inputValue.trim();
      if (!username) return;

      posthog.capture("letterboxd_import_started", { username });
      setState({ step: "scraping", username });

      try {
        const res = await fetch("/api/letterboxd/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });

        if (!res.ok) {
          const errorCode = httpStatusToError(res.status);
          setState({ step: "error", error: errorCode, username });
          return;
        }

        const data: PreviewResponse = await res.json();
        setState({ step: "results", data });
      } catch {
        setState({ step: "error", error: "network_error", username });
      }
    },
    [inputValue],
  );

  const handleSave = useCallback(async () => {
    if (state.step !== "results") return;
    const { data } = state;
    const filmIds = data.matched.map((f) => f.filmId);
    if (filmIds.length === 0) return;

    setSaving(true);
    posthog.capture("letterboxd_import_saved", {
      username: data.username,
      films_saved: filmIds.length,
    });

    try {
      const res = await fetch("/api/user/import-letterboxd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filmIds,
          username: data.username,
          unmatchedEntries: data.unmatchedEntries,
        }),
      });

      if (res.ok) {
        // Update local store
        for (const film of data.matched) {
          setStatus(film.filmId, "want_to_see", {
            title: film.title,
            year: film.year,
            directors: film.directors,
            posterUrl: film.posterUrl,
          });
        }
        setSaved(true);
      }
    } catch {
      // Fail silently — the server save is best-effort here
    } finally {
      setSaving(false);
    }
  }, [state, setStatus]);

  const handleReset = useCallback(() => {
    setState({ step: "idle" });
    setInputValue("");
    setSaved(false);
    setSaving(false);
  }, []);

  return (
    <div
      role="region"
      aria-label="Import from Letterboxd"
      className="border border-border-default rounded-xl bg-background-secondary overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border-subtle">
        <h2 className="font-display text-text-primary text-base">
          Import from Letterboxd
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-background-tertiary transition-colors"
            aria-label="Close import panel"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="p-4">
        {state.step === "idle" && (
          <IdleView
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSubmit={handleSubmit}
            inputRef={inputRef}
          />
        )}

        {state.step === "scraping" && (
          <ScrapingView username={state.username} />
        )}

        {state.step === "results" && (
          <ResultsView
            data={state.data}
            saving={saving}
            saved={saved}
            onSave={handleSave}
            headingRef={resultsHeadingRef}
          />
        )}

        {state.step === "error" && (
          <ErrorView
            error={state.error}
            onRetry={handleReset}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Idle View
// ---------------------------------------------------------------------------

function IdleView({
  inputValue,
  onInputChange,
  onSubmit,
  inputRef,
}: {
  inputValue: string;
  onInputChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex items-stretch gap-2">
        <div className="flex items-center bg-background-tertiary rounded-lg border border-border-default overflow-hidden flex-1">
          <span className="px-3 text-sm text-text-tertiary shrink-0 select-none">
            letterboxd.com/
          </span>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="e.g. davidehrlich"
            className="flex-1 bg-transparent py-2 pr-3 text-sm text-text-primary placeholder:text-text-muted outline-none"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" variant="primary" size="md" disabled={!inputValue.trim()}>
          Find My Films
        </Button>
      </div>
      <p className="text-xs text-text-tertiary">
        Your watchlist needs to be public on Letterboxd for this to work.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Scraping View
// ---------------------------------------------------------------------------

function ScrapingView({ username }: { username: string }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center py-8 gap-4">
      <Loader2
        className="w-8 h-8 text-accent-primary animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      <div aria-live="polite" className="text-center">
        <p className="text-sm text-text-primary font-medium">
          {STATUS_MESSAGES[messageIndex]}
        </p>
        <p className="text-xs text-text-tertiary mt-1">@{username}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results View
// ---------------------------------------------------------------------------

function ResultsView({
  data,
  saving,
  saved,
  onSave,
  headingRef,
}: {
  data: PreviewResponse;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const withScreenings = data.matched.filter((f) => f.screenings.count > 0);
  const withoutScreenings = data.matched.filter(
    (f) => f.screenings.count === 0,
  );

  // Zero results
  if (data.matched.length === 0) {
    return (
      <div className="text-center py-8">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-text-primary text-lg outline-none"
        >
          None of your watchlist films are screening right now
        </h3>
        <p className="text-sm text-text-secondary mt-2 max-w-sm mx-auto">
          London cinema programmes change weekly — check back soon or sign up
          for alerts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Success banner */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-accent-success/10 border border-accent-success/20">
        <CheckCircle2
          className="w-5 h-5 text-accent-success shrink-0"
          aria-hidden="true"
        />
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-medium text-text-primary outline-none"
        >
          {data.matched.length} of your {data.total} watchlist films are
          screening in London
        </h3>
      </div>

      {/* Films with screenings */}
      {withScreenings.length > 0 && (
        <div className="space-y-2">
          {withScreenings.map((film) => (
            <ImportFilmCard key={film.filmId} film={film} />
          ))}
        </div>
      )}

      {/* Films without screenings */}
      {withoutScreenings.length > 0 && (
        <div>
          <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">
            Not currently screening
          </p>
          <div className="space-y-2">
            {withoutScreenings.map((film) => (
              <ImportFilmCardMinimal key={film.filmId} film={film} />
            ))}
          </div>
        </div>
      )}

      {/* Pending lookup note */}
      {data.pendingLookup > 0 && (
        <p className="text-xs text-text-tertiary">
          {data.pendingLookup} more films are being looked up in the background.
        </p>
      )}

      {/* Capped warning */}
      {data.capped && (
        <p className="text-xs text-text-tertiary">
          Only the first 500 films from your watchlist were checked.
        </p>
      )}

      {/* Auth CTA */}
      {!saved && (
        <>
          <SafeSignedOut>
            <AuthPrompt username={data.username} matchedCount={data.matched.length} />
          </SafeSignedOut>

          <SafeSignedIn>
            <Button
              variant="primary"
              fullWidth
              onClick={onSave}
              isLoading={saving}
              disabled={saving}
            >
              Add {data.matched.length} film
              {data.matched.length !== 1 ? "s" : ""} to your watchlist
            </Button>
          </SafeSignedIn>
        </>
      )}

      {/* Saved confirmation */}
      {saved && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-accent-primary/10 border border-accent-primary/20">
          <CheckCircle2
            className="w-5 h-5 text-accent-primary shrink-0"
            aria-hidden="true"
          />
          <p className="text-sm text-text-primary font-medium">
            {data.matched.length} film
            {data.matched.length !== 1 ? "s" : ""} added to your watchlist
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth prompt (for signed-out users)
// ---------------------------------------------------------------------------

function AuthPrompt({
  username,
  matchedCount,
}: {
  username: string;
  matchedCount: number;
}) {
  useEffect(() => {
    posthog.capture("letterboxd_import_signup_prompted", {
      username,
      matched_count: matchedCount,
    });
  }, [username, matchedCount]);

  return (
    <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-background-tertiary/50 border border-border-subtle">
      <p className="text-sm text-text-secondary text-center">
        Sign in to add these to your watchlist
      </p>
      <SignInButton mode="modal">
        <Button variant="primary">Sign In</Button>
      </SignInButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Film card (with screenings)
// ---------------------------------------------------------------------------

function ImportFilmCard({ film }: { film: EnrichedFilm }) {
  const handleClick = () => {
    posthog.capture("letterboxd_import_film_clicked", {
      film_id: film.filmId,
      film_title: film.title,
    });
  };

  const nextScreening = film.screenings.next;

  return (
    <Link
      href={`/film/${film.filmId}`}
      onClick={handleClick}
      className="flex gap-3 p-3 rounded-lg bg-background-tertiary/30 border border-border-subtle hover:border-border-default hover:bg-background-tertiary/50 transition-colors group"
    >
      {/* Poster */}
      <div className="relative w-12 h-[72px] rounded overflow-hidden bg-background-tertiary shrink-0">
        {film.posterUrl ? (
          <FilmPoster
            src={film.posterUrl}
            alt={film.title}
            fill
            className="object-cover"
            sizes="48px"
            placeholder="blur"
            blurDataURL={POSTER_BLUR}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film
              className="w-5 h-5 text-text-tertiary"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-display text-text-primary text-sm group-hover:text-accent-primary transition-colors truncate">
            {film.title}
          </h4>
          {film.screenings.isLastChance && (
            <Badge variant="danger" size="sm">
              Last chance
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-text-tertiary mt-0.5">
          {film.year && <span>{film.year}</span>}
          {film.directors.length > 0 && (
            <>
              <span className="text-border-subtle">&middot;</span>
              <span className="truncate">{film.directors[0]}</span>
            </>
          )}
        </div>

        {/* Next screening */}
        {nextScreening && (
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            <span className="text-xs text-text-secondary">
              {format(new Date(nextScreening.datetime), "EEE d MMM, HH:mm")} —{" "}
              {nextScreening.cinemaName}
            </span>
            {nextScreening.format && (
              <FormatBadge format={nextScreening.format} />
            )}
          </div>
        )}

        {/* Additional screenings count */}
        {film.screenings.count > 1 && (
          <p className="text-xs text-accent-primary mt-1">
            +{film.screenings.count - 1} more screening
            {film.screenings.count - 1 !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Film card (no screenings — minimal)
// ---------------------------------------------------------------------------

function ImportFilmCardMinimal({ film }: { film: EnrichedFilm }) {
  const handleClick = () => {
    posthog.capture("letterboxd_import_film_clicked", {
      film_id: film.filmId,
      film_title: film.title,
    });
  };

  return (
    <Link
      href={`/film/${film.filmId}`}
      onClick={handleClick}
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-background-tertiary/30 transition-colors group"
    >
      {/* Poster */}
      <div className="relative w-8 h-12 rounded overflow-hidden bg-background-tertiary shrink-0">
        {film.posterUrl ? (
          <FilmPoster
            src={film.posterUrl}
            alt={film.title}
            fill
            className="object-cover"
            sizes="32px"
            placeholder="blur"
            blurDataURL={POSTER_BLUR}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film
              className="w-4 h-4 text-text-tertiary"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-sm min-w-0">
        <span className="text-text-secondary group-hover:text-text-primary transition-colors truncate">
          {film.title}
        </span>
        {film.year && (
          <span className="text-text-muted text-xs shrink-0">
            ({film.year})
          </span>
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Error View
// ---------------------------------------------------------------------------

function ErrorView({
  error,
  onRetry,
}: {
  error: ImportError;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center py-6 gap-4 text-center">
      <div className="w-10 h-10 rounded-full bg-accent-danger/10 flex items-center justify-center">
        <AlertCircle
          className="w-5 h-5 text-accent-danger"
          aria-hidden="true"
        />
      </div>
      <p className="text-sm text-text-secondary max-w-sm">
        {ERROR_MESSAGES[error]}
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
