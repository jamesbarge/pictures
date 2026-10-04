/**
 * Ibraaz Scraper (Fitzrovia, W1)
 *
 * Ibraaz is an arts centre for art and ideas from the global majority. It
 * screens film in its Majlis and Minassa rooms alongside talks, exhibitions
 * and performances. L-CUT never listed it, so before this scraper the venue
 * had no rows at all.
 *
 * Site structure (Nuxt SSR over Craft CMS + Solspace Calendar, verified
 * 2026-10-04):
 *   - Listing: https://ibraaz.org/whats-on. Every upcoming event is an
 *     `article.card` with `.card__info .tag` labels ("Film", "Talk",
 *     "Performance", ...) and links to /whats-on/<slug>. The site's own
 *     `?category=film` filter exists, but robots.txt disallows `/*?`, so we
 *     read the unfiltered page and filter on the tags.
 *   - Detail: https://ibraaz.org/whats-on/<slug>. The `dl.summary` "Date and
 *     Time:" row holds a yearless human string such as "Sun 18 Oct, 3–4.30pm".
 *     Tickets are a Ticket Tailor widget on tickets.ibraaz.org.
 *
 * Times come ONLY from that human string. The card `time[datetime]` and the
 * payload `startDate` carry a "+00:00" offset that editors fill inconsistently:
 * Foragers (3pm BST on 18 Oct) is stored as 15:00+00:00, a 4pm instant, while
 * the archived "A Summer in La Goulette" (3pm BST) is stored as 14:00+00:00,
 * the correct one. Ticket Tailor agrees with the human string.
 */

import * as cheerio from "cheerio";
import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import {
  combineDateAndTime,
  parseScreeningDate,
  parseScreeningTime,
} from "../utils/date-parser";
import { slugify } from "../utils/url";

const BASE_URL = "https://ibraaz.org";
const LISTING_URL = `${BASE_URL}/whats-on`;

/**
 * Tags an event may carry and still be a film screening. "Film" must be
 * present; any other tag must be in this set. Seen 2026-10-04 across 31
 * archived Film events plus the live programme:
 *   - Library-in-Residence: "Library Transmission" screenings with an intro.
 *   - Talk: a screening followed by a conversation (The Last Responders).
 * Rejected co-tags: Performance (The Glass Essays performance lecture),
 * Workshop (Rihla, a lecture with excerpts) and Music (a cassette-archive day
 * with a separate performance). An unseen co-tag is rejected too, so a new
 * kind of mixed event stays out until someone looks at it.
 */
const SCREENING_TAGS = new Set(["Film", "Library-in-Residence", "Talk"]);

const TICKET_HREF_RE =
  /^https:\/\/(?:tickets\.ibraaz\.org|(?:www\.)?tickettailor\.com)\/events\//;

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** One `article.card` from /whats-on. */
export interface IbraazCard {
  slug: string;
  tags: string[];
}

/** True when an event's tags describe a film screening (see SCREENING_TAGS). */
export function isScreeningEvent(tags: string[]): boolean {
  return tags.includes("Film") && tags.every((t) => SCREENING_TAGS.has(t));
}

/** Every event card on the /whats-on listing, once per slug, in page order. */
export function parseListingCards(html: string): IbraazCard[] {
  const $ = cheerio.load(html);
  const cards = new Map<string, IbraazCard>();

  $("article.card").each((_, el) => {
    const $card = $(el);
    const href = $card.find('a[href^="/whats-on/"]').first().attr("href");
    const slug = href?.replace(/^\/whats-on\//, "").split(/[?#]/)[0];
    if (!slug || cards.has(slug)) return;

    const tags = $card
      .find(".card__info .tag")
      .map((_, t) => $(t).text().trim())
      .get()
      .filter(Boolean);
    cards.set(slug, { slug, tags });
  });

  return [...cards.values()];
}

/** Percent-decode a slug, keeping it as-is when the encoding is malformed. */
function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

/**
 * Convert one "h", "h.mm" or "h:mm" token plus a meridiem into 24-hour time,
 * via the shared parser. Without a meridiem the shared 1-9 => PM rule applies.
 */
function toTime(clock: string, meridiem: string | undefined) {
  const [h, m = "00"] = clock.split(/[.:]/);
  return parseScreeningTime(meridiem ? `${h}:${m}${meridiem}` : `${h}:${m}`);
}

/**
 * Parse an Ibraaz "Date and Time" string into the UTC start of every session.
 *
 * Shapes seen 2026-10-04: "Sun 18 Oct, 3–4.30pm", "Wednesday 3 Dec,
 * 6.30-8pm", "Sunday 19 Jul, 3—4:30 pm", "Sunday 15 Feb, 2 – 3.30 pm",
 * "Wednesday 21 Jan 2026, 6-8pm", "Saturday 27 June, 1–3pm and 7–8pm".
 *
 * The start of a range usually has no meridiem, so it borrows the end's,
 * except when that would put the start after the end ("11–1pm" starts at
 * 11am). The year comes from the shared parser's inference unless the text
 * names one. Anything else returns [] so the caller can warn: a misread
 * date is worse than a missing one.
 */
export function parseIbraazDateTimes(text: string, referenceDate = new Date()): Date[] {
  const match = text
    .replace(/\s+/g, " ")
    .trim()
    .match(/^(?:([A-Za-z]+) )?(\d{1,2}(?:st|nd|rd|th)? [A-Za-z]+(?: \d{4})?), (.+)$/);
  if (!match) return [];
  const [, weekday, dayMonth, times] = match;

  const date = parseScreeningDate(dayMonth, referenceDate);
  if (!date) return [];

  // The weekday is the only check on the inferred year: a listing that is
  // already past rolls into next year and almost always lands on another day.
  if (weekday) {
    const expected = WEEKDAYS.indexOf(weekday.slice(0, 3).toLowerCase());
    if (expected === -1 || expected !== date.getUTCDay()) return [];
  }

  const starts: Date[] = [];
  for (const session of times.split(/ (?:and|&) /)) {
    const range = session
      .trim()
      .match(/^(\d{1,2}(?:[.:]\d{2})?) ?(am|pm)?(?: ?[-–—] ?(\d{1,2}(?:[.:]\d{2})?) ?(am|pm)?)?$/i);
    if (!range) return [];
    const [, startClock, startMeridiem, endClock, endMeridiem] = range;

    let meridiem = startMeridiem?.toLowerCase();
    if (!meridiem && endClock && endMeridiem) {
      meridiem = endMeridiem.toLowerCase();
      const startHour = parseInt(startClock, 10) % 12;
      const endHour = parseInt(endClock, 10) % 12;
      if (startHour > endHour) meridiem = meridiem === "pm" ? "am" : "pm";
    }

    const time = toTime(startClock, meridiem);
    if (!time) return [];
    starts.push(combineDateAndTime(date, time));
  }
  return starts;
}

export class IbraazScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "ibraaz",
    baseUrl: BASE_URL,
    requestsPerMinute: 20,
    delayBetweenRequests: 1000,
  };

  protected async fetchPages(): Promise<string[]> {
    console.log(`[${this.config.cinemaId}] Fetching listing: ${LISTING_URL}`);
    const cards = parseListingCards(await this.fetchUrl(LISTING_URL));
    // Ibraaz always lists running exhibitions, so an empty listing means the
    // card markup changed. Fail rather than report a clean zero.
    if (cards.length === 0) {
      throw new Error(`no event cards found on ${LISTING_URL}; has the listing markup changed?`);
    }

    const filmCards = cards.filter((c) => c.tags.includes("Film"));
    const selected = filmCards.filter((c) => isScreeningEvent(c.tags));
    const skipped = filmCards.filter((c) => !isScreeningEvent(c.tags));
    console.log(
      `[${this.config.cinemaId}] ${cards.length} events, ${filmCards.length} tagged Film, ` +
        `${selected.length} kept as screenings`,
    );
    for (const c of skipped) {
      console.log(`[${this.config.cinemaId}] Skipping ${c.slug} (tags: ${c.tags.join(", ")})`);
    }

    // A failed event page fails the whole scrape so the runner retries the
    // venue; skipping it would quietly drop that film from the batch.
    const pages: string[] = [];
    for (const { slug } of selected) {
      pages.push(await this.fetchUrl(encodeURI(`${LISTING_URL}/${slug}`)));
    }
    return pages;
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const referenceDate = new Date();
    const screenings = htmlPages.flatMap((html) => this.parseEventPage(html, referenceDate));
    console.log(
      `[${this.config.cinemaId}] Parsed ${screenings.length} screenings from ${htmlPages.length} event pages`,
    );
    return screenings;
  }

  /** Public for unit tests. One RawScreening per session on an event page. */
  parseEventPage(html: string, referenceDate = new Date()): RawScreening[] {
    const $ = this.parseHtml(html);
    const filmTitle = $("h1").first().text().replace(/\s+/g, " ").trim();
    if (!filmTitle) return [];

    // The canonical is percent-encoded ("%c3%a7a-twiste-...") while listing
    // links are raw Unicode; decode so both spell the slug the same way.
    const canonical = $('link[rel="canonical"]').attr("href");
    const canonicalSlug = canonical?.match(/\/whats-on\/([^/?#]+)/)?.[1];
    const slug = canonicalSlug ? decodeSlug(canonicalSlug) : slugify(filmTitle);
    const pageUrl = encodeURI(`${LISTING_URL}/${slug}`);

    const bookingUrl =
      $("a[href]")
        .map((_, a) => $(a).attr("href"))
        .get()
        .find((href) => TICKET_HREF_RE.test(href)) ?? pageUrl;
    const posterUrl = $('meta[property="og:image"]').attr("content") || undefined;

    const $dates = $("dl.summary dt")
      .filter((_, dt) => /date and time/i.test($(dt).text()))
      .first()
      .next("dd");
    const lines = $dates.find("p").length
      ? $dates.find("p").map((_, p) => $(p).text()).get()
      : [$dates.text()];

    const screenings: RawScreening[] = [];
    for (const line of lines.map((l) => l.trim()).filter(Boolean)) {
      const starts = parseIbraazDateTimes(line, referenceDate);
      if (starts.length === 0) {
        console.warn(`[${this.config.cinemaId}] Could not read "${line}" on ${pageUrl}`);
        continue;
      }
      for (const datetime of starts) {
        screenings.push({
          filmTitle,
          datetime,
          bookingUrl,
          sourceId: `ibraaz-${slug}-${datetime.toISOString()}`,
          posterUrl,
        });
      }
    }
    if (lines.every((l) => !l.trim())) {
      console.warn(`[${this.config.cinemaId}] No "Date and Time" row on ${pageUrl}`);
    }
    return screenings;
  }
}

/** Creates a scraper for Ibraaz (Fitzrovia). */
export function createIbraazScraper(): IbraazScraper {
  return new IbraazScraper();
}
