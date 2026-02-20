/**
 * BFI Booking URL Builder
 *
 * Constructs search URLs for BFI's What's On system. The BFI runs two
 * separate booking sites (Southbank and IMAX), each with a static
 * article_search_id GUID that must be passed for search to work.
 *
 * URL format (as of Feb 2026):
 *   /default.asp?doWork::WScontent::search=1
 *     &BOparam::WScontent::search::article_search_id={GUID}
 *     &BOset::WScontent::SearchCriteria::search_criteria={title}
 */

const BFI_SEARCH_CONFIG = {
  "bfi-southbank": {
    baseUrl: "https://whatson.bfi.org.uk/Online",
    searchId: "25E7EA2E-291F-44F9-8EBC-E560154FDAEB",
  },
  "bfi-imax": {
    baseUrl: "https://whatson.bfi.org.uk/imax/Online",
    searchId: "49C49C83-6BA0-420C-A784-9B485E36E2E0",
  },
} as const;

/**
 * Build a BFI booking search URL for a given film title and venue.
 *
 * Routes IMAX screens to the IMAX booking site, everything else to Southbank.
 *
 * @param title - Film title to search for
 * @param venueOrCinemaId - Screen name (e.g. "IMAX") or cinema ID (e.g. "bfi-imax")
 */
export function buildBFISearchUrl(title: string, venueOrCinemaId?: string): string {
  const isImax =
    venueOrCinemaId?.toUpperCase() === "IMAX" ||
    venueOrCinemaId?.toUpperCase() === "BFI IMAX" ||
    venueOrCinemaId === "bfi-imax";

  const config = isImax
    ? BFI_SEARCH_CONFIG["bfi-imax"]
    : BFI_SEARCH_CONFIG["bfi-southbank"];

  const encodedTitle = encodeURIComponent(title);

  return `${config.baseUrl}/default.asp?doWork::WScontent::search=1&BOparam::WScontent::search::article_search_id=${config.searchId}&BOset::WScontent::SearchCriteria::search_criteria=${encodedTitle}`;
}
