/**
 * URL Filter Sync Hook
 * Provides bidirectional sync between URL query params and filter store
 *
 * Behavior:
 * - On mount: If URL has filter params, apply them to store (URL wins over localStorage)
 * - On filter change: Update URL using replaceState (no back button pollution)
 * - Provides helper to generate shareable URLs
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useFilters } from "@/stores/filters";
import {
  filtersToSearchParams,
  searchParamsToFilters,
  buildShareableUrl,
  hasFilterParams,
  type ShareableFilters,
} from "@/lib/url-filters";

interface UseUrlFiltersOptions {
  /**
   * Whether to sync filter changes to URL (default: true)
   * Set to false if you only want to read from URL on mount
   */
  syncToUrl?: boolean;

  /**
   * Debounce delay for URL updates in ms (default: 300)
   * Prevents rapid URL changes during slider/range interactions
   */
  debounceMs?: number;
}

export function useUrlFilters(options: UseUrlFiltersOptions = {}) {
  const { syncToUrl = true, debounceMs = 300 } = options;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Track if we've done initial hydration from URL
  const hasHydratedFromUrl = useRef(false);
  // Track if we're currently updating from URL (to prevent feedback loops)
  const isUpdatingFromUrl = useRef(false);
  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Get filter state and setters from store
  const filters = useFilters();

  // Hydrate filters from URL on mount (runs once)
  useEffect(() => {
    if (hasHydratedFromUrl.current) return;

    const urlFilters = searchParamsToFilters(searchParams);

    // Only hydrate if URL actually has filter params
    if (hasFilterParams(searchParams)) {
      isUpdatingFromUrl.current = true;

      // Apply URL filters to store
      if (urlFilters.cinemaIds?.length) {
        filters.setCinemas(urlFilters.cinemaIds);
      }
      if (urlFilters.dateFrom || urlFilters.dateTo) {
        filters.setDateRange(urlFilters.dateFrom ?? null, urlFilters.dateTo ?? null);
      }
      if (urlFilters.timeFrom !== undefined || urlFilters.timeTo !== undefined) {
        filters.setTimeRange(urlFilters.timeFrom ?? null, urlFilters.timeTo ?? null);
      }
      if (urlFilters.programmingTypes?.length) {
        filters.setProgrammingTypes(urlFilters.programmingTypes);
      }
      if (urlFilters.decades?.length) {
        filters.setDecades(urlFilters.decades);
      }
      if (urlFilters.genres?.length) {
        filters.setGenres(urlFilters.genres);
      }
      if (urlFilters.festivalSlug) {
        filters.setFestivalFilter(urlFilters.festivalSlug);
      }
      if (urlFilters.festivalOnly) {
        filters.setFestivalOnly(true);
      }
      if (urlFilters.onlySingleShowings) {
        filters.setOnlySingleShowings(true);
      }
      // Handle formats - need to set each one
      if (urlFilters.formats?.length) {
        // Clear existing and set new
        for (const fmt of urlFilters.formats) {
          if (!filters.formats.includes(fmt)) {
            filters.toggleFormat(fmt);
          }
        }
      }
      // Handle timesOfDay
      if (urlFilters.timesOfDay?.length) {
        for (const tod of urlFilters.timesOfDay) {
          if (!filters.timesOfDay.includes(tod)) {
            filters.toggleTimeOfDay(tod);
          }
        }
      }

      // Small delay to let store update complete
      setTimeout(() => {
        isUpdatingFromUrl.current = false;
      }, 50);
    }

    hasHydratedFromUrl.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Get current shareable filters from store
  const getCurrentShareableFilters = useCallback((): Partial<ShareableFilters> => {
    return {
      cinemaIds: filters.cinemaIds,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      timeFrom: filters.timeFrom,
      timeTo: filters.timeTo,
      formats: filters.formats,
      programmingTypes: filters.programmingTypes,
      decades: filters.decades,
      genres: filters.genres,
      timesOfDay: filters.timesOfDay,
      festivalSlug: filters.festivalSlug,
      festivalOnly: filters.festivalOnly,
      onlySingleShowings: filters.onlySingleShowings,
    };
  }, [filters]);

  // Sync filter changes to URL (debounced)
  useEffect(() => {
    if (!syncToUrl || isUpdatingFromUrl.current || !hasHydratedFromUrl.current) {
      return;
    }

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const currentFilters = getCurrentShareableFilters();
      const newParams = filtersToSearchParams(currentFilters);
      const currentParamsString = searchParams.toString();
      const newParamsString = newParams.toString();

      // Only update if params actually changed
      if (currentParamsString !== newParamsString) {
        // Use replaceState to avoid polluting browser history
        const newUrl = newParamsString
          ? `${pathname}?${newParamsString}`
          : pathname;

        router.replace(newUrl, { scroll: false });
      }
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    // Watch all shareable filter values
    filters.cinemaIds,
    filters.dateFrom,
    filters.dateTo,
    filters.timeFrom,
    filters.timeTo,
    filters.formats,
    filters.programmingTypes,
    filters.decades,
    filters.genres,
    filters.timesOfDay,
    filters.festivalSlug,
    filters.festivalOnly,
    filters.onlySingleShowings,
    // Dependencies
    syncToUrl,
    debounceMs,
    pathname,
    router,
    searchParams,
    getCurrentShareableFilters,
  ]);

  /**
   * Generate a shareable URL for current filters
   */
  const getShareableUrl = useCallback(() => {
    const currentFilters = getCurrentShareableFilters();
    return buildShareableUrl(currentFilters);
  }, [getCurrentShareableFilters]);

  /**
   * Copy shareable URL to clipboard
   */
  const copyShareableUrl = useCallback(async () => {
    const url = getShareableUrl();
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        return true;
      } catch {
        return false;
      } finally {
        document.body.removeChild(textArea);
      }
    }
  }, [getShareableUrl]);

  /**
   * Check if any URL filter params are currently active
   */
  const hasUrlFilters = hasFilterParams(searchParams);

  return {
    getShareableUrl,
    copyShareableUrl,
    hasUrlFilters,
    hasHydratedFromUrl: hasHydratedFromUrl.current,
  };
}
