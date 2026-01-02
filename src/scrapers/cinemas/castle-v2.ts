/**
 * Castle Cinema Scraper (v2 - extends BaseScraper)
 *
 * Community cinema in Homerton with 82-seat main screen + 27-seat second screen.
 * Uses JSON-LD structured data (Schema.org ScreeningEvent) embedded in homepage.
 *
 * Website: https://thecastlecinema.com
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";

// Re-export config and venue for compatibility
export { CASTLE_CONFIG, CASTLE_VENUE } from "./castle";

// JSON-LD Types (Schema.org ScreeningEvent)
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

export class CastleScraperV2 extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "castle-cinema",
    baseUrl: "https://thecastlecinema.com",
    requestsPerMinute: 30,
    delayBetweenRequests: 500,
  };

  protected async fetchPages(): Promise<string[]> {
    // Castle has all data on the homepage as JSON-LD
    console.log("[castle-cinema] Fetching homepage for JSON-LD data...");
    const html = await this.fetchUrl(this.config.baseUrl);
    return [html];
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const html = htmlPages[0];

    const jsonLdBlocks = this.extractJsonLd(html);
    console.log(`[castle-cinema] Found ${jsonLdBlocks.length} JSON-LD blocks`);

    const screeningEvents = this.filterScreeningEvents(jsonLdBlocks);
    console.log(`[castle-cinema] Found ${screeningEvents.length} ScreeningEvent entries`);

    return this.convertToRawScreenings(screeningEvents);
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
      const sourceId = bookingId ? `castle-${bookingId}` : undefined;

      const durationMatch = event.duration?.match(/PT(\d+)M/);
      const durationMinutes = durationMatch ? parseInt(durationMatch[1], 10) : undefined;

      return {
        filmTitle: event.workPresented?.name || event.name,
        datetime,
        bookingUrl: event.url,
        sourceId,
        eventDescription: durationMinutes ? `Runtime: ${durationMinutes} mins` : undefined,
      };
    });
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

export function createCastleScraperV2(): CastleScraperV2 {
  return new CastleScraperV2();
}
