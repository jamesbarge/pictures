/**
 * Close Up Cinema Scraper
 * Scrapes film listings from closeupfilmcentre.com
 *
 * Close Up Cinema (also known as Close-Up Film Centre) is a small independent cinema
 * in Shoreditch, East London, known for repertory programming and filmmaker seasons.
 *
 * The website embeds all screening data as JSON in a JavaScript variable:
 * var shows = [{...}, {...}]
 *
 * Structure:
 * - shows array contains screening objects with id, fp_id, title, blink, show_time, status, booking_availability, film_url
 * - show_time is in format "YYYY-MM-DD HH:MM:SS" (24-hour, already parsed)
 * - blink contains the TicketSource booking URL
 * - film_url contains the internal film page path
 *
 * ⚠️ ACCESS: every path intermittently returns 403 with `cf-mitigated: challenge`
 * and Cloudflare's "Just a moment..." interstitial. A 403 here is a real block,
 * so fail loudly — but it is a WINDOW, not a switch, and the window is much
 * shorter than a day. Measured 2026-09-20: the nightly run failed at 16:17 UTC,
 * the site served 200s at 16:36-16:39 (a full 11-page scrape, 28 screenings),
 * and it was 403 again continuously from 16:41 past 17:00.
 *
 * Re-verified the same day, while the challenge was live, that nothing about
 * OUR request changes the outcome — so do not spend time on it again:
 *   - header shape is irrelevant. Bare UA, Chrome 131 + Sec-CH-UA client hints
 *     + Sec-Fetch-*, Googlebot, and no headers at all: all 403 within a minute.
 *   - stealth Playwright does not clear it. createPersistentPage +
 *     waitForCloudflare sat on "Just a moment..." for 60s, headless AND headed.
 *   - TicketSource (the booking backend the `blink` URLs point at) is behind the
 *     same Cloudflare challenge, so it is not an alternative source.
 * Do NOT add a browser dependency or a paid proxy. The only thing that moves
 * this venue's coverage is re-attempting minutes-to-hours later, which belongs
 * to the scheduler, not here. See SCRAPING_PLAYBOOK.md.
 */

import * as cheerio from "cheerio";
import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { SCRAPER_CHALLENGE_MARKER } from "../types";
import { normalizeUrl } from "../utils/url";
import { londonParts, parseScreeningDate, ukLocalToUTC } from "../utils/date-parser";
import { FestivalDetector } from "../festivals/festival-detector";

/** Month name → zero-indexed month number (shared across date-parsing methods). */
const MONTH_NAMES: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/** Convert 12-hour time components to 24-hour format. */
function to24Hour(hour: number, ampm: string): number {
  if (ampm.toLowerCase() === "pm" && hour !== 12) return hour + 12;
  if (ampm.toLowerCase() === "am" && hour === 12) return 0;
  return hour;
}

interface CloseUpShow {
  id: string;
  fp_id: string;
  title: string;
  blink: string; // Booking URL (TicketSource)
  show_time: string; // Format: "YYYY-MM-DD HH:MM:SS"
  status: string;
  booking_availability: string;
  film_url: string;
}

export class CloseUpCinemaScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "close-up-cinema",
    baseUrl: "https://www.closeupfilmcentre.com",
    requestsPerMinute: 10,
    delayBetweenRequests: 1000,
  };

  /**
   * The site's WAF intermittently 403s bursts of requests (2026-07-13: 2/10
   * search pages failed mid-run, then returned 200 minutes later with the
   * same headers). Each page gets retries with backoff; only near-term days
   * are load-bearing. A far-future failure shortens the horizon, which the
   * next run recovers; a near-term failure would persist a hole.
   */
  private static readonly REQUIRED_DAYS = 14;

  /**
   * Hard ceiling on search-page requests, whatever the JSON and the programme
   * index say between them.
   *
   * `/search_film_programmes/?date=` returns exactly ONE day (verified: the
   * 27-09 page carries the four 27 September shows and nothing else), so the
   * sweep has to step a day at a time. The old loop stepped SEVEN days and ran
   * ten times, which sampled +7, +14 … +70 and saw roughly one day in seven
   * past the JSON window. 45 covers a ~6-week programme from the JSON boundary
   * with room to spare, and stops a misreported horizon turning into hundreds
   * of requests against a WAF-protected origin.
   */
  private static readonly MAX_SEARCH_REQUESTS = 45;

  /** Horizon used when /film_programmes/ cannot be read. */
  private static readonly FALLBACK_HORIZON_DAYS = 42;

  /**
   * Consecutive listing-free days that end the sweep early.
   *
   * Set well above the real gap pattern on purpose. Close-Up goes dark on
   * scattered single days — 6, 15, 23 and 29 October 2026 all returned zero
   * listings inside a programme that runs to 31 October — and the longest
   * consecutive run measured was ONE day. Stopping on the first empty day
   * would have truncated at 6 October and lost 34 of 59 screenings, so this
   * must never be lowered towards 1. With the published horizon in hand it
   * should never fire at all; it earns its keep only when the programme index
   * is unreadable and FALLBACK_HORIZON_DAYS overshoots a short programme.
   */
  private static readonly MAX_EMPTY_DAY_STREAK = 5;

  /**
   * Wall-clock ceiling on the day sweep, well inside the runner's 600s
   * VENUE_TIMEOUT_MS.
   *
   * MAX_SEARCH_REQUESTS bounds the request COUNT, which is a different quantity
   * from time, and time is what the venue cap measures. Measured 2026-09-22: a
   * search page is 6.37s uncontended, so a 32-day sweep is ~236s; but Close-Up's
   * homepage goes from 1.9-6.5s sequential to over 10s under the 4-way pool, and
   * at 11s/day a 32-day sweep is 352s before a single retry. A non-challenge
   * failure costs up to 105s in fetchWithRetry (3 x 30s timeouts plus 5s and 10s
   * backoff), so roughly four flaky days would breach the cap.
   *
   * A breach is worse than a short horizon: the cap message contains
   * "(venue wall-clock cap)", `isConnectionError` matches it
   * (runner-factory.ts), and three such failures trip the RUN circuit breaker
   * and skip every remaining scraper. That is precisely the 25-venue outage of
   * 2026-09-20, reachable again from one slow venue. So the sweep gives up its
   * tail instead of taking the run down with it.
   */
  private static readonly SWEEP_BUDGET_MS = 300_000;

  private static readonly DAY_MS = 86_400_000;

  /** UTC midnight stamped with a date's LONDON calendar day. */
  private static londonDay(date: Date): Date {
    const { year, month, day } = londonParts(date);
    return new Date(Date.UTC(year, month, day));
  }

  /**
   * Set once a Cloudflare challenge has been seen, and never cleared.
   *
   * The runner re-attempts a failed venue `retryAttempts + 1` times against the
   * SAME scraper instance, and each attempt used to re-run fetchWithRetry's own
   * 3 tries: 13 requests into a live challenge across 79s, which is where every
   * blocked run's near-identical 78.5-79.6s duration came from. None of them
   * could have succeeded — the challenge is IP-scoped and outlasts the whole
   * budget (measured 2026-09-20: continuously 403 from 16:41 to 16:57+ UTC,
   * having served 200s at 16:36-16:39). Remembering it collapses a blocked run
   * to a single request, and stops the venue's own retries adding request
   * volume to a WAF while it is mitigating us.
   */
  private challengeSeen = false;

  /** True when the failure is Cloudflare's challenge rather than a site error. */
  private static isChallenge(error: unknown): boolean {
    // fetchUrl surfaces the status only as text, and HTTP/2 leaves statusText
    // empty, so match the code. Every 403 measured from this host carried
    // `cf-mitigated: challenge` and the "Just a moment..." interstitial —
    // there is no ordinary 403 here to confuse it with.
    return error instanceof Error && /\bHTTP 403\b/.test(error.message);
  }

  private async fetchWithRetry(url: string, attempts = 3, backoffMs = 5_000): Promise<string> {
    let lastError: unknown;
    for (let i = 1; i <= attempts; i++) {
      try {
        return await this.fetchUrl(url);
      } catch (error) {
        lastError = error;
        if (CloseUpCinemaScraper.isChallenge(error)) {
          this.challengeSeen = true;
          throw error;
        }
        if (i < attempts) {
          console.warn(`[${this.config.cinemaId}] Attempt ${i}/${attempts} failed for ${url} — backing off ${backoffMs * i}ms`);
          await this.delay(backoffMs * i);
        }
      }
    }
    throw lastError;
  }

  /** The message every challenge path fails with — see the file header. */
  private challengeError(detail: string): Error {
    return new Error(
      `Close-Up is behind Cloudflare's challenge (${detail}). The mitigation is IP-scoped and ` +
        `clears on its own schedule: on 2026-09-20 the site served 200s at 16:36-16:39 UTC ` +
        `(a full 11-page scrape, 28 screenings) and was continuously 403 from 16:41 to 16:57+, ` +
        `while the nightly run at 16:17 failed. Re-verified that day: no header shape clears it ` +
        `(bare UA, Chrome 131 + Sec-CH-UA client hints + Sec-Fetch-*, Googlebot and no headers ` +
        `all returned 403 within the same minute), and neither does a stealth browser — ` +
        `createPersistentPage + waitForCloudflare sat on "Just a moment..." for 60s headless AND ` +
        `headed. Nothing to fix in this scraper. Do NOT add a browser dependency or a paid proxy. ` +
        `The fix is to re-attempt the venue minutes-to-hours later, not harder. ` +
        `See SCRAPING_PLAYBOOK.md → "Close-Up Film Centre". ${SCRAPER_CHALLENGE_MARKER}`,
    );
  }

  /**
   * Last London calendar day the homepage's embedded JSON already covers.
   *
   * The array is ordered and complete up to its final entry — verified
   * 2026-09-20, where its four 27 September shows are exactly the four the
   * 27 September search page lists — so every day before the last needs no
   * request at all. The last day itself IS swept, because a truncated array
   * could cut a day in half.
   */
  private jsonCoverageThrough(homepage: string, today: Date): Date {
    const shows = this.extractShowsJson(homepage);
    if (!shows || shows.length === 0) return today;

    let latestMs = today.getTime();
    for (const show of shows) {
      if (show.status !== "1" || !show.show_time) continue;
      const dt = this.parseDateTime(show.show_time);
      if (!dt || isNaN(dt.getTime())) continue;
      const dayMs = CloseUpCinemaScraper.londonDay(dt).getTime();
      if (dayMs > latestMs) latestMs = dayMs;
    }
    return new Date(latestMs);
  }

  /**
   * Last day the venue has published, read from the /film_programmes/ index.
   *
   * Every programme heading ends with its FINAL screening date, optionally
   * preceded by a start day: "3 - 31 October 2026: Winter Sleep",
   * "26 September 2026: Against all Odds: Albuquerque". The maximum across the
   * index is therefore the real horizon, and one request buys it. Measured
   * 2026-09-21: 26 programmes, latest 31 October, i.e. +40 days — so the old
   * loop's last four probes (+49 to +70) could never have returned anything.
   *
   * Returns null when the index is unreadable, so the caller falls back to a
   * fixed horizon rather than silently sweeping nothing.
   */
  private async fetchPublishedHorizon(today: Date): Promise<Date | null> {
    const url = `${this.config.baseUrl}/film_programmes/`;
    let html: string;
    try {
      html = await this.fetchWithRetry(url);
    } catch (error) {
      // A challenge here sets `challengeSeen` inside fetchWithRetry, and the
      // caller checks it rather than having this throw: the homepage is
      // already in hand and its JSON is the near-term coverage, so there is
      // nothing to gain by discarding it.
      console.warn(
        `[${this.config.cinemaId}] Could not read ${url} — falling back to a fixed horizon:`,
        error,
      );
      return null;
    }

    const $ = cheerio.load(html);
    let horizonMs = 0;

    $(".inner_block_3 h2 a").each((_, el) => {
      const match = $(el).text().trim().match(/(\d{1,2})\s+(\w+)\s+(\d{4})\s*:/);
      if (!match) return;

      const monthNum = MONTH_NAMES[match[2].toLowerCase()];
      if (monthNum === undefined) return;

      const dayMs = Date.UTC(parseInt(match[3], 10), monthNum, parseInt(match[1], 10));
      // A programme that has finished can still be listed; it cannot extend
      // the horizon.
      if (dayMs < today.getTime()) return;
      if (dayMs > horizonMs) horizonMs = dayMs;
    });

    return horizonMs > 0 ? new Date(horizonMs) : null;
  }

  protected async fetchPages(): Promise<string[]> {
    const pages: string[] = [];
    const requiredFailures: string[] = [];
    const optionalFailures: string[] = [];

    // A challenge seen on an earlier attempt of this run is still on: it lasts
    // far longer than the runner's whole retry budget. Spend no request on it.
    if (this.challengeSeen) {
      throw this.challengeError("already seen earlier in this run");
    }

    // Fetch the homepage first (has the shows JSON + the current programme).
    // A 403 here means the Cloudflare challenge is in one of its windows. Say
    // so in the thrown message, or the next reader spends an hour re-deriving
    // it — a bare "HTTP 403: Forbidden" was read as a transient blip three
    // times (2026-06-12, 2026-08-09, and again in triage on 2026-09-20).
    const homepageUrl = this.config.baseUrl;
    console.log(`[${this.config.cinemaId}] Fetching homepage: ${homepageUrl}`);
    let homepage: string;
    try {
      homepage = await this.fetchWithRetry(homepageUrl);
    } catch (error) {
      if (CloseUpCinemaScraper.isChallenge(error)) {
        throw this.challengeError("homepage");
      }
      throw error;
    }
    pages.push(homepage);

    // Sweep the date search endpoint ONE DAY at a time, because that is what it
    // returns. Format: /search_film_programmes/?date=DD-MM-YYYY
    //
    // The request count is bounded three ways rather than by a fixed loop
    // count: the sweep starts where the homepage JSON's coverage ends, it stops
    // at the horizon the programme index advertises, and MAX_SEARCH_REQUESTS
    // caps it whatever those two say.
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const today = CloseUpCinemaScraper.londonDay(new Date());
    const sweepFrom = this.jsonCoverageThrough(homepage, today);
    const publishedHorizon = await this.fetchPublishedHorizon(today);

    // The index request doubles as a probe: if it was challenged, the sweep
    // would be 45 doomed requests into a live block. Keep the homepage.
    if (this.challengeSeen) {
      console.warn(
        `[${this.config.cinemaId}] Cloudflare challenge hit the programme index. Keeping the ` +
          `homepage only (its JSON covers through ${iso(sweepFrom)}); skipping the day sweep.`,
      );
      return pages;
    }

    const horizon =
      publishedHorizon ??
      new Date(today.getTime() + CloseUpCinemaScraper.FALLBACK_HORIZON_DAYS * CloseUpCinemaScraper.DAY_MS);

    const span =
      Math.floor((horizon.getTime() - sweepFrom.getTime()) / CloseUpCinemaScraper.DAY_MS) + 1;
    const daysToFetch = Math.max(0, Math.min(span, CloseUpCinemaScraper.MAX_SEARCH_REQUESTS));

    console.log(
      `[${this.config.cinemaId}] JSON covers through ${iso(sweepFrom)}; ` +
        `${publishedHorizon ? "published" : "fallback"} horizon ${iso(horizon)}; ` +
        `sweeping ${daysToFetch} day(s)${span > daysToFetch ? ` (capped from ${span})` : ""}`,
    );

    let emptyStreak = 0;
    const sweepStartedAt = Date.now();

    for (let i = 0; i < daysToFetch; i++) {
      const elapsed = Date.now() - sweepStartedAt;
      if (elapsed >= CloseUpCinemaScraper.SWEEP_BUDGET_MS) {
        console.warn(
          `[${this.config.cinemaId}] Sweep budget spent (${Math.round(elapsed / 1000)}s of ` +
            `${CloseUpCinemaScraper.SWEEP_BUDGET_MS / 1000}s) after ${i} day(s) — stopping with ` +
            `${daysToFetch - i} day(s) unfetched rather than risking the 600s venue cap. ` +
            `Near-term coverage is unaffected; the far tail is what is lost.`,
        );
        break;
      }

      const targetDate = new Date(sweepFrom.getTime() + i * CloseUpCinemaScraper.DAY_MS);

      // Read back in UTC: the anchor is a UTC midnight stamped with a London
      // calendar day, so adding whole days never drifts across a BST boundary.
      const day = targetDate.getUTCDate().toString().padStart(2, "0");
      const month = (targetDate.getUTCMonth() + 1).toString().padStart(2, "0");
      const year = targetDate.getUTCFullYear();

      const dateUrl = `${this.config.baseUrl}/search_film_programmes/?date=${day}-${month}-${year}`;
      console.log(`[${this.config.cinemaId}] Fetching day ${i + 1}/${daysToFetch}: ${dateUrl}`);

      try {
        const html = await this.fetchWithRetry(dateUrl);
        pages.push(html);

        // A day with no timed listing is empty; the same shape the search-page
        // extractor matches. Only a long RUN of them ends the sweep.
        emptyStreak = /\d{1,2}:\d{2}\s*(?:am|pm)\s*:/i.test(html) ? 0 : emptyStreak + 1;
        if (emptyStreak >= CloseUpCinemaScraper.MAX_EMPTY_DAY_STREAK) {
          console.log(
            `[${this.config.cinemaId}] ${emptyStreak} consecutive listing-free days ending ` +
              `${iso(targetDate)} — programme looks finished, stopping ` +
              `${daysToFetch - i - 1} day(s) early.`,
          );
          break;
        }

        await this.delay(this.config.delayBetweenRequests);
      } catch (error) {
        // A challenge part-way through the sweep STOPS it and keeps what we
        // have. Three reasons it must not throw:
        //   1. Near-term coverage is already secured. The homepage JSON is
        //      request #1 and it covers every day up to `sweepFrom`, so any
        //      completed portion of the sweep is a strict gain over nothing.
        //   2. Nothing downstream deletes on a partial batch.
        //      `reportSupersededScreeningCandidates` is a `SELECT COUNT(*)`
        //      with "No runtime opt-in to deletion" (pipeline.ts:359), and
        //      pipeline.ts contains no DELETE at all.
        //   3. A block lasts ~19-27 minutes against a 600s venue cap, so
        //      waiting it out is impossible and a sweep this long will often
        //      be interrupted. Measured 2026-09-21: a window opened at
        //      10:00:23 and closed during request 10 of 33, which under a
        //      throw discarded 9 good pages AND the JSON for zero screenings.
        // The remaining days are still a foregone conclusion, so do not keep
        // feeding the WAF.
        if (CloseUpCinemaScraper.isChallenge(error)) {
          console.warn(
            `[${this.config.cinemaId}] Cloudflare challenge began during the sweep at ` +
              `${iso(targetDate)} (day ${i + 1}/${daysToFetch}). Keeping ${pages.length} page(s) ` +
              `already fetched; horizon short by ${daysToFetch - i} day(s) this run.`,
          );
          break;
        }
        console.warn(`[${this.config.cinemaId}] Failed to fetch ${dateUrl}:`, error);
        if (i < CloseUpCinemaScraper.REQUIRED_DAYS) {
          requiredFailures.push(dateUrl);
        } else {
          optionalFailures.push(dateUrl);
        }
      }
    }

    // Near-term days are required — partial near-term coverage must not be
    // persisted as a successful run (playbook rule). Far-future days only
    // shorten the horizon, and the next run covers those dates again.
    if (requiredFailures.length > 0) {
      throw new Error(
        `Failed to fetch ${requiredFailures.length} near-term Close-Up search pages ` +
          `(first ${CloseUpCinemaScraper.REQUIRED_DAYS} days of the sweep from ${iso(sweepFrom)})`,
      );
    }
    if (optionalFailures.length > 0) {
      console.warn(
        `[${this.config.cinemaId}] ${optionalFailures.length} far-future search pages failed after retries — horizon shortened this run`,
      );
    }

    return pages;
  }

  // healthCheck() is deliberately NOT overridden (override removed 2026-08-09).
  // Both halves of its old rationale are now false: BaseScraper.healthCheck
  // sends fetchUrl's exact headers with the same 30s timeout, and a 403 here is
  // a real block, not a false negative — the header shape never mattered, the
  // Turnstile does. It also had nothing left to protect: the precheck in
  // runner-factory is advisory-only and can no longer veto a scrape. All it
  // bought was 3 doomed attempts and 12s of backoff on a 403 that base
  // fast-fails in one request (measured 16.4s/3 requests → 0.2s/1 on 2026-08-09).
  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    await FestivalDetector.preload();
    const screenings: RawScreening[] = [];
    const now = new Date();
    const seenKeys = new Set<string>(); // For deduplication
    let jsonCount = 0;
    let htmlCount = 0;

    // The homepage's "what's on" list is read as a title lookup keyed by start
    // instant, not as a screening source of its own. Measured on 2026-09-20 it
    // produced four bad rows for the one it rescued: a phantom 16:00 "Drive My
    // Car" (the hand-written copy says "4pm", the booking system says 16:30),
    // two title-variant duplicates of shows the JSON already had ("Last Things"
    // vs "Beyond Human Time: Last Things", "One Minute Vol 1" vs "One Minute
    // Volume 1") and a 2027-09-20 row for that evening's screening. Its one
    // real contribution is naming shows whose JSON `title` is null, which is
    // what it is kept for.
    const homepageTitles = this.extractHomepageTitles(htmlPages[0] ?? "");

    for (const html of htmlPages) {
      // 1. Embedded shows JSON — the booking system's own data, and the
      //    authority for title, time and booking link. It is served on EVERY
      //    page, not only the homepage, so reading it everywhere keeps the
      //    current programme even when one page comes back challenged.
      const jsonScreenings = this.extractFromJson(html, now, seenKeys, homepageTitles);
      jsonCount += jsonScreenings.length;
      screenings.push(...jsonScreenings);

      // 2. Day listings on the search pages — the only source for dates beyond
      //    the JSON's ~10-day window.
      const pageHtmlScreenings = this.extractFromHtml(html, now, seenKeys);
      htmlCount += pageHtmlScreenings.length;
      screenings.push(...pageHtmlScreenings);
    }

    console.log(`[${this.config.cinemaId}] Found ${screenings.length} future screenings (JSON: ${jsonCount}, HTML: ${htmlCount})`);
    return screenings;
  }

  /**
   * Extract screenings from the embedded JSON shows data.
   * Mirrors extractFromHtml — same signature, different data source.
   *
   * `titleFallbacks` maps a start instant to the homepage's display title and
   * is consulted only where the JSON carries `"title": null`, which the site
   * does emit (id 59730, "Alice Doesn't Live Here Anymore", 2026-09-26).
   * Without it those shows are dropped entirely.
   */
  private extractFromJson(
    html: string,
    now: Date,
    seenKeys: Set<string>,
    titleFallbacks: Map<string, string>,
  ): RawScreening[] {
    const showsData = this.extractShowsJson(html);
    if (!showsData || showsData.length === 0) return [];

    const screenings: RawScreening[] = [];

    for (const show of showsData) {
      if (!show.show_time) continue;
      if (show.status !== "1") continue;

      const datetime = this.parseDateTime(show.show_time);
      if (!datetime || isNaN(datetime.getTime())) continue;
      if (datetime < now) continue;

      const key = datetime.toISOString();
      const title = (show.title ?? titleFallbacks.get(key) ?? "").trim();
      if (!title) continue;

      let bookingUrl = show.blink;
      if (!bookingUrl && show.film_url) {
        bookingUrl = normalizeUrl(show.film_url, this.config.baseUrl);
      }
      if (!bookingUrl) continue;

      const sourceId = `close-up-${show.id}-${key}`;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        screenings.push({
          filmTitle: title,
          datetime,
          bookingUrl,
          sourceId,
          ...FestivalDetector.detect("close-up-cinema", title, datetime, bookingUrl),
        });
      }
    }

    return screenings;
  }

  /**
   * Map each homepage listing's start instant to its display title.
   *
   * Format: "Thu 1 January, 8.15pm: Film Title" in `.inner_block_3 h2 a`.
   */
  private extractHomepageTitles(html: string): Map<string, string> {
    const titles = new Map<string, string>();
    if (!html) return titles;

    const $ = cheerio.load(html);
    $(".inner_block_3 h2 a").each((_, el) => {
      const text = $(el).text().trim();

      // "Sun 4 January, 8pm: Taste of Cherry" — minutes are optional.
      const match = text.match(/^(\w+)\s+(\d+)\s+(\w+),?\s+(\d+)(?:[.:](\d+))?(am|pm):\s*(.+)$/i);
      if (!match) return;

      const [, weekday, day, month, hour, minute = "0", ampm, title] = match;

      const datetime = this.parseHtmlDateTime(weekday, day, month, hour, minute, ampm);
      if (!datetime) return;

      titles.set(datetime.toISOString(), title.trim());
    });

    return titles;
  }

  /**
   * Extract screenings from a search page's day listing.
   * Format: "04:30 pm : Film Title" in a > span, under one date heading.
   *
   * The homepage's own h2 listing is NOT read here — see parsePages.
   */
  private extractFromHtml(html: string, now: Date, seenKeys: Set<string>): RawScreening[] {
    const screenings: RawScreening[] = [];
    const $ = cheerio.load(html);

    // Search page format: "04:30 pm : Film Title" in spans
    // First, try to find the date from the page (look for date heading)
    const pageDate = this.extractPageDate(html);

    if (pageDate) {
      $("a span").each((_, el) => {
        const text = $(el).text().trim();
        const href = $(el).parent("a").attr("href");

        // Parse format: "04:30 pm : Film Title" or "08:00 pm : The Liberated Film Club: Jennifer Lucy Allan"
        const match = text.match(/^(\d{1,2}):(\d{2})\s*(am|pm)\s*:\s*(.+)$/i);
        if (!match) return;

        const [, hour, minute, ampm, rawTitle] = match;

        // `(.+)` can match whitespace alone, so guard here as well as in
        // extractFromJson. BaseScraper.validate drops empty titles too
        // (reason `missing_title`), but the invariant belongs at the point the
        // screening is built, not only downstream of it.
        const title = rawTitle.trim();
        if (!title) return;

        // Use the page date with the time from the listing
        const datetime = this.combineDateAndTime(pageDate, hour, minute, ampm);
        if (!datetime || datetime < now) return;

        const bookingUrl = href ? normalizeUrl(href, this.config.baseUrl) : null;
        if (!bookingUrl) return;

        // Keyed on the start instant alone: Close-Up is a single-screen venue,
        // so two entries at the same minute are always the same screening
        // described twice, and keying on title as well let every spelling
        // variant through as a separate row.
        const dedupeKey = datetime.toISOString();
        if (seenKeys.has(dedupeKey)) return;

        seenKeys.add(dedupeKey);
        const sourceId = `close-up-search-${datetime.toISOString()}-${title.replace(/\s+/g, "-").toLowerCase()}`;

        screenings.push({
          filmTitle: title,
          datetime,
          bookingUrl,
          sourceId,
          ...FestivalDetector.detect("close-up-cinema", title, datetime, bookingUrl),
        });
      });
    }

    return screenings;
  }

  /**
   * Extract the date from a search results page
   * Look for patterns like "Saturday, 31 January" in the page
   */
  private extractPageDate(html: string): Date | null {
    // Look for date in URL parameter first
    const urlMatch = html.match(/date=(\d{2})-(\d{2})-(\d{4})/);
    if (urlMatch) {
      const [, day, month, year] = urlMatch;
      return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
    }

    // Look for date heading like "Saturday, 31 January"
    const dateHeadingMatch = html.match(/(\w+),?\s+(\d{1,2})\s+(\w+)\s+(\d{4})?/);
    if (dateHeadingMatch) {
      const [, , day, month, year] = dateHeadingMatch;
      const monthNum = MONTH_NAMES[month.toLowerCase()];
      if (monthNum !== undefined) {
        const yearNum = year ? parseInt(year) : new Date().getUTCFullYear();
        return new Date(Date.UTC(yearNum, monthNum, parseInt(day)));
      }
    }

    return null;
  }

  /**
   * Combine a date with time components
   */
  private combineDateAndTime(date: Date, hour: string, minute: string, ampm: string): Date {
    const hourNum = to24Hour(parseInt(hour, 10), ampm);
    const minuteNum = parseInt(minute, 10);
    return ukLocalToUTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hourNum,
      minuteNum,
    );
  }

  /**
   * Parse datetime from HTML components: "Sun", "1", "January", "8", "15", "pm"
   *
   * The year is inferred by the shared parser, which compares LONDON calendar
   * days. The local version compared the parsed day's UTC midnight against
   * `now`, so from midnight onwards today read as past and tonight's screening
   * rolled a full year forward — measured 2026-09-20, where "Sun 20 September,
   * 6pm" resolved to 2027-09-20T17:00Z. That is the same defect #750 fixed in
   * parseScreeningDate; this scraper had its own copy of it.
   */
  private parseHtmlDateTime(
    weekday: string,
    day: string,
    month: string,
    hour: string,
    minute: string,
    ampm: string,
  ): Date | null {
    const date = parseScreeningDate(`${weekday} ${day} ${month}`);
    if (!date || isNaN(date.getTime())) return null;

    const hourNum = to24Hour(parseInt(hour, 10), ampm);
    const minuteNum = parseInt(minute, 10);

    // Build UTC explicitly with BST offset — never rely on the runtime TZ.
    return ukLocalToUTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hourNum,
      minuteNum,
    );
  }

  /**
   * Extract the shows JSON array from the page HTML
   * The site uses: var shows ='[{...}]'; (JSON string wrapped in single quotes)
   * NOT: var shows = [{...}]; (direct JSON array)
   */
  private extractShowsJson(html: string): CloseUpShow[] | null {
    // The site wraps JSON in single quotes as a string: var shows ='[...]';
    // This pattern extracts the JSON string content
    const stringPattern = /var\s+shows\s*=\s*'(\[[\s\S]*?\])'\s*;/;
    const stringMatch = html.match(stringPattern);

    if (stringMatch && stringMatch[1]) {
      try {
        // The JSON has escaped forward slashes (\/), which is valid JSON
        const parsed = JSON.parse(stringMatch[1]);
        if (Array.isArray(parsed)) {
          return parsed as CloseUpShow[];
        }
      } catch (error) {
        console.warn(`[${this.config.cinemaId}] Failed to parse shows JSON string:`, error);
      }
    }

    // Fallback: Try direct JSON array patterns (in case site format changes)
    const directPatterns = [
      /var\s+shows\s*=\s*(\[[\s\S]*?\]);/,
      /let\s+shows\s*=\s*(\[[\s\S]*?\]);/,
      /const\s+shows\s*=\s*(\[[\s\S]*?\]);/,
    ];

    for (const pattern of directPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (Array.isArray(parsed)) {
            return parsed as CloseUpShow[];
          }
        } catch {
          // Continue to next pattern
        }
      }
    }

    return null;
  }

  /**
   * Parse datetime from "YYYY-MM-DD HH:MM:SS" format
   */
  private parseDateTime(dateTimeStr: string): Date | null {
    if (!dateTimeStr) {
      return null;
    }

    // Format: "2025-12-28 14:00:00"
    // Split into date and time parts
    const parts = dateTimeStr.trim().split(" ");
    if (parts.length !== 2) {
      return null;
    }

    const [datePart, timePart] = parts;

    // Parse date: YYYY-MM-DD
    const dateMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) {
      return null;
    }

    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1; // JS months are 0-indexed
    const day = parseInt(dateMatch[3], 10);

    // Parse time: HH:MM:SS
    const timeMatch = timePart.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (!timeMatch) {
      return null;
    }

    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = parseInt(timeMatch[3], 10);

    // Build UTC explicitly with BST offset — never rely on the runtime TZ.
    const date = ukLocalToUTC(year, month, day, hours, minutes);
    if (seconds) date.setUTCSeconds(seconds);
    return date;
  }

}

/** Creates a scraper for Close-Up Film Centre (Shoreditch). */
export function createCloseUpCinemaScraper(): CloseUpCinemaScraper {
  return new CloseUpCinemaScraper();
}
