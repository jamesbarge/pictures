/**
 * Castle Sidcup Scraper
 *
 * Community cinema in Sidcup (formerly Sidcup Storyteller), now operated by Castle Cinema.
 * Uses JSON-LD structured data (Schema.org ScreeningEvent) embedded in homepage.
 * Same platform as Castle Cinema Hackney.
 *
 * Website: https://castlesidcup.com
 */

import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";

export const CASTLE_SIDCUP_CONFIG: ScraperConfig = {
  cinemaId: "castle-sidcup",
  baseUrl: "https://castlesidcup.com",
  requestsPerMinute: 30,
  delayBetweenRequests: 500,
};

export const CASTLE_SIDCUP_VENUE = {
  id: "castle-sidcup",
  name: "Castle Sidcup",
  shortName: "Castle Sidcup",
  area: "Sidcup",
  postcode: "DA14 6EP",
  address: "2-4 Sidcup High Street",
  features: ["independent", "community", "arthouse", "bar", "cafe"],
  website: "https://castlesidcup.com",
};

interface SchemaOrgMovie {
  "@type": "Movie";
  name: string;
  url: string;
}

interface SchemaOrgScreeningEvent {
  "@context": string;
  "@type": "ScreeningEvent";
  "@id": string;
  name: string;
  description: string;
  url: string;
  doorTime: string;
  startDate: string;
  duration: string;
  workPresented: SchemaOrgMovie;
}

export class CastleSidcupScraper implements CinemaScraper {
  config = CASTLE_SIDCUP_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log("[castle-sidcup] Fetching homepage for JSON-LD data...");

    try {
      const response = await fetch(this.config.baseUrl, {
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept-Language": "en-GB,en;q=0.9",
        },
      });

      if (!response.ok) {
        throw new Error("HTTP " + response.status + ": " + response.statusText);
      }

      const html = await response.text();
      const jsonLdBlocks = this.extractJsonLd(html);

      console.log("[castle-sidcup] Found " + jsonLdBlocks.length + " JSON-LD blocks");

      const screeningEvents = this.filterScreeningEvents(jsonLdBlocks);
      console.log("[castle-sidcup] Found " + screeningEvents.length + " ScreeningEvent entries");

      const screenings = this.convertToRawScreenings(screeningEvents);
      const validated = this.validate(screenings);

      console.log("[castle-sidcup] " + validated.length + " valid screenings after filtering");

      return validated;
    } catch (error) {
      console.error("[castle-sidcup] Scrape failed:", error);
      throw error;
    }
  }

  private extractJsonLd(html: string): unknown[] {
    const pattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    const blocks: unknown[] = [];

    let match;
    while ((match = pattern.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        blocks.push(data);
      } catch {
        // Skip invalid JSON blocks
      }
    }

    return blocks;
  }

  private filterScreeningEvents(blocks: unknown[]): SchemaOrgScreeningEvent[] {
    return blocks.filter((block): block is SchemaOrgScreeningEvent => {
      return (
        typeof block === "object" &&
        block !== null &&
        "@type" in block &&
        (block as { "@type": string })["@type"] === "ScreeningEvent"
      );
    });
  }

  private convertToRawScreenings(events: SchemaOrgScreeningEvent[]): RawScreening[] {
    return events.map((event) => {
      const datetime = new Date(event.startDate);

      const bookingIdMatch = event.url.match(/\/bookings\/(\d+)\//);
      const bookingId = bookingIdMatch ? bookingIdMatch[1] : null;
      const sourceId = bookingId ? "castle-sidcup-" + bookingId : undefined;

      const durationMatch = event.duration?.match(/PT(\d+)M/);
      const durationMinutes = durationMatch ? parseInt(durationMatch[1], 10) : undefined;

      return {
        filmTitle: event.workPresented?.name || event.name,
        datetime,
        bookingUrl: event.url,
        sourceId,
        eventDescription: durationMinutes ? "Runtime: " + durationMinutes + " mins" : undefined,
      };
    });
  }

  private validate(screenings: RawScreening[]): RawScreening[] {
    const now = new Date();
    const seen = new Set<string>();

    return screenings.filter((s) => {
      if (!s.filmTitle || s.filmTitle.trim() === "") return false;
      if (!s.datetime || isNaN(s.datetime.getTime())) return false;
      if (!s.bookingUrl || s.bookingUrl.trim() === "") return false;
      if (s.datetime < now) return false;
      if (s.sourceId && seen.has(s.sourceId)) return false;
      if (s.sourceId) seen.add(s.sourceId);
      return true;
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.config.baseUrl, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createCastleSidcupScraper(): CastleSidcupScraper {
  return new CastleSidcupScraper();
}
