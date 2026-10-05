/**
 * David Lean Cinema Scraper
 *
 * Cinema: The David Lean Cinema (Croydon Clocktower)
 * Address: Katharine Street, Croydon CR9 1ET
 * Website: https://www.davidleancinema.uk (redirected from .org.uk)
 *
 * Reads the venue's public TicketSolve XML feed (switched 2026-10-04). A plain
 * fetch returns 200 with every published event: an ISO start with
 * TicketSolve's own UTC offset, a per-event booking URL and a per-event detail
 * feed. It replaced a Playwright scrape of the Divi homepage that waited on
 * `networkidle` and regex-parsed innerText, which read doors times as start
 * times (Animal Shorts, 4 Oct: "from 10.30am" for a 12:00 start) and only
 * reached as far as the homepage's current month.
 */

import * as cheerio from "cheerio";

import { BOT_USER_AGENT } from "../constants";
import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { parseUKLocalDateTime } from "../utils/date-parser";
import { checkHealth } from "../utils/health-check";
import { sanitizeRuntime } from "../utils/metadata-parser";

export const DAVID_LEAN_FEED_URL = "https://davidleancinema.ticketsolve.com/shows.xml";

/** One event as listed in shows.xml. */
interface FeedEvent {
  eventId: string;
  showName: string;
  description: string;
  startIso: string;
  bookingUrl: string;
  /** Lowercased feed label: "available" or "sold out" as measured. */
  status: string;
  /** This event's own XML, the only place onsale_time and seat counts appear. */
  detailUrl: string;
}

/** What an event's own XML adds: whether it is on sale and how many seats are left. */
interface EventDetail {
  available: number | null;
  onsaleAt: Date | null;
}

/**
 * Trailing parenthetical naming the kind of screening:
 * "SCHOOL OF ROCK (Dementia-Friendly Screening)", "THE INVITE (Babes-In-Arms)".
 * Left in the title it reaches film matching and TMDB as part of the name.
 */
const SCREENING_NOTE = /\s*\(([^()]*\b(?:screening|babes[- ]in[- ]arms)\b[^()]*)\)\s*$/i;

/**
 * Wall-clock budget for the per-event detail fetches. Each fetchUrl may take
 * up to 30s, so 27 hung endpoints would run past the runner's 600s venue cap;
 * availability is optional and is the part to give up.
 */
const DETAIL_BUDGET_MS = 60_000;

/**
 * "UK | 1958 | 83 mins", "USA/UK | 2025| 100 mins": year then runtime. No
 * trailing word boundary: the description's divs run together as text, so
 * the next line follows directly ("112 minsDirector: Morgan Matthews").
 */
const STATS_LINE = /\|\s*((?:19|20)\d{2})\s*\|\s*(\d{2,3})\s*min/i;

export class DavidLeanScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "david-lean-cinema",
    baseUrl: "https://www.davidleancinema.uk",
    requestsPerMinute: 60,
    // Applied before every request: the feed plus one detail XML per
    // "sold out" event (27 on 2026-10-04).
    delayBetweenRequests: 250,
  };

  protected async fetchPages(): Promise<string[]> {
    // The feed is the whole programme, so a failure here fails the venue.
    const feed = await this.fetchUrl(DAVID_LEAN_FEED_URL);

    const now = new Date();
    const pending = this.readFeed(feed).filter((event) => {
      if (event.status !== "sold out" || !event.detailUrl) return false;
      const start = this.startInstant(event.startIso);
      return start !== null && start.datetime >= now;
    });

    // Availability is optional: every screening is published whatever happens
    // here, and an event without its detail keeps availability unset.
    const details: string[] = [];
    const startedAt = Date.now();
    for (const [i, event] of pending.entries()) {
      if (Date.now() - startedAt >= DETAIL_BUDGET_MS) {
        console.warn(
          `[${this.config.cinemaId}] Detail budget spent after ${i} of ${pending.length} events; ` +
            `leaving the rest with availability unset.`,
        );
        break;
      }
      try {
        details.push(await this.fetchUrl(event.detailUrl));
      } catch (error) {
        // One failing endpoint usually means all of them are failing.
        console.warn(
          `[${this.config.cinemaId}] Could not read ${event.detailUrl}; stopping detail fetches and ` +
            `leaving ${pending.length - i} event(s) with availability unset:`,
          error,
        );
        break;
      }
    }

    return [feed, ...details];
  }

  protected async parsePages(pages: string[]): Promise<RawScreening[]> {
    const [feed, ...detailPages] = pages;
    const details = new Map<string, EventDetail>();
    for (const xml of detailPages) {
      const $ = cheerio.load(xml, { xml: true });
      const event = $("event").first();
      const id = event.attr("id");
      if (!id) continue;
      const available = parseInt(event.children("available").text().trim(), 10);
      const onsale = event.children("onsale_time").text().trim();
      details.set(id, {
        available: Number.isNaN(available) ? null : available,
        onsaleAt: onsale && !Number.isNaN(Date.parse(onsale)) ? new Date(onsale) : null,
      });
    }

    const now = new Date();
    const screenings: RawScreening[] = [];
    for (const event of this.readFeed(feed ?? "")) {
      const start = this.startInstant(event.startIso);
      if (!start) {
        console.warn(
          `[${this.config.cinemaId}] Unreadable start "${event.startIso}" for ${event.showName} (event ${event.eventId})`,
        );
        continue;
      }

      const note = event.showName.match(SCREENING_NOTE);
      const stats = cheerio.load(event.description).text().match(STATS_LINE);
      // The note leaves the title, so title classification cannot see it.
      const relaxed = note !== null && /\brelaxed\b/i.test(note[1]);

      screenings.push({
        filmTitle: note ? event.showName.slice(0, note.index).trim() : event.showName,
        datetime: start.datetime,
        bookingUrl: event.bookingUrl,
        sourceId: `david-lean-${event.eventId}`,
        timeSource: start.timeSource,
        availabilityStatus: this.availability(event, details.get(event.eventId), now),
        ...(note && { eventDescription: note[1].trim() }),
        ...(relaxed && { eventType: "relaxed" }),
        ...(stats && { year: parseInt(stats[1], 10), runtime: sanitizeRuntime(parseInt(stats[2], 10)) }),
      });
    }

    console.log(`[${this.config.cinemaId}] Parsed ${screenings.length} events from the TicketSolve feed`);
    return screenings;
  }

  /**
   * Every event in shows.xml under the David Lean venue.
   *
   * Throws when there is no such venue: a 200 that is a challenge page, a
   * maintenance page or a renamed venue would otherwise be recorded as a
   * successful run with 0 screenings.
   */
  private readFeed(xml: string): FeedEvent[] {
    const $ = cheerio.load(xml, { xml: true });
    const events: FeedEvent[] = [];
    let venueSeen = false;

    $("venues > venue").each((_, venue) => {
      const venueName = $(venue).children("name").text().trim();
      // One TicketSolve account can sell for more than one venue; only this
      // one is the cinema.
      if (!/david lean/i.test(venueName)) {
        console.warn(`[${this.config.cinemaId}] Skipping TicketSolve venue "${venueName}"`);
        return;
      }
      venueSeen = true;

      $(venue).find("shows > show").each((_, show) => {
        const showName = $(show).children("name").text().trim();
        const description = $(show).children("description").text();
        $(show).find("events > event").each((_, el) => {
          const event = $(el);
          const eventId = event.attr("id");
          const bookingUrl = event.children("url").text().trim();
          if (!eventId || !showName || !bookingUrl) return;
          events.push({
            eventId,
            showName,
            description,
            startIso: event.children("date_time_iso").text().trim(),
            bookingUrl,
            status: event.children("status").text().trim().toLowerCase(),
            detailUrl: event.children("feed").children("url").text().trim(),
          });
        });
      });
    });

    if (!venueSeen) {
      throw new Error(
        `${DAVID_LEAN_FEED_URL} returned no David Lean venue (first bytes: ` +
          `${JSON.stringify(xml.slice(0, 120))}). Expected the TicketSolve shows feed.`,
      );
    }
    return events;
  }

  /**
   * The event's start instant.
   *
   * `date_time_iso` carries TicketSolve's own UTC offset, "+01:00" before the
   * 25 October 2026 change and "+00:00" after, so it is an absolute instant.
   * Its wall-clock half is re-read as London time through the shared parser
   * as a check: the two agree unless TicketSolve's venue timezone is wrong,
   * and then London wins, because the venue and every printed listing are in
   * London. A wall clock read that way is labelled "local-24h", the
   * provenance for a local 24-hour clock.
   */
  private startInstant(iso: string): { datetime: Date; timeSource: "iso" | "local-24h" } | null {
    const match = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2})?(Z|[+-]\d{2}:?\d{2})?$/);
    if (!match) return null;
    const london = parseUKLocalDateTime(match[1]);
    if (Number.isNaN(london.getTime())) return null;
    if (!match[2]) return { datetime: london, timeSource: "local-24h" };

    const instant = new Date(iso);
    if (instant.getTime() === london.getTime()) return { datetime: instant, timeSource: "iso" };

    console.warn(
      `[${this.config.cinemaId}] TicketSolve offset in "${iso}" is not London's; ` +
        `using ${london.toISOString()} for that London wall clock`,
    );
    return { datetime: london, timeSource: "local-24h" };
  }

  /**
   * Availability, believed only on evidence.
   *
   * TicketSolve labels an event "sold out" until it goes on sale. Measured
   * 2026-10-04: all 27 November events read "sold out" in shows.xml while
   * their own XML said 68 of 68 seats available with onsale_time 2026-10-08
   * 09:00 BST. Flagging those would put a SOLD OUT tag on a month the venue
   * has not started selling, so "sold out" needs the event to be on sale AND
   * out of seats. Anything short of that is left unset.
   */
  private availability(
    event: FeedEvent,
    detail: EventDetail | undefined,
    now: Date,
  ): RawScreening["availabilityStatus"] {
    if (event.status === "available") return "available";
    if (event.status !== "sold out" || !detail) return undefined;
    // An event with no onsale_time gives no evidence it is on sale.
    if (!detail.onsaleAt || detail.onsaleAt > now) return undefined;
    return detail.available === 0 ? "sold_out" : undefined;
  }

  // Probes the feed, the one dependency the scrape has.
  async healthCheck(): Promise<boolean> {
    return checkHealth(DAVID_LEAN_FEED_URL, {
      headers: { "User-Agent": BOT_USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
  }
}

/** Creates a scraper for David Lean Cinema (Croydon). */
export function createDavidLeanScraper(): DavidLeanScraper {
  return new DavidLeanScraper();
}
