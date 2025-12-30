/**
 * Riverside Studios Scraper
 *
 * Cinema: Riverside Studios (Hammersmith)
 * Address: 101 Queen Caroline St, London W6 9BN
 * Website: https://riversidestudios.co.uk
 *
 * 2 screens: Cinema 1 (200 seats), Cinema 2 (48 seats)
 * Uses custom AJAX API at /ajax/filter_stream/
 * Ticketing: Spektrix (spektrix.riversidestudios.co.uk)
 */

import type { RawScreening } from "../types";

const RIVERSIDE_CONFIG = {
  cinemaId: "riverside-studios",
  apiUrl: "https://riversidestudios.co.uk/ajax/filter_stream/ZWhHVEdwSDNuekJLUWI1OXVDQ0Fvdz09/?offset=0&limit=500",
  baseUrl: "https://riversidestudios.co.uk",
};

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

export interface CinemaScraper {
  config: { cinemaId: string };
  scrape(): Promise<RawScreening[]>;
}

export class RiversideStudiosScraper implements CinemaScraper {
  config = RIVERSIDE_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log(`[${this.config.cinemaId}] Starting Riverside Studios scrape...`);

    // Fetch the API
    console.log(`[${this.config.cinemaId}] Fetching API...`);
    const response = await fetch(this.config.apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch Riverside API: ${response.status}`);
    }

    const events: RiversideEvent[] = await response.json();
    console.log(`[${this.config.cinemaId}] Found ${events.length} events`);

    // Filter for cinema events only
    const cinemaEvents = events.filter(event => event.slot_tag === "Cinema");
    console.log(`[${this.config.cinemaId}] Found ${cinemaEvents.length} cinema events`);

    const screenings: RawScreening[] = [];
    const now = new Date();
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
          if (datetime < now) continue;

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

    console.log(`[${this.config.cinemaId}] Found ${screenings.length} screenings total`);
    return screenings;
  }
}

export function createRiversideStudiosScraper(): RiversideStudiosScraper {
  return new RiversideStudiosScraper();
}
