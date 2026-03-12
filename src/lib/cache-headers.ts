/** Shared Cache-Control header objects for API routes. */

/** 5-minute edge cache, 10-minute stale-while-revalidate. Default for most API responses. */
export const CACHE_5MIN = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
} as const;

/** 10-minute edge cache, 20-minute stale-while-revalidate. For slow-changing list data. */
export const CACHE_10MIN = {
  "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200",
} as const;

/** 2-minute edge cache, 5-minute stale-while-revalidate. For frequently updated data. */
export const CACHE_2MIN = {
  "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
} as const;
