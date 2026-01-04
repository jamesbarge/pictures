/**
 * URL Filter Serialization
 * Converts filter state to/from URL query parameters for shareable links
 */

import { format, parseISO } from "date-fns";
import type { ProgrammingType, TimeOfDay } from "@/lib/filter-constants";

// Filters that make sense to share via URL
// Excludes: filmSearch (session-only), hideSeen/hideNotInterested (personal data dependent)
export interface ShareableFilters {
  cinemaIds: string[];
  dateFrom: Date | null;
  dateTo: Date | null;
  timeFrom: number | null;
  timeTo: number | null;
  formats: string[];
  programmingTypes: ProgrammingType[];
  decades: string[];
  genres: string[];
  timesOfDay: TimeOfDay[];
  festivalSlug: string | null;
  festivalOnly: boolean;
  onlySingleShowings: boolean;
}

// URL parameter keys (short for cleaner URLs)
const PARAM_KEYS = {
  cinemaIds: "c",
  dateFrom: "from",
  dateTo: "to",
  timeFrom: "tf",
  timeTo: "tt",
  formats: "fmt",
  programmingTypes: "type",
  decades: "dec",
  genres: "g",
  timesOfDay: "tod",
  festivalSlug: "festival",
  festivalOnly: "festonly",
  onlySingleShowings: "single",
} as const;

/**
 * Serialize filters to URL search params
 * Only includes non-default values to keep URLs clean
 */
export function filtersToSearchParams(filters: Partial<ShareableFilters>): URLSearchParams {
  const params = new URLSearchParams();

  // Arrays - only add if non-empty
  if (filters.cinemaIds?.length) {
    params.set(PARAM_KEYS.cinemaIds, filters.cinemaIds.join(","));
  }
  if (filters.formats?.length) {
    params.set(PARAM_KEYS.formats, filters.formats.join(","));
  }
  if (filters.programmingTypes?.length) {
    params.set(PARAM_KEYS.programmingTypes, filters.programmingTypes.join(","));
  }
  if (filters.decades?.length) {
    params.set(PARAM_KEYS.decades, filters.decades.join(","));
  }
  if (filters.genres?.length) {
    params.set(PARAM_KEYS.genres, filters.genres.join(","));
  }
  if (filters.timesOfDay?.length) {
    params.set(PARAM_KEYS.timesOfDay, filters.timesOfDay.join(","));
  }

  // Dates - ISO date format (YYYY-MM-DD)
  if (filters.dateFrom) {
    params.set(PARAM_KEYS.dateFrom, format(filters.dateFrom, "yyyy-MM-dd"));
  }
  if (filters.dateTo) {
    params.set(PARAM_KEYS.dateTo, format(filters.dateTo, "yyyy-MM-dd"));
  }

  // Numbers
  if (filters.timeFrom !== null && filters.timeFrom !== undefined) {
    params.set(PARAM_KEYS.timeFrom, String(filters.timeFrom));
  }
  if (filters.timeTo !== null && filters.timeTo !== undefined) {
    params.set(PARAM_KEYS.timeTo, String(filters.timeTo));
  }

  // Strings
  if (filters.festivalSlug) {
    params.set(PARAM_KEYS.festivalSlug, filters.festivalSlug);
  }

  // Booleans - only include if true (false is default)
  if (filters.festivalOnly) {
    params.set(PARAM_KEYS.festivalOnly, "1");
  }
  if (filters.onlySingleShowings) {
    params.set(PARAM_KEYS.onlySingleShowings, "1");
  }

  return params;
}

/**
 * Parse URL search params back to filter state
 */
export function searchParamsToFilters(params: URLSearchParams): Partial<ShareableFilters> {
  const filters: Partial<ShareableFilters> = {};

  // Arrays
  const cinemas = params.get(PARAM_KEYS.cinemaIds);
  if (cinemas) {
    filters.cinemaIds = cinemas.split(",").filter(Boolean);
  }

  const formats = params.get(PARAM_KEYS.formats);
  if (formats) {
    filters.formats = formats.split(",").filter(Boolean);
  }

  const types = params.get(PARAM_KEYS.programmingTypes);
  if (types) {
    filters.programmingTypes = types.split(",").filter(Boolean) as ProgrammingType[];
  }

  const decades = params.get(PARAM_KEYS.decades);
  if (decades) {
    filters.decades = decades.split(",").filter(Boolean);
  }

  const genres = params.get(PARAM_KEYS.genres);
  if (genres) {
    filters.genres = genres.split(",").filter(Boolean);
  }

  const timesOfDay = params.get(PARAM_KEYS.timesOfDay);
  if (timesOfDay) {
    filters.timesOfDay = timesOfDay.split(",").filter(Boolean) as TimeOfDay[];
  }

  // Dates
  const dateFrom = params.get(PARAM_KEYS.dateFrom);
  if (dateFrom) {
    try {
      filters.dateFrom = parseISO(dateFrom);
    } catch {
      // Invalid date format, ignore
    }
  }

  const dateTo = params.get(PARAM_KEYS.dateTo);
  if (dateTo) {
    try {
      filters.dateTo = parseISO(dateTo);
    } catch {
      // Invalid date format, ignore
    }
  }

  // Numbers
  const timeFrom = params.get(PARAM_KEYS.timeFrom);
  if (timeFrom !== null) {
    const parsed = parseInt(timeFrom, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 23) {
      filters.timeFrom = parsed;
    }
  }

  const timeTo = params.get(PARAM_KEYS.timeTo);
  if (timeTo !== null) {
    const parsed = parseInt(timeTo, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 23) {
      filters.timeTo = parsed;
    }
  }

  // Strings
  const festival = params.get(PARAM_KEYS.festivalSlug);
  if (festival) {
    filters.festivalSlug = festival;
  }

  // Booleans
  if (params.get(PARAM_KEYS.festivalOnly) === "1") {
    filters.festivalOnly = true;
  }
  if (params.get(PARAM_KEYS.onlySingleShowings) === "1") {
    filters.onlySingleShowings = true;
  }

  return filters;
}

/**
 * Build a shareable URL from current filters
 */
export function buildShareableUrl(filters: Partial<ShareableFilters>, baseUrl?: string): string {
  const params = filtersToSearchParams(filters);
  const base = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");

  const queryString = params.toString();
  return queryString ? `${base}?${queryString}` : base;
}

/**
 * Check if URL has any filter params
 */
export function hasFilterParams(params: URLSearchParams): boolean {
  return Object.values(PARAM_KEYS).some(key => params.has(key));
}
