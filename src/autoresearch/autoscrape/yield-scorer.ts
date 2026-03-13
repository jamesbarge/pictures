/**
 * Yield Scorer
 *
 * Computes the Screening Yield Score (0-100) for a scraper run.
 * This is the primary metric for AutoScrape experiments.
 *
 * Formula:
 *   yield = 0.4 × (screenings_found / baseline_expected)
 *         + 0.3 × (valid_time_percentage)
 *         + 0.2 × (tmdb_match_rate)
 *         + 0.1 × (booking_url_valid_rate)
 */

import type { YieldScoreBreakdown, YieldScorerInput } from "../types";

/** Weights for each component of the composite score */
const WEIGHTS = {
  screeningYield: 0.4,
  validTime: 0.3,
  tmdbMatch: 0.2,
  bookingUrl: 0.1,
} as const;

/**
 * Compute the composite Screening Yield Score from raw inputs.
 * All component scores are 0-100, weighted into a final 0-100 score.
 */
export function computeYieldScore(input: YieldScorerInput): YieldScoreBreakdown {
  // Screening yield: ratio of found vs expected, capped at 100
  const screeningYield =
    input.baselineExpected > 0
      ? Math.min(100, (input.screeningsFound / input.baselineExpected) * 100)
      : input.screeningsFound > 0
        ? 100
        : 0;

  // Valid time: percentage of screenings with valid times (10:00-23:59)
  const validTimePercent =
    input.totalWithTime > 0
      ? (input.validTimeCount / input.totalWithTime) * 100
      : 0;

  // TMDB match rate: percentage of unique films matched to TMDB
  const tmdbMatchRate =
    input.totalFilms > 0
      ? (input.tmdbMatchedCount / input.totalFilms) * 100
      : 0;

  // Booking URL validity: percentage of URLs that are structurally valid
  const bookingUrlValidRate =
    input.totalBookingUrls > 0
      ? (input.validBookingUrls / input.totalBookingUrls) * 100
      : 0;

  const compositeScore =
    WEIGHTS.screeningYield * screeningYield +
    WEIGHTS.validTime * validTimePercent +
    WEIGHTS.tmdbMatch * tmdbMatchRate +
    WEIGHTS.bookingUrl * bookingUrlValidRate;

  return {
    screeningYield,
    validTimePercent,
    tmdbMatchRate,
    bookingUrlValidRate,
    compositeScore,
  };
}

/**
 * Build a YieldScorerInput from raw screening data.
 * This is a convenience function for use in the experiment harness.
 * Expects post-validation screenings (output of scraper.scrape()).
 */
export function buildYieldInput(params: {
  cinemaId: string;
  screenings: Array<{
    filmTitle: string;
    datetime: Date;
    bookingUrl: string;
  }>;
  baselineExpected: number;
  /** Set of film titles that have TMDB matches (from DB lookup) */
  tmdbMatchedTitles: Set<string>;
}): YieldScorerInput {
  const { screenings, baselineExpected, tmdbMatchedTitles } = params;

  let validTimeCount = 0;
  let validBookingUrls = 0;
  const uniqueFilms = new Set<string>();

  for (const s of screenings) {
    // Valid time check (10:00-23:59) — use UTC hours since datetimes are stored in UTC
    const hour = s.datetime.getUTCHours();
    if (hour >= 10 && hour <= 23) {
      validTimeCount++;
    }

    // Booking URL structural validity
    if (isValidBookingUrl(s.bookingUrl)) {
      validBookingUrls++;
    }

    // Track unique film titles (normalized)
    uniqueFilms.add(s.filmTitle.toLowerCase().trim());
  }

  // Count how many unique films have TMDB matches
  let tmdbMatchedCount = 0;
  for (const title of uniqueFilms) {
    if (tmdbMatchedTitles.has(title)) {
      tmdbMatchedCount++;
    }
  }

  return {
    cinemaId: params.cinemaId,
    screeningsFound: screenings.length,
    baselineExpected,
    validTimeCount,
    totalWithTime: screenings.length,
    tmdbMatchedCount,
    totalFilms: uniqueFilms.size,
    validBookingUrls,
    totalBookingUrls: screenings.length,
  };
}

/**
 * Check if a booking URL is structurally valid.
 * This is a fast check — no HTTP requests.
 */
function isValidBookingUrl(url: string): boolean {
  if (!url || url.trim() === "") return false;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
  if (url.includes("undefined") || url.includes("null")) return false;
  if (url.length > 2000) return false;
  return true;
}
