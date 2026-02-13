/**
 * Rich Mix Cinema Scraper
 *
 * Cinema: Rich Mix (Shoreditch)
 * Address: 35-47 Bethnal Green Rd, London E1 6LA
 * Website: https://richmix.org.uk
 *
 * Uses WordPress JSON API at ?ajax=1&json=1
 * Ticketing: Spektrix (tickets.richmix.org.uk)
 * 3 screens: Screen 1 (181 seats), Screen 2 (132 seats), Screen 3 (59 seats)
 */

import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";
import { FestivalDetector } from "../festivals/festival-detector";

const RICHMIX_CONFIG: ScraperConfig & { apiUrl: string } = {
  cinemaId: "rich-mix",
  baseUrl: "https://richmix.org.uk",
  apiUrl: "https://richmix.org.uk/whats-on/cinema/?ajax=1&json=1",
  requestsPerMinute: 30,
  delayBetweenRequests: 500,
};

// API response types
interface SpektrixInstance {
  id: string;
  start: string; // "2025-12-30 14:30:00" (local time)
  startUtc: string;
  eventId: string;
  instanceId: string;
  onSale: string;
  status?: {
    name?: string; // "Screen 1", "Screen 2", etc.
    available?: number;
    capacity?: number;
  };
  time?: string; // "2.30pm"
  date?: string; // "Tue 30 Dec"
  cancelled?: string;
}

interface SpektrixInstances {
  [dateKey: string]: SpektrixInstance[];
}

interface RichMixFilm {
  id: number;
  post_title: string;
  slug: string;
  _spectrix_id?: string;
  spektrix_data?: {
    instances?: SpektrixInstances;
  };
}

export class RichMixScraper implements CinemaScraper {
  config = RICHMIX_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log(`[${this.config.cinemaId}] Starting Rich Mix scrape...`);
    await FestivalDetector.preload();

    // Fetch the JSON API
    console.log(`[${this.config.cinemaId}] Fetching JSON API...`);
    const response = await fetch(this.config.apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch Rich Mix API: ${response.status}`);
    }

    const films: RichMixFilm[] = await response.json();
    console.log(`[${this.config.cinemaId}] Found ${films.length} films`);

    const screenings: RawScreening[] = [];
    const now = new Date();
    const seenIds = new Set<string>();

    for (const film of films) {
      const instances = film.spektrix_data?.instances;
      if (!instances) {
        continue;
      }

      // Process all date keys
      for (const dateKey of Object.keys(instances)) {
        const dateInstances = instances[dateKey];
        if (!Array.isArray(dateInstances)) continue;

        for (const instance of dateInstances) {
          // Skip cancelled screenings
          if (instance.cancelled === "1") continue;

          // Skip if not on sale
          if (instance.onSale !== "1") continue;

          // Create unique ID
          const sourceId = `richmix-${instance.instanceId || instance.id}`;
          if (seenIds.has(sourceId)) continue;
          seenIds.add(sourceId);

          // Parse datetime - format is "2025-12-30 14:30:00" (local time)
          const datetime = this.parseDateTime(instance.start);
          if (!datetime) {
            console.log(`[${this.config.cinemaId}] Failed to parse datetime: ${instance.start}`);
            continue;
          }

          // Skip past screenings
          if (datetime < now) continue;

          // Build booking URL - use the film page
          const bookingUrl = `${this.config.baseUrl}/whats-on/cinema/${film.slug}/`;

          screenings.push({
            filmTitle: film.post_title,
            datetime,
            bookingUrl,
            sourceId,
            ...FestivalDetector.detect("rich-mix", film.post_title, datetime, bookingUrl),
          });
        }
      }
    }

    console.log(`[${this.config.cinemaId}] Found ${screenings.length} screenings total`);
    return screenings;
  }

  /**
   * Parse datetime string in format "2025-12-30 14:30:00"
   * The API returns local London time
   */
  private parseDateTime(dateStr: string): Date | null {
    if (!dateStr) return null;

    // Format: "2025-12-30 14:30:00"
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return null;

    const [, year, month, day, hour, minute] = match;

    const date = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1, // 0-indexed month
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      0
    );

    return date;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.config.baseUrl, {
        method: "HEAD",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PicturesBot/1.0)",
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createRichMixScraper(): RichMixScraper {
  return new RichMixScraper();
}
