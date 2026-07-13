/**
 * Rich Mix Cinema Scraper (v3 - Spektrix public API)
 *
 * Cinema: Rich Mix (Shoreditch)
 * Address: 35-47 Bethnal Green Rd, London E1 6LA
 * Website: https://richmix.org.uk
 * 3 screens: Screen 1 (181 seats), Screen 2 (132 seats), Screen 3 (59 seats)
 *
 * 2026-07-13 rewrite: the old WordPress JSON endpoint
 * (/whats-on/cinema/?ajax=1&json=1) was removed in a site restructure —
 * /whats-on/cinema/ now 301s to /cinema/ and returns HTML. We now read the
 * venue's public Spektrix v3 API directly:
 *   https://system.spektrix.com/richmix/api/v3/events      (film metadata)
 *   https://system.spektrix.com/richmix/api/v3/instances?startFrom=YYYY-MM-DD
 * Film events are identified by attribute_COGEventProgramme === "FILM".
 * Instance `startUtc` is authoritative (timeSource: "iso").
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { FestivalDetector } from "../festivals/festival-detector";

interface SpektrixEvent {
  id: string;
  name: string;
  duration?: number;
  isOnSale: boolean;
  imageUrl?: string;
  attribute_COGEventProgramme?: string;
  attribute_VENUE?: string;
}

interface SpektrixInstance {
  id: string;
  startUtc: string; // ISO UTC, e.g. "2026-07-14T09:00:00" (Z implied)
  cancelled?: boolean;
  isOnSale?: boolean;
  event: { id: string };
  attribute_MembersOnlyScreening?: boolean;
}

const SPEKTRIX_BASE = "https://system.spektrix.com/richmix/api/v3";

export class RichMixScraperV2 extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "rich-mix",
    baseUrl: "https://richmix.org.uk",
    requestsPerMinute: 30,
    delayBetweenRequests: 500,
  };

  protected async fetchPages(): Promise<string[]> {
    console.log("[rich-mix] Fetching Spektrix events + instances...");
    const events = await this.fetchUrl(`${SPEKTRIX_BASE}/events`);
    await this.delay(this.config.delayBetweenRequests);
    const startFrom = new Date().toISOString().slice(0, 10);
    const instances = await this.fetchUrl(
      `${SPEKTRIX_BASE}/instances?startFrom=${startFrom}`,
    );
    return [events, instances];
  }

  protected async parsePages(jsonPages: string[]): Promise<RawScreening[]> {
    await FestivalDetector.preload();
    const events: SpektrixEvent[] = JSON.parse(jsonPages[0]);
    const instances: SpektrixInstance[] = JSON.parse(jsonPages[1]);

    const filmEvents = new Map<string, SpektrixEvent>();
    for (const e of events) {
      if (e.attribute_COGEventProgramme === "FILM") filmEvents.set(e.id, e);
    }
    console.log(
      `[rich-mix] ${events.length} events (${filmEvents.size} film), ${instances.length} future instances`,
    );

    const now = new Date();
    const screenings: RawScreening[] = [];
    const seenIds = new Set<string>();

    for (const inst of instances) {
      if (inst.cancelled) continue;
      const event = filmEvents.get(inst.event?.id);
      if (!event) continue; // music/theatre/comedy instance

      // Spektrix omits the Z on startUtc — append if missing
      const iso = inst.startUtc.endsWith("Z") ? inst.startUtc : `${inst.startUtc}Z`;
      const datetime = new Date(iso);
      if (isNaN(datetime.getTime()) || datetime < now) continue;

      const sourceId = `richmix-${inst.id}`;
      if (seenIds.has(sourceId)) continue;
      seenIds.add(sourceId);

      const title = this.cleanEventName(event.name);
      const bookingUrl = `${this.config.baseUrl}/cinema/${this.slugifyEventName(event.name)}/`;

      screenings.push({
        filmTitle: title,
        datetime,
        bookingUrl,
        sourceId,
        runtime: event.duration && event.duration > 0 ? event.duration : undefined,
        screen: event.attribute_VENUE || undefined,
        timeSource: "iso",
        ...FestivalDetector.detect("rich-mix", title, datetime, bookingUrl),
      });
    }

    console.log(`[rich-mix] ${screenings.length} film screenings`);
    return screenings;
  }

  /** "The Odyssey (12A)" → "The Odyssey" — strip trailing BBFC rating. */
  private cleanEventName(name: string): string {
    return name
      .trim()
      .replace(/\s*\((U|PG|12A?|15|18|R18|TBC|CTBA)\*?\)\s*$/i, "")
      .trim();
  }

  /**
   * "The Odyssey (12A)" → "the-odyssey-12a" — the site's /cinema/{slug} pages
   * slugify the full event name INCLUDING the rating (verified 2026-07-13:
   * richmix.org.uk/cinema/toy-story-5-pg, /cinema/the-invite-18).
   */
  private slugifyEventName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /** The Spektrix API is the real dependency — health-check it, not the WP site. */
  async healthCheck(): Promise<boolean> {
    try {
      const body = await this.fetchUrl(`${SPEKTRIX_BASE}/events`);
      return Array.isArray(JSON.parse(body));
    } catch {
      return false;
    }
  }
}

/** Creates a Rich Mix Cinema scraper (Spektrix API, extends BaseScraper). */
export function createRichMixScraperV2(): RichMixScraperV2 {
  return new RichMixScraperV2();
}
