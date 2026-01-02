/**
 * Riverside Studios Scraper (v2 - extends BaseScraper)
 *
 * Cinema: Riverside Studios (Hammersmith)
 * Address: 101 Queen Caroline St, London W6 9BN
 * Website: https://riversidestudios.co.uk
 *
 * 2 screens: Cinema 1 (200 seats), Cinema 2 (48 seats)
 * Uses custom AJAX API at /ajax/filter_stream/
 * Ticketing: Spektrix (spektrix.riversidestudios.co.uk)
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";

// API response types
interface RiversidePerformance {
  tag_ids: string[];
  tag_name: string;
  html: string;
  timestamp: string;
  accessibility_class?: string;
}

interface RiversideEvent {
  id: string;
  name: string;
  title: string;
  url: string;
  duration?: string;
  slot_tag?: string;
  age_rating_class?: string;
  performances: Record<string, RiversidePerformance[]>;
  performance_dates: number[];
  start_date: string;
  end_date?: string;
}

export class RiversideScraperV2 extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "riverside-studios",
    baseUrl: "https://riversidestudios.co.uk",
    requestsPerMinute: 30,
    delayBetweenRequests: 500,
  };

  private apiUrl =
    "https://riversidestudios.co.uk/ajax/filter_stream/ZWhHVEdwSDNuekJLUWI1OXVDQ0Fvdz09/?offset=0&limit=500";

  protected async fetchPages(): Promise<string[]> {
    console.log("[riverside-studios] Fetching API...");
    const json = await this.fetchUrl(this.apiUrl);
    return [json];
  }

  protected async parsePages(jsonPages: string[]): Promise<RawScreening[]> {
    const events: RiversideEvent[] = JSON.parse(jsonPages[0]);
    console.log(`[riverside-studios] Found ${events.length} events`);

    // Filter for cinema events only
    const cinemaEvents = events.filter((event) => event.slot_tag === "Cinema");
    console.log(`[riverside-studios] Found ${cinemaEvents.length} cinema events`);

    const screenings: RawScreening[] = [];
    const seenIds = new Set<string>();

    for (const event of cinemaEvents) {
      const performances = event.performances;
      if (!performances) continue;

      // Process all date keys
      for (const dateKey of Object.keys(performances)) {
        const dayPerformances = performances[dateKey];
        if (!Array.isArray(dayPerformances)) continue;

        for (const perf of dayPerformances) {
          // Parse timestamp (Unix seconds)
          const timestamp = parseInt(perf.timestamp, 10);
          if (isNaN(timestamp)) continue;

          const datetime = new Date(timestamp * 1000);

          // Extract booking URL from HTML
          // Format: <a class="performance button" href="https://riversidestudios.co.uk/seats/43001/">
          const bookingUrlMatch = perf.html.match(/href="([^"]+)"/);
          const bookingUrl = bookingUrlMatch ? bookingUrlMatch[1] : event.url;

          // Create unique source ID
          const sourceId = `riverside-${event.id}-${perf.timestamp}`;
          if (seenIds.has(sourceId)) continue;
          seenIds.add(sourceId);

          screenings.push({
            filmTitle: event.title || event.name,
            datetime,
            bookingUrl,
            sourceId,
          });
        }
      }
    }

    return screenings;
  }

  protected validate(screenings: RawScreening[]): RawScreening[] {
    const baseValidated = super.validate(screenings);
    const seen = new Set<string>();

    return baseValidated.filter((s) => {
      if (s.sourceId && seen.has(s.sourceId)) return false;
      if (s.sourceId) seen.add(s.sourceId);
      return true;
    });
  }
}

export function createRiversideScraperV2(): RiversideScraperV2 {
  return new RiversideScraperV2();
}
