/**
 * Cinema Selector Component
 * Allows users to toggle which cinemas appear in their calendar
 */

"use client";

import { useEffect, useState, useMemo } from "react";
import { MapPin, Check, Globe, Clapperboard, Search, X, ChevronDown } from "lucide-react";
import { useFilters } from "@/stores/filters";
import { cn } from "@/lib/cn";

interface Cinema {
  id: string;
  name: string;
  shortName: string | null;
  chain: string | null;
  website: string | null;
  address: {
    street?: string;
    city?: string;
    postcode?: string;
    area?: string;
  } | null;
  features: string[];
}

interface CinemaSelectorProps {
  cinemas: Cinema[];
}

export function CinemaSelector({ cinemas }: CinemaSelectorProps) {
  // Use the same filters store as the header - this ensures Settings and Header are synced
  const { cinemaIds, toggleCinema, setCinemas } = useFilters();

  // Handle hydration mismatch by only rendering after mount
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [groupByArea, setGroupByArea] = useState(true);
  const [collapsedAreas, setCollapsedAreas] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter cinemas by search term
  const filteredCinemas = useMemo(() => {
    if (!searchTerm.trim()) return cinemas;
    const term = searchTerm.toLowerCase();
    return cinemas.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.shortName?.toLowerCase().includes(term) ||
        c.address?.area?.toLowerCase().includes(term) ||
        c.chain?.toLowerCase().includes(term)
    );
  }, [cinemas, searchTerm]);

  // Group cinemas by area
  const groupedCinemas = useMemo(() => {
    const groups = new Map<string, Cinema[]>();

    for (const cinema of filteredCinemas) {
      const area = cinema.address?.area || "Other";
      if (!groups.has(area)) {
        groups.set(area, []);
      }
      groups.get(area)!.push(cinema);
    }

    // Sort areas alphabetically, but put "Other" at the end
    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === "Other") return 1;
      if (b[0] === "Other") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [filteredCinemas]);

  const toggleAreaCollapse = (area: string) => {
    setCollapsedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) {
        next.delete(area);
      } else {
        next.add(area);
      }
      return next;
    });
  };

  const selectArea = (areaCinemas: Cinema[]) => {
    const areaIds = areaCinemas.map((c) => c.id);
    const showingAll = cinemaIds.length === 0;
    const allInArea = showingAll || areaIds.every((id) => cinemaIds.includes(id));

    if (allInArea) {
      // Deselect all in area - if showing all, set to all except this area
      if (showingAll) {
        setCinemas(cinemas.filter((c) => !areaIds.includes(c.id)).map((c) => c.id));
      } else {
        const newSelection = cinemaIds.filter((id) => !areaIds.includes(id));
        setCinemas(newSelection);
      }
    } else {
      // Select all in area
      const newSelection = [...new Set([...cinemaIds, ...areaIds])];
      setCinemas(newSelection);
    }
  };

  // NOTE: Empty cinemaIds means "All Cinemas" - no auto-population needed
  // The UI should display this as "all selected" visually but keep array empty
  // This allows clearAllFilters() to work correctly
  const isShowingAll = cinemaIds.length === 0;

  // Smart toggle: when showing all, clicking a cinema should deselect it
  // (meaning "all except this one")
  const handleToggleCinema = (cinemaId: string) => {
    if (isShowingAll) {
      // User is deselecting one cinema from "all" - set to all except this one
      setCinemas(cinemas.filter((c) => c.id !== cinemaId).map((c) => c.id));
    } else {
      toggleCinema(cinemaId);
    }
  };

  if (!mounted) {
    // Render skeleton while hydrating
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {cinemas.map((cinema) => (
          <div
            key={cinema.id}
            className="p-4 rounded-lg border border-border-subtle bg-background-secondary animate-pulse"
          >
            <div className="h-6 w-32 bg-background-tertiary rounded mb-2" />
            <div className="h-4 w-24 bg-background-tertiary rounded" />
          </div>
        ))}
      </div>
    );
  }

  // Empty cinemaIds = "All Cinemas" (no filter), so treat it as allSelected
  const allSelected = isShowingAll || cinemaIds.length === cinemas.length;
  // "Clear All" should be disabled when already in "All Cinemas" mode (empty array)
  const clearDisabled = isShowingAll;

  return (
    <div>
      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search cinemas by name or area..."
          className="w-full pl-10 pr-10 py-2.5 bg-background-secondary border border-border-default rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary/50 focus:ring-2 focus:ring-accent-primary/20 transition-colors"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-surface-overlay-hover rounded transition-colors"
            aria-label="Clear search"
          >
            <X className="w-4 h-4 text-text-tertiary" />
          </button>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setCinemas(cinemas.map((c) => c.id))}
          disabled={allSelected}
          className={cn(
            "px-3 py-1.5 text-sm rounded-lg border transition-colors",
            allSelected
              ? "border-border-subtle text-text-tertiary cursor-not-allowed"
              : "border-border-default text-text-secondary hover:text-text-primary hover:border-border-emphasis"
          )}
        >
          Select All
        </button>
        <button
          onClick={() => setCinemas([])}
          disabled={clearDisabled}
          className={cn(
            "px-3 py-1.5 text-sm rounded-lg border transition-colors",
            clearDisabled
              ? "border-border-subtle text-text-tertiary cursor-not-allowed"
              : "border-border-default text-text-secondary hover:text-text-primary hover:border-border-emphasis"
          )}
        >
          Clear All
        </button>
        <button
          onClick={() => setGroupByArea(!groupByArea)}
          className={cn(
            "px-3 py-1.5 text-sm rounded-lg border transition-colors ml-auto",
            groupByArea
              ? "border-accent-primary/40 bg-accent-primary/10 text-accent-primary"
              : "border-border-default text-text-secondary hover:text-text-primary hover:border-border-emphasis"
          )}
        >
          Group by Area
        </button>
      </div>

      {/* Selected Count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-tertiary">
          {isShowingAll ? "All" : cinemaIds.length} of {cinemas.length} cinemas selected
        </p>
        {searchTerm && (
          <p className="text-sm text-text-tertiary">
            Showing {filteredCinemas.length} results
          </p>
        )}
      </div>

      {/* Grouped View */}
      {groupByArea ? (
        <div className="space-y-6">
          {groupedCinemas.map(([area, areaCinemas]) => {
            const isCollapsed = collapsedAreas.has(area);
            const selectedInArea = isShowingAll
              ? areaCinemas.length
              : areaCinemas.filter((c) => cinemaIds.includes(c.id)).length;
            const allInAreaSelected = isShowingAll || selectedInArea === areaCinemas.length;

            return (
              <div key={area} className="border border-border-subtle rounded-xl overflow-hidden shadow-card">
                {/* Area Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-background-tertiary">
                  {/* Collapse Toggle - clickable area */}
                  <button
                    onClick={() => toggleAreaCollapse(area)}
                    className="flex items-center gap-3 hover:text-text-primary transition-colors"
                    aria-expanded={!isCollapsed}
                    aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${area} cinemas`}
                  >
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-text-tertiary transition-transform",
                        isCollapsed && "-rotate-90"
                      )}
                    />
                    <span className="font-display text-text-primary">{area}</span>
                    <span className="text-sm text-text-tertiary">
                      ({areaCinemas.length})
                    </span>
                  </button>

                  {/* Selection Controls */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-tertiary">
                      {selectedInArea}/{areaCinemas.length} selected
                    </span>
                    <button
                      onClick={() => selectArea(areaCinemas)}
                      className={cn(
                        "px-2 py-1 text-xs rounded border transition-colors",
                        allInAreaSelected
                          ? "border-accent-primary/40 bg-accent-primary/10 text-accent-primary"
                          : "border-border-default text-text-secondary hover:text-text-primary"
                      )}
                    >
                      {allInAreaSelected ? "Deselect All" : "Select All"}
                    </button>
                  </div>
                </div>

                {/* Area Cinemas */}
                {!isCollapsed && (
                  <div className="grid gap-3 sm:grid-cols-2 p-4">
                    {areaCinemas.map((cinema) => (
                      <CinemaCard
                        key={cinema.id}
                        cinema={cinema}
                        isSelected={isShowingAll || cinemaIds.includes(cinema.id)}
                        onToggle={() => handleToggleCinema(cinema.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Flat Grid View */
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredCinemas.map((cinema) => (
            <CinemaCard
              key={cinema.id}
              cinema={cinema}
              isSelected={isShowingAll || cinemaIds.includes(cinema.id)}
              onToggle={() => handleToggleCinema(cinema.id)}
            />
          ))}
        </div>
      )}

      {/* No Results */}
      {filteredCinemas.length === 0 && searchTerm && (
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
          <p className="text-text-secondary">No cinemas match "{searchTerm}"</p>
          <button
            onClick={() => setSearchTerm("")}
            className="text-accent-primary hover:text-accent-primary-hover text-sm mt-2 transition-colors"
          >
            Clear search
          </button>
        </div>
      )}

      {cinemas.length === 0 && (
        <div className="text-center py-12">
          <Clapperboard className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
          <p className="text-text-secondary">No cinemas found.</p>
          <p className="text-text-tertiary text-sm mt-1">
            Run the scrapers to add cinema data.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Individual Cinema Card Component
 */
function CinemaCard({
  cinema,
  isSelected,
  onToggle,
}: {
  cinema: Cinema;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "group relative p-4 rounded-lg border text-left transition-all",
        isSelected
          ? "border-accent-primary/50 bg-accent-primary/10"
          : "border-border-subtle bg-background-secondary hover:border-border-default hover:shadow-card"
      )}
    >
      {/* Selection Indicator */}
      <div
        className={cn(
          "absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
          isSelected ? "border-accent-primary bg-accent-primary" : "border-border-default"
        )}
      >
        {isSelected && <Check className="w-3 h-3 text-text-inverse" />}
      </div>

      {/* Cinema Info */}
      <div className="pr-8">
        <h3
          className={cn(
            "font-display text-lg transition-colors",
            isSelected ? "text-text-primary" : "text-text-secondary"
          )}
        >
          {cinema.name}
        </h3>

        {cinema.address?.area && (
          <p className="flex items-center gap-1.5 text-sm text-text-tertiary mt-1">
            <MapPin className="w-3.5 h-3.5" />
            {cinema.address.area}
          </p>
        )}

        {/* Features */}
        {cinema.features.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {cinema.features.slice(0, 3).map((feature) => (
              <span
                key={feature}
                className="px-2 py-0.5 text-xs bg-background-tertiary text-text-tertiary rounded capitalize border border-border-subtle"
              >
                {feature.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}

        {/* Links */}
        {cinema.website && (
          <a
            href={cinema.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-accent-primary mt-3 transition-colors"
            aria-label={`Visit ${cinema.name} website`}
          >
            <Globe className="w-3 h-3" />
            Website
          </a>
        )}
      </div>
    </button>
  );
}
