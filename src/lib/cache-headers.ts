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

/** 1-hour edge cache, 24-hour stale-while-revalidate. For slow-changing snapshots
 * like the search catalog (only changes when scrapes add/remove screenings). */
export const CACHE_1HOUR = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
} as const;

/** Private responses must never be stored by browsers or shared edge caches. */
export const PRIVATE_NO_STORE = {
  "Cache-Control": "private, no-store",
} as const;

/** Keep anonymous responses cacheable while preventing personalized response caching. */
export function getUserAwareCacheHeaders<T extends Record<string, string>>(
  userId: string | null,
  publicHeaders: T
): T | typeof PRIVATE_NO_STORE {
  return userId ? PRIVATE_NO_STORE : publicHeaders;
}
