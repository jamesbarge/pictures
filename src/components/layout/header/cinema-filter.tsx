"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { MapPin, Search, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFilters } from "@/stores/filters";
import { MobileCinemaPickerModal } from "@/components/filters/mobile-cinema-picker-modal";
import type { Cinema } from "./types";

/** Cinema Filter Component */
export function CinemaFilter({ cinemas, mounted }: { cinemas: Cinema[]; mounted: boolean; fullWidth?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { cinemaIds, toggleCinema, setCinemas } = useFilters();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Filter cinemas by search term - matches if ALL words appear in name, shortName, or chain
  const filteredCinemas = useMemo(() => {
    if (!searchTerm.trim()) return cinemas;
    const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    return cinemas.filter((c) => {
      const searchableText = [
        c.name.toLowerCase(),
        c.shortName?.toLowerCase() || "",
        c.chain?.toLowerCase() || "",
      ].join(" ");
      return searchWords.every((word) => searchableText.includes(word));
    });
  }, [cinemas, searchTerm]);

  const displayText = useMemo(() => {
    if (!mounted || cinemaIds.length === 0) return "All Cinemas";
    if (cinemaIds.length === 1) {
      const cinema = cinemas.find((c) => c.id === cinemaIds[0]);
      return cinema?.shortName || cinema?.name || "1 Cinema";
    }
    return `${cinemaIds.length} Cinemas`;
  }, [mounted, cinemaIds, cinemas]);

  const hasSelection = mounted && cinemaIds.length > 0;

  const handleButtonClick = () => {
    // On mobile (< 640px), open full-screen modal instead of dropdown
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setIsMobileModalOpen(true);
    } else {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleButtonClick}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors min-w-[140px]",
          hasSelection
            ? "bg-accent-primary/10 border-accent-primary/30 text-accent-primary"
            : "bg-background-secondary border-border-default text-text-secondary hover:border-border-emphasis hover:text-text-primary"
        )}
      >
        <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left truncate">{displayText}</span>
        <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 sm:left-0 sm:right-auto mt-2 z-50 w-[calc(100vw-2rem)] sm:w-72 max-w-72 bg-background-secondary border border-border-default rounded-xl shadow-elevated overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-border-subtle">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search cinemas..."
                className="w-full pl-9 pr-3 py-2 bg-background-tertiary rounded-lg text-sm text-text-primary placeholder:text-text-tertiary border border-border-subtle focus:outline-none focus:border-border-emphasis"
              />
            </div>
          </div>

          {/* Cinema List */}
          <div className="max-h-64 overflow-y-auto p-2">
            {/* All Cinemas option */}
            <button
              onClick={() => {
                setCinemas([]);
                setIsOpen(false);
                setSearchTerm("");
              }}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                cinemaIds.length === 0
                  ? "bg-accent-primary/10 text-accent-primary"
                  : "text-text-secondary hover:bg-background-hover hover:text-text-primary"
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                  cinemaIds.length === 0 ? "bg-accent-primary border-accent-primary" : "border-border-default"
                )}
              >
                {cinemaIds.length === 0 && <Check className="w-3 h-3 text-text-inverse" aria-hidden="true" />}
              </div>
              All Cinemas
            </button>

            {/* Divider */}
            <div className="h-px bg-border-subtle my-2" />

            {/* Individual Cinemas */}
            {filteredCinemas.map((cinema) => {
              const isSelected = cinemaIds.includes(cinema.id);
              return (
                <button
                  key={cinema.id}
                  onClick={() => toggleCinema(cinema.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2",
                    isSelected
                      ? "bg-accent-primary/10 text-accent-primary"
                      : "text-text-secondary hover:bg-background-hover hover:text-text-primary"
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                      isSelected ? "bg-accent-primary border-accent-primary" : "border-border-default"
                    )}
                  >
                    {isSelected && <Check className="w-3 h-3 text-text-inverse" aria-hidden="true" />}
                  </div>
                  <span className="truncate">{cinema.name}</span>
                </button>
              );
            })}

            {filteredCinemas.length === 0 && (
              <p className="px-3 py-4 text-sm text-text-tertiary text-center">
                No cinemas found
              </p>
            )}
          </div>

          {/* Clear Selection */}
          {cinemaIds.length > 0 && (
            <div className="border-t border-border-subtle p-2">
              <button
                onClick={() => {
                  setCinemas([]);
                  setSearchTerm("");
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-text-tertiary hover:bg-background-hover hover:text-text-primary transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mobile Full-Screen Modal */}
      <MobileCinemaPickerModal
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
        cinemas={cinemas}
      />
    </div>
  );
}
