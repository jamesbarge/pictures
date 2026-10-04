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
 *   1. GET /events            → keep film events (see jw3FilmTitle)
 *   2. GET /instances?startFrom&startTo → join to the film events by event.id
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

/**
 * Label before the title colon that marks a film night filed outside the
 * "Cinema" genre: "Young JW3 Queer Movie & Pizza Night: Call Me By Your Name",
 * "Young JW3 x Young UJIA: Film Club: Entebbe".
 */
const FILM_NIGHT_LABEL = /\b(?:movie|film)\b.*\b(?:night|club)\b/i;

/**
 * The film title to list for a Spektrix event, or null when it is not a film.
 *
 * Every "Cinema" genre event is a film under its own name. Film nights also
 * appear under other genres (two under "Young Professionals" on 2026-10-04),
 * and no structured field marks them: genre, seating plan and every
 * attribute_* field match the workshops around them, and descriptions
 * mention films in talks too. The name is the only signal, so an event from
 * another genre counts only when the segment before its last colon names a
 * movie/film night or club, and the film is what follows that colon.
 */
export function jw3FilmTitle(event: SpektrixEvent): string | null {
  const name = (event.name || "").trim();
  if ((event.attribute_Genre || "").trim().toLowerCase() === "cinema") return name || null;

  const colon = name.lastIndexOf(":");
  if (colon === -1) return null;
  const label = name.slice(0, colon).split(":").pop() ?? "";
  const title = name.slice(colon + 1).trim();
  return title && FILM_NIGHT_LABEL.test(label) ? title : null;
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

    // 1. Events → films (JW3's programme also has talks/languages/classes/
    //    music we must exclude).
    const events = await this.fetchJson<SpektrixEvent[]>(`${this.config.apiBase}/events`);
    const filmEvents = new Map<string, { event: SpektrixEvent; filmTitle: string }>();
    for (const e of events) {
      const filmTitle = jw3FilmTitle(e);
      if (filmTitle) filmEvents.set(e.id, { event: e, filmTitle });
    }
    console.log(`[jw3] ${filmEvents.size} film events of ${events.length} total`);

    // 2. All instances in the window, joined to the film events.
    const now = new Date();
    const from = now.toISOString().slice(0, 10);
    const to = new Date(now.getTime() + WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
    const instances = await this.fetchJson<SpektrixInstance[]>(
      `${this.config.apiBase}/instances?startFrom=${from}&startTo=${to}`,
    );

    const screenings: RawScreening[] = [];
    const seen = new Set<string>();

    for (const inst of instances) {
      const film = inst.event?.id ? filmEvents.get(inst.event.id) : undefined;
      if (!film) continue; // not a film event
      if (inst.cancelled) continue;
      const { event, filmTitle } = film;

      const datetime = this.parseUtc(inst.startUtc);
      if (!datetime || datetime < now) continue;

      const sourceId = `jw3-${inst.id}`;
      if (seen.has(sourceId)) continue;
      seen.add(sourceId);

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
    // The Spektrix API 405s on HEAD (verified), so the default HEAD probe
    // would report a false negative. Force GET — `checkHealth` spreads these
    // options after its own `method: "HEAD"`, so `method` here wins.
    return checkHealth(`${this.config.apiBase}/events`, {
      method: "GET",
      headers: { "User-Agent": BOT_USER_AGENT },
    });
  }
}

/** Create and return a new JW3 scraper instance. */
export function createJW3Scraper(): JW3Scraper {
  return new JW3Scraper();
}
