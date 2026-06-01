/**
 * JW3 Cinema Scraper
 *
 * Cinema: JW3 (341-351 Finchley Road, NW3 6ET — Jewish community centre with a
 *   single-screen cinema). The last London rep/indie venue that was uncovered.
 * Website: https://www.jw3.org.uk
 * Ticketing: Spektrix (client "jw3"), public read API at
 *   https://ticket.jw3.org.uk/jw3/api/v3
 *
 * Strategy (2 calls, no browser needed):
 *   1. GET /events            → keep only attribute_Genre == "Cinema"
 *   2. GET /instances?startFrom&startTo → join to the Cinema events by event.id
 * Spektrix returns `startUtc` already in UTC, so no ukLocalToUTC conversion is
 * needed (and the BST off-by-one that bit the HTML scrapers cannot occur here).
 */

import { BOT_USER_AGENT } from "../constants";
import type { RawScreening, ScraperConfig, CinemaScraper } from "../types";
import { FestivalDetector } from "../festivals/festival-detector";
import { checkHealth } from "../utils/health-check";

const JW3_CONFIG: ScraperConfig & { apiBase: string } = {
  cinemaId: "jw3",
  baseUrl: "https://www.jw3.org.uk",
  apiBase: "https://ticket.jw3.org.uk/jw3/api/v3",
  requestsPerMinute: 30,
  delayBetweenRequests: 500,
};

/** How far ahead to pull instances (JW3 publishes a couple of months out). */
const WINDOW_DAYS = 120;

interface SpektrixEvent {
  id: string;
  name: string;
  attribute_Genre?: string;
  attribute_Language?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
}

interface SpektrixInstance {
  id: string;
  start: string; // local clock-face, e.g. "2026-08-16T18:00:00"
  startUtc: string; // UTC, no trailing Z, e.g. "2026-08-16T17:00:00"
  cancelled?: boolean;
  isOnSale?: boolean;
  event?: { id: string };
}

export class JW3Scraper implements CinemaScraper {
  config = JW3_CONFIG;

  async scrape(): Promise<RawScreening[]> {
    console.log(`[jw3] Starting JW3 (Spektrix) scrape...`);
    await FestivalDetector.preload();

    // 1. Events → keep only the "Cinema" genre (JW3's programme also has
    //    talks/languages/classes/music we must exclude).
    const events = await this.fetchJson<SpektrixEvent[]>(`${this.config.apiBase}/events`);
    const cinemaEvents = new Map<string, SpektrixEvent>();
    for (const e of events) {
      if ((e.attribute_Genre || "").trim().toLowerCase() === "cinema") {
        cinemaEvents.set(e.id, e);
      }
    }
    console.log(`[jw3] ${cinemaEvents.size} Cinema events of ${events.length} total`);

    // 2. All instances in the window, joined to the Cinema events.
    const now = new Date();
    const from = now.toISOString().slice(0, 10);
    const to = new Date(now.getTime() + WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
    const instances = await this.fetchJson<SpektrixInstance[]>(
      `${this.config.apiBase}/instances?startFrom=${from}&startTo=${to}`,
    );

    const screenings: RawScreening[] = [];
    const seen = new Set<string>();

    for (const inst of instances) {
      const event = inst.event?.id ? cinemaEvents.get(inst.event.id) : undefined;
      if (!event) continue; // not a Cinema event
      if (inst.cancelled) continue;

      const datetime = this.parseUtc(inst.startUtc);
      if (!datetime || datetime < now) continue;

      const sourceId = `jw3-${inst.id}`;
      if (seen.has(sourceId)) continue;
      seen.add(sourceId);

      const filmTitle = (event.name || "").trim();
      if (!filmTitle) continue;

      const bookingUrl = `${this.config.baseUrl}/spektrix/ChooseSeats?EventInstanceId=${inst.id}`;
      const eventType = this.detectEventType(filmTitle);

      screenings.push({
        filmTitle,
        datetime,
        bookingUrl,
        sourceId,
        posterUrl: event.imageUrl || undefined,
        availabilityStatus: inst.isOnSale ? "available" : "unknown",
        ...(eventType ? { eventType } : {}),
        ...FestivalDetector.detect("jw3", filmTitle, datetime, bookingUrl),
      });
    }

    console.log(`[jw3] ${screenings.length} screenings total`);
    return screenings;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: { "User-Agent": BOT_USER_AGENT } });
    if (!res.ok) throw new Error(`JW3 fetch failed: ${res.status} ${url}`);
    return (await res.json()) as T;
  }

  /** Spektrix `startUtc` is UTC without a trailing Z — append it so Date parses
   *  it as UTC rather than local. */
  private parseUtc(s: string): Date | null {
    if (!s) return null;
    const d = new Date(s.endsWith("Z") ? s : `${s}Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  private detectEventType(title: string): string | undefined {
    if (/\+\s*Q\s*&?\s*A|in conversation/i.test(title)) return "q_and_a";
    if (/\+\s*intro/i.test(title)) return "intro";
    if (/preview/i.test(title)) return "preview";
    if (/premiere/i.test(title)) return "premiere";
    return undefined;
  }

  async healthCheck(): Promise<boolean> {
    return checkHealth(`${this.config.apiBase}/events`, {
      headers: { "User-Agent": BOT_USER_AGENT },
    });
  }
}

/** Create and return a new JW3 scraper instance. */
export function createJW3Scraper(): JW3Scraper {
  return new JW3Scraper();
}
