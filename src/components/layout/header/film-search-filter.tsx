"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, MapPin, X, Film } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFilters } from "@/stores/filters";

interface FilmSuggestion {
  id: string;
  title: string;
  year: number | null;
  directors: string[];
  posterUrl: string | null;
}

interface CinemaSuggestion {
  id: string;
  name: string;
  shortName: string | null;
  address: string | null;
}

/** Film Search Filter Component */
export function FilmSearchFilter({ mounted }: { mounted: boolean }) {
  const { filmSearch, setFilmSearch } = useFilters();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<FilmSuggestion[]>([]);
  const [cinemaSuggestions, setCinemaSuggestions] = useState<CinemaSuggestion[]>([]);
  const [allFilms, setAllFilms] = useState<FilmSuggestion[]>([]);
  const [allCinemas, setAllCinemas] = useState<CinemaSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Fetch all films and cinemas once for browse mode
  useEffect(() => {
    async function fetchBrowseData() {
      try {
        const res = await fetch("/api/films/search?browse=true");
        const data = await res.json();
        setAllFilms(data.results || []);
        setAllCinemas(data.cinemas || []);
      } catch {
        setAllFilms([]);
        setAllCinemas([]);
      }
    }
    fetchBrowseData();
  }, []);

  // Fetch suggestions with debounce when searching
  useEffect(() => {
    // If no search term, don't fetch (we'll use browse data)
    if (!filmSearch.trim()) {
      setSuggestions([]);
      setCinemaSuggestions([]);
      return;
    }

    if (filmSearch.length < 2) {
      setSuggestions([]);
      setCinemaSuggestions([]);
      return;
    }

    const debounceTimer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/films/search?q=${encodeURIComponent(filmSearch)}`);
        const data = await res.json();
        setSuggestions(data.results || []);
        setCinemaSuggestions(data.cinemas || []);
      } catch {
        setSuggestions([]);
        setCinemaSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(debounceTimer);
  }, [filmSearch]);

  // Get display lists: search results if searching, all data if browsing
  const displayFilms = filmSearch.trim() ? suggestions : allFilms;
  const displayCinemas = filmSearch.trim() ? cinemaSuggestions : allCinemas;
  // Combined list for keyboard navigation: films first, then cinemas
  const displayList = useMemo(
    () => [
      ...displayFilms.map(f => ({ type: "film" as const, item: f })),
      ...displayCinemas.map(c => ({ type: "cinema" as const, item: c })),
    ],
    [displayFilms, displayCinemas]
  );

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const router = useRouter();

  const handleSelectFilm = useCallback((film: FilmSuggestion) => {
    setFilmSearch(film.title);
    setSuggestions([]);
    setCinemaSuggestions([]);
    setIsFocused(false);
    inputRef.current?.blur();
  }, [setFilmSearch]);

  const handleSelectCinema = useCallback((cinema: CinemaSuggestion) => {
    setFilmSearch("");
    setSuggestions([]);
    setCinemaSuggestions([]);
    setIsFocused(false);
    inputRef.current?.blur();
    router.push(`/cinemas/${cinema.id}`);
  }, [setFilmSearch, router]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }

      if (document.activeElement === inputRef.current) {
        if (e.key === "Escape") {
          setFilmSearch("");
          setSuggestions([]);
          setCinemaSuggestions([]);
          inputRef.current?.blur();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, displayList.length - 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, -1));
        } else if (e.key === "Enter" && selectedIndex >= 0 && displayList[selectedIndex]) {
          e.preventDefault();
          const selected = displayList[selectedIndex];
          if (selected.type === 'cinema') {
            handleSelectCinema(selected.item as CinemaSuggestion);
          } else {
            handleSelectFilm(selected.item as FilmSuggestion);
          }
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setFilmSearch, displayList, selectedIndex, handleSelectFilm, handleSelectCinema]);

  // Reset selection when display lists change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [displayList]);

  const hasValue = mounted && filmSearch.trim();
  const showShortcutHint = !isFocused && !hasValue;
  const showDropdown = isFocused && (displayFilms.length > 0 || displayCinemas.length > 0 || isLoading);

  return (
    <div ref={containerRef} className="relative flex-1 max-w-xs">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none z-10" aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        value={mounted ? filmSearch : ""}
        onChange={(e) => setFilmSearch(e.target.value)}
        onFocus={() => setIsFocused(true)}
        placeholder="Search..."
        aria-label="Search films and cinemas"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="film-search-listbox"
        aria-autocomplete="list"
        autoComplete="off"
        className={cn(
          "w-full pl-9 py-2 rounded-lg border bg-background-secondary text-sm text-text-primary placeholder:text-text-tertiary",
          "transition-colors duration-150",
          "focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary",
          hasValue
            ? "border-accent-primary/40 pr-8"
            : "border-border-default hover:border-border-emphasis pr-16"
        )}
      />
      {/* Keyboard shortcut hint - right side, vertically centered */}
      {showShortcutHint && (
        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
          <kbd className="hidden sm:inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 text-[11px] font-mono text-text-muted bg-background-tertiary rounded border border-border-subtle leading-none">
            <span>⌘</span><span>K</span>
          </kbd>
        </div>
      )}
      {/* Clear button */}
      {hasValue && (
        <button
          onClick={() => {
            setFilmSearch("");
            setSuggestions([]);
            setCinemaSuggestions([]);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-surface-overlay-hover text-text-tertiary hover:text-text-primary transition-colors z-10"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}

      {/* Search Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-background-secondary border border-border-default rounded-xl shadow-elevated overflow-hidden">
          {/* Header showing counts in browse mode */}
          {!filmSearch.trim() && (displayCinemas.length > 0 || displayFilms.length > 0) && (
            <div className="px-3 py-2 border-b border-border-subtle text-xs text-text-tertiary">
              {displayFilms.length} films, {displayCinemas.length} cinemas • scroll to browse
            </div>
          )}
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-text-tertiary">Searching...</div>
          ) : (
            <ul id="film-search-listbox" role="listbox" className="max-h-96 overflow-y-auto">
              {/* Film Results - shown first */}
              {displayFilms.length > 0 && (
                <>
                  {filmSearch.trim() && (
                    <li className="px-3 py-1.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider bg-background-tertiary/50">
                      Films
                    </li>
                  )}
                  {displayFilms.map((film, index) => (
                    <li key={`film-${film.id}`} role="option" aria-selected={index === selectedIndex}>
                      <button
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectFilm(film);
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                          index === selectedIndex
                            ? "bg-accent-primary/10 text-text-primary"
                            : "text-text-secondary hover:bg-background-hover"
                        )}
                      >
                        {/* Mini Poster */}
                        <div className="w-8 h-12 rounded overflow-hidden bg-background-tertiary shrink-0">
                          {film.posterUrl && !film.posterUrl.includes('poster-placeholder') ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={film.posterUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-text-tertiary">
                              <Film className="w-3 h-3" aria-hidden="true" />
                            </div>
                          )}
                        </div>
                        {/* Film Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {film.title}
                            {film.year && (
                              <span className="text-text-tertiary font-normal ml-1">
                                ({film.year})
                              </span>
                            )}
                          </div>
                          {film.directors.length > 0 && (
                            <div className="text-xs text-text-tertiary truncate">
                              {film.directors.slice(0, 2).join(", ")}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </>
              )}

              {/* Cinema Results - shown after films */}
              {displayCinemas.length > 0 && (
                <>
                  {filmSearch.trim() && (
                    <li className="px-3 py-1.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider bg-background-tertiary/50">
                      Cinemas
                    </li>
                  )}
                  {displayCinemas.map((cinema, index) => {
                    const globalIndex = displayFilms.length + index;
                    const addressText = typeof cinema.address === "string" ? cinema.address : null;
                    return (
                      <li key={`cinema-${cinema.id}`} role="option" aria-selected={globalIndex === selectedIndex}>
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectCinema(cinema);
                          }}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                            globalIndex === selectedIndex
                              ? "bg-accent-primary/10 text-text-primary"
                              : "text-text-secondary hover:bg-background-hover"
                          )}
                        >
                          {/* Cinema Icon */}
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-accent-primary/10 shrink-0 flex items-center justify-center">
                            <MapPin className="w-4 h-4 text-accent-primary" aria-hidden="true" />
                          </div>
                          {/* Cinema Info */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {cinema.name}
                            </div>
                            {addressText && (
                              <div className="text-xs text-text-tertiary truncate">
                                {addressText}
                              </div>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </>
              )}

              {/* Empty state */}
              {displayCinemas.length === 0 && displayFilms.length === 0 && filmSearch.trim() && (
                <li className="px-4 py-6 text-center text-sm text-text-tertiary">
                  No results found
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
