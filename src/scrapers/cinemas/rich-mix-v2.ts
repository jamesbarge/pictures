/**
 * Rich Mix Cinema Scraper (v2 - extends BaseScraper)
 *
 * Cinema: Rich Mix (Shoreditch)
 * Address: 35-47 Bethnal Green Rd, London E1 6LA
 * Website: https://richmix.org.uk
 *
 * Uses WordPress JSON API at ?ajax=1&json=1
 * Ticketing: Spektrix (tickets.richmix.org.uk)
 * 3 screens: Screen 1 (181 seats), Screen 2 (132 seats), Screen 3 (59 seats)
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";

// API response types
interface SpektrixInstance {
  id: string;
  start: string; // "2025-12-30 14:30:00" (local time)
  startUtc: string;
  eventId: string;
  instanceId: string;
  onSale: string;
  status?: {
    name?: string;
    available?: number;
    capacity?: number;
  };
  time?: string;
  date?: string;
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

export class RichMixScraperV2 extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "rich-mix",
    baseUrl: "https://richmix.org.uk",
    requestsPerMinute: 30,
    delayBetweenRequests: 500,
  };

  private apiUrl = "https://richmix.org.uk/whats-on/cinema/?ajax=1&json=1";

  protected async fetchPages(): Promise<string[]> {
    console.log("[rich-mix] Fetching JSON API...");
    const json = await this.fetchUrl(this.apiUrl);
    return [json];
  }

  protected async parsePages(jsonPages: string[]): Promise<RawScreening[]> {
    const films: RichMixFilm[] = JSON.parse(jsonPages[0]);
    console.log(`[rich-mix] Found ${films.length} films`);

    const screenings: RawScreening[] = [];
    const seenIds = new Set<string>();

    for (const film of films) {
      const instances = film.spektrix_data?.instances;
      if (!instances) continue;

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
            console.log(`[rich-mix] Failed to parse datetime: ${instance.start}`);
            continue;
          }

          // Build booking URL
          const bookingUrl = `${this.config.baseUrl}/whats-on/cinema/${film.slug}/`;

          screenings.push({
            filmTitle: film.post_title,
            datetime,
            bookingUrl,
            sourceId,
          });
        }
      }
    }

    return screenings;
  }

  /**
   * Parse datetime string in format "2025-12-30 14:30:00"
   * The API returns local London time
   */
  private parseDateTime(dateStr: string): Date | null {
    if (!dateStr) return null;

    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return null;

    const [, year, month, day, hour, minute] = match;

    return new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      0
    );
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

export function createRichMixScraperV2(): RichMixScraperV2 {
  return new RichMixScraperV2();
}
