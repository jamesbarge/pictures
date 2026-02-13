/**
 * Eventive Festival Scraper
 *
 * Scrapes festival programmes from Eventive (FrightFest, UKJFF).
 * Uses the Eventive API client to fetch films + events, joins them into
 * RawScreenings, and maps venue names to canonical cinema registry IDs.
 *
 * Functional pattern — not BaseScraper — because festivals span multiple cinemas.
 */

import type { RawScreening } from "@/scrapers/types";
import type { TaggingResult } from "./types";
import {
  getFilms,
  getEvents,
  discoverEventBucket,
  type EventiveFilm,
  type EventiveEvent,
} from "./eventive-client";
import { saveScreenings } from "@/scrapers/pipeline";
import { getCinemaById } from "@/config/cinema-registry";

// ── Festival configurations ──────────────────────────────────────────────

export interface EventiveFestivalConfig {
  slugBase: string;
  subdomain: (year: number) => string;
  venueMapping: Record<string, string>; // Eventive venue name → canonical cinema ID
}

export const EVENTIVE_FESTIVALS: EventiveFestivalConfig[] = [
  {
    slugBase: "frightfest",
    subdomain: (year) => `frightfest${String(year).slice(-2)}`,
    venueMapping: {
      "Prince Charles Cinema": "prince-charles",
      "Prince Charles": "prince-charles",
      "Vue Leicester Square": "vue-leicester-square",
      "Vue West End": "vue-leicester-square",
    },
  },
  {
    slugBase: "ukjff",
    subdomain: (year) => `ukjewishfilmfestival${year}`,
    venueMapping: {
      "JW3": "jw3",
      "Barbican": "barbican",
      "Barbican Cinema": "barbican",
      "Curzon Soho": "curzon-soho",
    },
  },
];

// ── Scraping logic ───────────────────────────────────────────────────────

/**
 * Scrape a single Eventive festival and return RawScreenings grouped by cinema.
 */
export async function scrapeEventiveFestival(
  slugBase: string,
  year?: number
): Promise<{ screenings: RawScreening[]; skippedVenues: string[] }> {
  const resolvedYear = year ?? new Date().getFullYear();
  const config = EVENTIVE_FESTIVALS.find((f) => f.slugBase === slugBase);
  if (!config) {
    throw new Error(`Unknown Eventive festival: ${slugBase}`);
  }

  const subdomain = config.subdomain(resolvedYear);
  const festivalSlug = `${slugBase}-${resolvedYear}`;

  console.log(`[Eventive] Discovering event bucket for ${subdomain}...`);
  const bucketId = await discoverEventBucket(subdomain);
  console.log(`[Eventive] Found bucket: ${bucketId}`);

  console.log(`[Eventive] Fetching films...`);
  const films = await getFilms(bucketId);
  console.log(`[Eventive] Found ${films.length} films`);

  console.log(`[Eventive] Fetching events...`);
  const events = await getEvents(bucketId);
  console.log(`[Eventive] Found ${events.length} events`);

  // Index films by ID for fast lookup
  const filmById = new Map<string, EventiveFilm>();
  for (const film of films) {
    filmById.set(film.id, film);
  }

  const screenings: RawScreening[] = [];
  const skippedVenues = new Set<string>();

  for (const event of events) {
    const venueName = event.venue?.name;
    if (!venueName) {
      skippedVenues.add("(no venue)");
      continue;
    }

    const cinemaId = config.venueMapping[venueName];
    if (!cinemaId) {
      skippedVenues.add(venueName);
      continue;
    }

    // Resolve film info — an event may reference multiple films
    const filmIds = event.film_ids ?? [];
    const resolvedFilms = filmIds
      .map((id) => filmById.get(id))
      .filter(Boolean) as EventiveFilm[];

    // If event has no films, use the event name as the film title
    if (resolvedFilms.length === 0) {
      screenings.push(
        createScreening(event, null, cinemaId, festivalSlug, config.slugBase)
      );
    } else {
      // Create one screening per film in the event
      for (const film of resolvedFilms) {
        screenings.push(
          createScreening(event, film, cinemaId, festivalSlug, config.slugBase)
        );
      }
    }
  }

  if (skippedVenues.size > 0) {
    console.log(
      `[Eventive] Skipped ${skippedVenues.size} unmapped venues: ${[...skippedVenues].join(", ")}`
    );
  }

  console.log(`[Eventive] Produced ${screenings.length} screenings for ${festivalSlug}`);
  return { screenings, skippedVenues: [...skippedVenues] };
}

function createScreening(
  event: EventiveEvent,
  film: EventiveFilm | null,
  cinemaId: string,
  festivalSlug: string,
  _slugBase: string
): RawScreening & { cinemaId: string } {
  const title = film?.name ?? event.name;
  const section = event.tags?.[0] ?? film?.sections?.[0];

  // Determine availability
  let availabilityStatus: RawScreening["availabilityStatus"] = "unknown";
  if (event.ticket_buckets?.length) {
    const allSoldOut = event.ticket_buckets.every((t) => t.sold_out);
    const anyLow = event.ticket_buckets.some(
      (t) => !t.sold_out && t.available > 0 && t.available < 10
    );
    if (allSoldOut) availabilityStatus = "sold_out";
    else if (anyLow) availabilityStatus = "low";
    else availabilityStatus = "available";
  }

  return {
    cinemaId,
    filmTitle: title,
    datetime: new Date(event.start_time),
    bookingUrl: `https://eventive.org/events/${event.id}`,
    festivalSlug,
    festivalSection: section,
    year: film?.year,
    director: film?.directors?.[0],
    posterUrl: film?.poster_url ?? film?.still_url,
    sourceId: `eventive-${event.id}`,
    availabilityStatus,
  };
}

/**
 * Scrape all active Eventive festivals and save to database.
 * Only scrapes festivals within their watch windows.
 */
export async function scrapeActiveEventiveFestivals(): Promise<TaggingResult[]> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const results: TaggingResult[] = [];

  for (const config of EVENTIVE_FESTIVALS) {
    // Import the festival config to check typical months
    const { FESTIVAL_CONFIGS } = await import("./festival-config");
    const festivalConfig = FESTIVAL_CONFIGS[config.slugBase];
    if (!festivalConfig) continue;

    // Check if we're within the watch window (typical months ± 1 month)
    const inWindow = festivalConfig.typicalMonths.some(
      (m) => Math.abs(currentMonth - m) <= 1 || Math.abs(currentMonth - m) >= 11
    );
    if (!inWindow) continue;

    try {
      const { screenings } = await scrapeEventiveFestival(
        config.slugBase,
        currentYear
      );

      // Group by cinemaId and save
      const byCinema = new Map<string, RawScreening[]>();
      for (const s of screenings) {
        const cId = (s as RawScreening & { cinemaId: string }).cinemaId;
        if (!byCinema.has(cId)) byCinema.set(cId, []);
        byCinema.get(cId)!.push(s);
      }

      let totalSaved = 0;
      for (const [cinemaId, cinemaScreenings] of byCinema) {
        const cinema = getCinemaById(cinemaId);
        if (!cinema) continue;

        const result = await saveScreenings(cinemaId, cinemaScreenings);
        totalSaved += result.added + result.updated;
      }

      results.push({
        festivalSlug: `${config.slugBase}-${currentYear}`,
        festivalName: config.slugBase,
        screeningsChecked: screenings.length,
        screeningsTagged: totalSaved,
        alreadyTagged: 0,
      });
    } catch (error) {
      console.error(
        `[Eventive] Failed to scrape ${config.slugBase}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return results;
}
