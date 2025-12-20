/**
 * Cinema Selector Component
 * Allows users to toggle which cinemas appear in their calendar
 */

"use client";

import { useEffect, useState, useMemo } from "react";
import { MapPin, Check, Globe, Clapperboard, Search, X, ChevronDown } from "lucide-react";
import { usePreferences } from "@/stores/preferences";
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
  const { selectedCinemas, toggleCinema, selectAllCinemas, clearCinemas } =
    usePreferences();

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
    const allInArea = areaIds.every((id) => selectedCinemas.includes(id));

    if (allInArea) {
      // Deselect all in area
      const newSelection = selectedCinemas.filter((id) => !areaIds.includes(id));
      clearCinemas();
      if (newSelection.length > 0) {
        selectAllCinemas(newSelection);
      }
    } else {
      // Select all in area
      const newSelection = [...new Set([...selectedCinemas, ...areaIds])];
      selectAllCinemas(newSelection);
    }
  };

  // Initialize with all cinemas selected if none are selected
  useEffect(() => {
    if (mounted && selectedCinemas.length === 0 && cinemas.length > 0) {
      selectAllCinemas(cinemas.map((c) => c.id));
    }
  }, [mounted, selectedCinemas.length, cinemas, selectAllCinemas]);

  if (!mounted) {
    // Render skeleton while hydrating
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {cinemas.map((cinema) => (
          <div
            key={cinema.id}
            className="p-4 rounded-lg border border-white/5 bg-background-secondary/50 animate-pulse"
          >
            <div className="h-6 w-32 bg-white/10 rounded mb-2" />
            <div className="h-4 w-24 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const allSelected = selectedCinemas.length === cinemas.length;
  const noneSelected = selectedCinemas.length === 0;

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
          className="w-full pl-10 pr-10 py-2.5 bg-background-secondary border border-white/10 rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-gold/50 focus:ring-2 focus:ring-accent-gold/20 transition-colors"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
            aria-label="Clear search"
          >
            <X className="w-4 h-4 text-text-tertiary" />
          </button>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => selectAllCinemas(cinemas.map((c) => c.id))}
          disabled={allSelected}
          className={cn(
            "px-3 py-1.5 text-sm rounded-lg border transition-colors",
            allSelected
              ? "border-white/10 text-text-tertiary cursor-not-allowed"
              : "border-white/20 text-text-secondary hover:text-text-primary hover:border-white/30"
          )}
        >
          Select All
        </button>
        <button
          onClick={() => clearCinemas()}
          disabled={noneSelected}
          className={cn(
            "px-3 py-1.5 text-sm rounded-lg border transition-colors",
            noneSelected
              ? "border-white/10 text-text-tertiary cursor-not-allowed"
              : "border-white/20 text-text-secondary hover:text-text-primary hover:border-white/30"
          )}
        >
          Clear All
        </button>
        <button
          onClick={() => setGroupByArea(!groupByArea)}
          className={cn(
            "px-3 py-1.5 text-sm rounded-lg border transition-colors ml-auto",
            groupByArea
              ? "border-accent-gold/40 bg-accent-gold/10 text-accent-gold"
              : "border-white/20 text-text-secondary hover:text-text-primary hover:border-white/30"
          )}
        >
          Group by Area
        </button>
      </div>

      {/* Selected Count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-tertiary">
          {selectedCinemas.length} of {cinemas.length} cinemas selected
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
            const selectedInArea = areaCinemas.filter((c) =>
              selectedCinemas.includes(c.id)
            ).length;
            const allInAreaSelected = selectedInArea === areaCinemas.length;

            return (
              <div key={area} className="border border-white/5 rounded-xl overflow-hidden">
                {/* Area Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-background-secondary/50">
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
                          ? "border-accent-gold/40 bg-accent-gold/10 text-accent-gold"
                          : "border-white/20 text-text-secondary hover:text-text-primary"
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
                        isSelected={selectedCinemas.includes(cinema.id)}
                        onToggle={() => toggleCinema(cinema.id)}
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
              isSelected={selectedCinemas.includes(cinema.id)}
              onToggle={() => toggleCinema(cinema.id)}
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
            className="text-accent-gold hover:text-accent-gold-light text-sm mt-2 transition-colors"
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
          ? "border-accent-gold/50 bg-accent-gold/10"
          : "border-white/5 bg-background-secondary/50 hover:border-white/20 hover:bg-background-secondary"
      )}
    >
      {/* Selection Indicator */}
      <div
        className={cn(
          "absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
          isSelected ? "border-accent-gold bg-accent-gold" : "border-white/20"
        )}
      >
        {isSelected && <Check className="w-3 h-3 text-background-primary" />}
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
                className="px-2 py-0.5 text-xs bg-white/5 text-text-tertiary rounded capitalize"
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
            className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-accent-gold mt-3 transition-colors"
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
