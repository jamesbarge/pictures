/**
 * Mobile Cinema Picker Modal
 * Full-screen modal for cinema selection on mobile devices
 * Follows the same pattern as MobileDatePickerModal
 */

"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { X, Search, Check, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFilters, isIndependentCinema } from "@/stores/filters";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

interface Cinema {
  id: string;
  name: string;
  shortName: string | null;
  chain: string | null;
}

interface MobileCinemaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  cinemas: Cinema[];
}

export function MobileCinemaPickerModal({ isOpen, onClose, cinemas }: MobileCinemaPickerModalProps) {
  const { cinemaIds, toggleCinema, setCinemas } = useFilters();
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll when modal is open
  useBodyScrollLock(isOpen);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      // Small delay to ensure modal is rendered
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Clear search when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
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

  // Group cinemas by chain vs independent
  const { chainCinemas, independentCinemas } = useMemo(() => {
    const chains: Cinema[] = [];
    const independents: Cinema[] = [];

    filteredCinemas.forEach(cinema => {
      if (isIndependentCinema(cinema.chain)) {
        independents.push(cinema);
      } else {
        chains.push(cinema);
      }
    });

    return { chainCinemas: chains, independentCinemas: independents };
  }, [filteredCinemas]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background-secondary animate-in slide-in-from-bottom duration-300">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-background-primary">
        <h2 className="text-lg font-semibold text-text-primary">Select Cinemas</h2>
        <button
          onClick={onClose}
          className="p-2 -mr-2 rounded-lg hover:bg-background-tertiary transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-text-secondary" />
        </button>
      </header>

      {/* Search Input - Sticky below header */}
      <div className="px-4 py-3 border-b border-border-subtle bg-background-primary">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search cinemas..."
            // Use text-base (16px) to prevent iOS zoom
            className="w-full pl-10 pr-4 py-3 bg-background-tertiary rounded-xl text-base text-text-primary placeholder:text-text-tertiary border border-border-subtle focus:outline-none focus:border-accent-primary"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-background-hover text-text-tertiary"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* All Cinemas option */}
        <div className="px-4 pt-4">
          <button
            onClick={() => setCinemas([])}
            className={cn(
              "w-full text-left px-4 py-3 rounded-xl text-base transition-colors flex items-center gap-3",
              cinemaIds.length === 0
                ? "bg-accent-primary/10 text-accent-primary"
                : "bg-background-tertiary text-text-secondary hover:bg-background-hover hover:text-text-primary"
            )}
          >
            <div
              className={cn(
                "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                cinemaIds.length === 0 ? "bg-accent-primary border-accent-primary" : "border-border-default"
              )}
            >
              {cinemaIds.length === 0 && <Check className="w-3.5 h-3.5 text-text-inverse" />}
            </div>
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="font-medium">All Cinemas</span>
          </button>
        </div>

        {/* Selection count */}
        {cinemaIds.length > 0 && (
          <div className="px-4 pt-4">
            <p className="text-sm text-text-tertiary">
              {cinemaIds.length} cinema{cinemaIds.length !== 1 ? 's' : ''} selected
            </p>
          </div>
        )}

        {/* Independent Cinemas Section */}
        {independentCinemas.length > 0 && (
          <section className="px-4 pt-4">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-1">
              Independent Cinemas
            </h3>
            <div className="space-y-1">
              {independentCinemas.map((cinema) => {
                const isSelected = cinemaIds.includes(cinema.id);
                return (
                  <button
                    key={cinema.id}
                    onClick={() => toggleCinema(cinema.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded-xl text-base transition-colors flex items-center gap-3",
                      isSelected
                        ? "bg-accent-primary/10 text-accent-primary"
                        : "bg-background-tertiary text-text-secondary hover:bg-background-hover hover:text-text-primary"
                    )}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                        isSelected ? "bg-accent-primary border-accent-primary" : "border-border-default"
                      )}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-text-inverse" />}
                    </div>
                    <span className="truncate">{cinema.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Chain Cinemas Section */}
        {chainCinemas.length > 0 && (
          <section className="px-4 pt-4 pb-4">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-1">
              Cinema Chains
            </h3>
            <div className="space-y-1">
              {chainCinemas.map((cinema) => {
                const isSelected = cinemaIds.includes(cinema.id);
                return (
                  <button
                    key={cinema.id}
                    onClick={() => toggleCinema(cinema.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded-xl text-base transition-colors flex items-center gap-3",
                      isSelected
                        ? "bg-accent-primary/10 text-accent-primary"
                        : "bg-background-tertiary text-text-secondary hover:bg-background-hover hover:text-text-primary"
                    )}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                        isSelected ? "bg-accent-primary border-accent-primary" : "border-border-default"
                      )}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-text-inverse" />}
                    </div>
                    <span className="truncate">{cinema.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Empty state */}
        {filteredCinemas.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-base text-text-tertiary">No cinemas found</p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="mt-2 text-sm text-accent-primary hover:text-accent-primary-hover"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sticky Footer */}
      <div className="px-4 py-3 border-t border-border-subtle bg-background-primary safe-area-bottom">
        <div className="flex gap-3">
          {cinemaIds.length > 0 && (
            <button
              onClick={() => setCinemas([])}
              className="flex-1 py-3 rounded-xl bg-background-tertiary text-text-secondary font-semibold text-base hover:bg-background-hover transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className={cn(
              "py-3 rounded-xl bg-accent-primary text-text-inverse font-semibold text-base hover:bg-accent-primary-hover transition-colors",
              cinemaIds.length > 0 ? "flex-1" : "w-full"
            )}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
