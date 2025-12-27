/**
 * Not Interested List Component
 * Displays films the user has marked as "not interested" with option to restore
 */

"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useFilmStatus } from "@/stores/film-status";
import { Button } from "@/components/ui";
import { RotateCcw, Film } from "lucide-react";

export function NotInterestedList() {
  const { getNotInterestedFilms, removeFilm } = useFilmStatus();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Standard hydration pattern
    setMounted(true);
  }, []);

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-3 rounded-lg bg-background-secondary border border-border-subtle animate-pulse"
          >
            <div className="w-12 h-18 bg-background-tertiary rounded" />
            <div className="flex-1">
              <div className="h-4 bg-background-tertiary rounded w-32 mb-2" />
              <div className="h-3 bg-background-tertiary rounded w-24" />
            </div>
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

  const handleRestore = (filmId: string) => {
    removeFilm(filmId);
  };

  return (
    <div className="space-y-2">
      {notInterestedFilms.map((film) => (
        <div
          key={film.filmId}
          className="flex items-center gap-4 p-3 rounded-lg bg-background-secondary border border-border-subtle hover:border-border-default transition-colors"
        >
          {/* Poster thumbnail */}
          <div className="relative w-10 h-15 rounded overflow-hidden bg-background-tertiary shrink-0">
            {film.posterUrl ? (
              <Image
                src={film.posterUrl}
                alt=""
                fill
                className="object-cover"
                sizes="40px"
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
            className="shrink-0"
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Restore
          </Button>
        </div>
      ))}
    </div>
  );
}
