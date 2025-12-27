/**
 * Search Dialog Component
 * Cmd+K style search palette for finding films
 */

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, X, Film, Calendar, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { trackSearch, trackSearchResultClick } from "@/lib/analytics";

interface SearchResult {
  id: string;
  title: string;
  year: number | null;
  directors: string[];
  posterUrl: string | null;
  screeningCount: number;
}

export function SearchDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Handle keyboard shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Search debounce
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.films);
          setSelectedIndex(0);
          // Track search performed
          trackSearch(query, data.films.length);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const navigateToFilm = useCallback((film: SearchResult, resultIndex: number) => {
    // Track search result click
    trackSearchResultClick(
      query,
      { filmId: film.id, filmTitle: film.title, filmYear: film.year },
      resultIndex
    );
    setIsOpen(false);
    router.push(`/film/${film.id}`);
  }, [router, query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        navigateToFilm(results[selectedIndex], selectedIndex);
      }
    },
    [results, selectedIndex, navigateToFilm]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={() => setIsOpen(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-x-4 top-[15%] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-lg z-50">
        <div className="bg-background-secondary border border-border-default rounded-xl shadow-elevated overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 border-b border-border-subtle">
            <Search className="w-5 h-5 text-text-tertiary shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search films..."
              className="flex-1 py-4 bg-transparent text-text-primary placeholder:text-text-tertiary outline-none text-lg"
            />
            {isLoading && (
              <Loader2 className="w-5 h-5 text-text-tertiary animate-spin" />
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-surface-overlay-hover text-text-tertiary hover:text-text-primary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {results.length > 0 ? (
              <div className="py-2">
                {results.map((film, index) => (
                  <button
                    key={film.id}
                    onClick={() => navigateToFilm(film, index)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                      selectedIndex === index
                        ? "bg-accent-primary/10"
                        : "hover:bg-surface-overlay-hover"
                    )}
                  >
                    {/* Poster */}
                    <div className="w-10 h-14 rounded overflow-hidden bg-background-tertiary shrink-0">
                      {film.posterUrl ? (
                        <Image
                          src={film.posterUrl}
                          alt=""
                          width={40}
                          height={56}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film className="w-5 h-5 text-text-tertiary" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-text-primary truncate">
                          {film.title}
                        </span>
                        {film.year && (
                          <span className="text-sm text-text-tertiary shrink-0">
                            ({film.year})
                          </span>
                        )}
                      </div>
                      {film.directors.length > 0 && (
                        <p className="text-sm text-text-secondary truncate">
                          {film.directors.join(", ")}
                        </p>
                      )}
                    </div>

                    {/* Screening Count */}
                    {film.screeningCount > 0 && (
                      <div className="flex items-center gap-1 text-xs text-accent-highlight-dark shrink-0">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{film.screeningCount}</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : query.trim() && !isLoading ? (
              <div className="py-12 text-center">
                <Film className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
                <p className="text-text-secondary">No films found</p>
                <p className="text-sm text-text-tertiary mt-1">
                  Try a different search term
                </p>
              </div>
            ) : !query.trim() ? (
              <div className="py-8 px-4 text-center">
                <p className="text-text-tertiary text-sm">
                  Start typing to search films...
                </p>
                <div className="flex justify-center gap-4 mt-4 text-xs text-text-tertiary">
                  <span>
                    <kbd className="px-1.5 py-0.5 bg-background-tertiary rounded border border-border-subtle">
                      ↑↓
                    </kbd>{" "}
                    Navigate
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 bg-background-tertiary rounded border border-border-subtle">
                      ↵
                    </kbd>{" "}
                    Select
                  </span>
                  <span>
                    <kbd className="px-1.5 py-0.5 bg-background-tertiary rounded border border-border-subtle">
                      Esc
                    </kbd>{" "}
                    Close
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Search Trigger Button
 * Shows in the header and opens the search dialog
 */
export function SearchTrigger() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-lg hover:bg-surface-overlay-hover text-text-secondary hover:text-text-primary transition-colors"
        title="Search (⌘K)"
      >
        <Search className="w-5 h-5" />
      </button>
      {isOpen && <SearchDialogPortal onClose={() => setIsOpen(false)} />}
    </>
  );
}

function SearchDialogPortal(_: { onClose: () => void }) {
  // This is a simplified version - in practice you'd use a portal
  // For now, the SearchDialog handles its own open state
  void _; // Acknowledge unused parameter
  return null;
}
