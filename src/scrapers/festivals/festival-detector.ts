/**
 * Festival Detector
 *
 * Inline utility used by venue scrapers during scraping to detect
 * whether a screening belongs to a festival.
 *
 * Replaces the hardcoded detectFestival() in bfi.ts with a shared,
 * config-driven detector that all venue scrapers can call.
 *
 * Usage pattern in scrapers:
 *   // At start of scrape() method:
 *   await FestivalDetector.preload();
 *
 *   // Inside synchronous .each() callbacks:
 *   const match = FestivalDetector.detect(cinemaId, title, datetime, bookingUrl);
 *   screenings.push({ ...screening, ...match });
 */

import { db } from "@/db";
import { festivals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { FESTIVAL_CONFIGS } from "./festival-config";
import type { FestivalMatch, FestivalRecord, FestivalTaggingConfig } from "./types";

// Cache of active festivals
let festivalCache: FestivalRecord[] | null = null;
let cacheLoadedAt: Date | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Shared festival detector for use in venue scrapers.
 *
 * Detection signals (priority order):
 * 1. Exclusive venue + date window (AUTO strategy) — e.g., FrightFest at PCC
 * 2. Title keywords — "LFF:", "Flare:", "Raindance:" prefixes
 * 3. Booking URL patterns — BFI whatson URLs containing /flare/ or /lff/
 */
export class FestivalDetector {
  /**
   * Pre-load the festival cache from the database.
   * Call this once at the start of a scraper's scrape() method.
   * After this call, detect() works synchronously.
   */
  static async preload(): Promise<void> {
    if (festivalCache && cacheLoadedAt) {
      const age = Date.now() - cacheLoadedAt.getTime();
      if (age < CACHE_TTL_MS) return;
    }

    const activeFestivals = await db
      .select({
        id: festivals.id,
        slug: festivals.slug,
        name: festivals.name,
        shortName: festivals.shortName,
        startDate: festivals.startDate,
        endDate: festivals.endDate,
        venues: festivals.venues,
      })
      .from(festivals)
      .where(eq(festivals.isActive, true));

    festivalCache = activeFestivals;
    cacheLoadedAt = new Date();
  }

  /**
   * Clear the festival cache (e.g., after seed data changes).
   */
  static clearCache(): void {
    festivalCache = null;
    cacheLoadedAt = null;
  }

  /**
   * Detect whether a screening belongs to a festival.
   * Synchronous — requires preload() to have been called first.
   *
   * Returns an object that can be spread into a RawScreening:
   *   { festivalSlug: "bfi-flare-2026" } or {}
   *
   * @param cinemaId - The cinema slug (e.g., "prince-charles")
   * @param filmTitle - The film title as scraped
   * @param datetime - The screening date/time
   * @param bookingUrl - Optional booking URL for pattern matching
   */
  static detect(
    cinemaId: string,
    filmTitle: string,
    datetime: Date,
    bookingUrl?: string
  ): Partial<FestivalMatch> {
    if (!festivalCache) return {};

    for (const festival of festivalCache) {
      const slugBase = festival.slug.replace(/-\d{4}$/, "");
      const config = FESTIVAL_CONFIGS[slugBase];
      if (!config) continue;

      // Quick pre-filter: is the screening month within the festival's typical range?
      const screeningMonth = datetime.getMonth();
      if (!config.typicalMonths.includes(screeningMonth)) continue;

      // Check if cinema is a venue for this festival
      const venueList = festival.venues ?? config.venues;
      if (!venueList.includes(cinemaId)) continue;

      // Check if screening date is within the festival window
      // Use a generous window: startDate - 3 days to endDate + 1 day
      // (festivals sometimes have pre-festival events)
      const start = new Date(festival.startDate);
      const end = new Date(festival.endDate);
      start.setDate(start.getDate() - 3);
      end.setDate(end.getDate() + 1);
      end.setHours(23, 59, 59, 999);

      if (datetime < start || datetime > end) continue;

      // Apply confidence strategy
      if (config.confidence === "AUTO") {
        return { festivalSlug: festival.slug };
      }

      // TITLE strategy: check title keywords and URL patterns
      if (matchesTitleSignals(filmTitle, bookingUrl, config)) {
        return { festivalSlug: festival.slug };
      }
    }

    return {};
  }
}

function matchesTitleSignals(
  filmTitle: string,
  bookingUrl: string | undefined,
  config: FestivalTaggingConfig
): boolean {
  const titleLower = filmTitle.toLowerCase();

  if (config.titleKeywords) {
    for (const keyword of config.titleKeywords) {
      if (titleLower.includes(keyword.toLowerCase())) {
        return true;
      }
    }
  }

  if (config.urlPatterns && bookingUrl) {
    for (const pattern of config.urlPatterns) {
      if (pattern.test(bookingUrl)) {
        return true;
      }
    }
  }

  return false;
}
