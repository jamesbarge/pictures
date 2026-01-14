/**
 * Not Interested List Component
 * Displays films the user has marked as "not interested" with option to restore
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useUser } from "@/hooks/useClerkSafe";
import { useFilmStatus } from "@/stores/film-status";
import { Button } from "@/components/ui";
import { RotateCcw, Film, Loader2 } from "lucide-react";
import { deleteFilmStatus } from "@/lib/sync/user-sync-service";

// Blur placeholder for poster images to prevent CLS
const POSTER_BLUR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAPCAYAAADd/14OAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAKklEQVQoz2Nk+M/AQAxgZGBg+M9AB2BkYGBgZGRgYGCgF2D4T7wexAAGABPmAhHXnXDuAAAAAElFTkSuQmCC";

export function NotInterestedList() {
  const { getNotInterestedFilms, removeFilm } = useFilmStatus();
  const [mounted, setMounted] = useState(false);
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());
  const { isSignedIn } = useUser();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Must define all hooks before any conditional returns (React rules of hooks)
  const handleRestore = useCallback(async (filmId: string) => {
    // Show loading state (also prevents double-clicks via disabled button)
    setRestoringIds(prev => new Set(prev).add(filmId));

    try {
      // If signed in, delete from server FIRST to prevent sync from re-adding it
      if (isSignedIn) {
        await deleteFilmStatus(filmId);
      }

      // Then remove from local state
      removeFilm(filmId);
    } catch (error) {
      console.error("[Restore] Failed to delete film status:", error);
      // Still remove locally even if server delete fails - user can try again
      removeFilm(filmId);
    } finally {
      // Clean up loading state (film should be gone, but just in case)
      setRestoringIds(prev => {
        const next = new Set(prev);
        next.delete(filmId);
        return next;
      });
    }
  }, [isSignedIn, removeFilm]);

  // Don't render until mounted to avoid hydration mismatch
  // Skeleton dimensions match actual content to prevent CLS
  if (!mounted) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-3 rounded-lg bg-background-secondary border border-border-subtle animate-pulse"
          >
            <div className="w-10 h-[60px] bg-background-tertiary rounded shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="h-4 bg-background-tertiary rounded w-32 mb-2" />
              <div className="h-3 bg-background-tertiary rounded w-24" />
            </div>
            <div className="w-20 h-8 bg-background-tertiary rounded shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  const notInterestedFilms = getNotInterestedFilms();

  if (notInterestedFilms.length === 0) {
    return (
      <div className="text-center py-8 px-4 rounded-lg bg-background-secondary/50 border border-border-subtle">
        <Film className="w-8 h-8 mx-auto mb-3 text-text-tertiary" />
        <p className="text-text-secondary text-sm">
          No hidden films
        </p>
        <p className="text-text-tertiary text-xs mt-1">
          Films you mark as &quot;not interested&quot; will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notInterestedFilms.map((film) => (
        <div
          key={film.filmId}
          className="flex items-center gap-4 p-3 rounded-lg bg-background-secondary border border-border-subtle hover:border-border-default transition-colors"
        >
          {/* Poster thumbnail */}
          <div className="relative w-10 h-[60px] rounded overflow-hidden bg-background-tertiary shrink-0">
            {film.posterUrl ? (
              <Image
                src={film.posterUrl}
                alt=""
                fill
                className="object-cover"
                sizes="40px"
                placeholder="blur"
                blurDataURL={POSTER_BLUR}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Film className="w-4 h-4 text-text-tertiary" />
              </div>
            )}
          </div>

          {/* Film info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-sm text-text-primary truncate">
              {film.title}
              {film.year && (
                <span className="text-text-tertiary font-body text-xs ml-1">
                  ({film.year})
                </span>
              )}
            </h3>
            {film.directors && film.directors.length > 0 && (
              <p className="text-xs text-text-secondary truncate">
                {film.directors[0]}
              </p>
            )}
          </div>

          {/* Restore button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRestore(film.filmId)}
            disabled={restoringIds.has(film.filmId)}
            className="shrink-0"
          >
            {restoringIds.has(film.filmId) ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Restoring...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4 mr-1.5" />
                Restore
              </>
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}
