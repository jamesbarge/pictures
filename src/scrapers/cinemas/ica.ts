/**
 * ICA Cinema Scraper
 * Scrapes film listings from ica.art
 *
 * Discovery (see SCRAPING_PLAYBOOK.md, ICA section):
 *   1. /films tiles of every type. ICA puts film screenings it files under
 *      Live or Exhibitions on /films too (e.g. /live/tg50-heathen-earth,
 *      /exhibitions/artists-film-picks-*).
 *   2. /upcoming, the site's own day-by-day calendar (~30 days), Films items
 *      only. It links individual festival screenings directly.
 *   3. One level of hub expansion. Season and festival pages (/films/imamura,
 *      /films/bfi-london-film-festival-2026, ...) carry no performance list;
 *      their screenings live on child pages linked from the page body. Most
 *      of a season's later dates are only reachable this way.
 * Each event page carries the same `.performance-list .performance` markup.
 * Talks and gigs use it too, so only performances in a Cinema screen are kept.
 */

import { BaseScraper } from "../base";
import type { RawScreening, ScraperConfig } from "../types";
import { parseScreeningDate, parseScreeningTime, combineDateAndTime } from "../utils/date-parser";
import type { CheerioAPI } from "../utils/cheerio-types";
import { FestivalDetector } from "../festivals/festival-detector";
import { sanitizeRuntime } from "../utils/metadata-parser";

interface FilmInfo {
  title: string;
  director?: string;
  year?: number;
  runtime?: number;
}

interface QueuedPage {
  url: string;
  /** 0 = linked from an index page; 1 = child of a hub. Only depth 0 expands. */
  depth: number;
}

/**
 * Discovery budgets. The venue wall-clock cap (10 minutes) covers fetching AND
 * the pipeline, and ICA has hit it before (2026-09-02). The 2026-10-04 crawl
 * made 147 fetches at ~1.77s each (~263s). Whichever budget runs out first
 * stops new fetches. Hub children are queued in the order their hubs appear
 * in the /films tiles, so a budget hit drops the children of the last hubs.
 */
const MAX_PAGE_FETCHES = 170;
const DISCOVERY_TIME_BUDGET_MS = 300_000;

/** Declared request rate; the per-request delay is derived from it. */
const REQUESTS_PER_MINUTE = 60;

/** Single-segment paths that are section indexes, not event pages. */
const SECTION_INDEXES = new Set([
  "films", "live", "talks", "exhibitions", "calendar",
  "today", "tomorrow", "next-7-days", "upcoming",
]);

/** Path prefixes that are never event pages (booking, CMS admin, assets). */
const NON_EVENT_PREFIXES = ["/book/", "/open-records-generator/", "/static/", "/media/"];

export class ICAScraper extends BaseScraper {
  config: ScraperConfig = {
    cinemaId: "ica",
    baseUrl: "https://www.ica.art",
    requestsPerMinute: REQUESTS_PER_MINUTE,
    // fetchUrl waits this long before every request. The site is not
    // bot-protected; 1s matches the codebase norm.
    delayBetweenRequests: 60_000 / REQUESTS_PER_MINUTE,
  };

  /**
   * Load the festival cache before any fetching. A database blip then fails
   * the run in seconds, before ~4 minutes of page fetches.
   */
  protected async initialize(): Promise<void> {
    await FestivalDetector.preload();
  }

  protected async fetchPages(): Promise<string[]> {
    const id = this.config.cinemaId;
    const startedAt = Date.now();

    // /films is required: a failure here throws rather than returning a
    // silently partial programme.
    const filmsUrl = `${this.config.baseUrl}/films`;
    console.log(`[${id}] Fetching film listing: ${filmsUrl}`);
    const $films = this.parseHtml(await this.fetchUrl(filmsUrl));
    const tileHrefs = $films(".item > a").map((_, el) => $films(el).attr("href")).get();

    // /upcoming is best-effort. On 2026-10-04 it added one page the /films
    // tiles and hubs did not reach (lff-minotaur).
    const upcomingUrl = `${this.config.baseUrl}/upcoming`;
    let calendarHrefs: string[] = [];
    try {
      console.log(`[${id}] Fetching calendar: ${upcomingUrl}`);
      const $upcoming = this.parseHtml(await this.fetchUrl(upcomingUrl));
      // The calendar also lists talks, live music and exhibitions; Films only.
      calendarHrefs = $upcoming(".item.films > a").map((_, el) => $upcoming(el).attr("href")).get();
    } catch (error) {
      console.warn(`[${id}] Calendar ${upcomingUrl} failed; continuing with /films and its hubs:`, error);
    }

    const queue: QueuedPage[] = [];
    const seen = new Set<string>();
    const enqueue = (href: string | undefined, depth: number): boolean => {
      const url = this.toEventUrl(href);
      if (!url) return false;
      // The same page is linked under several paths (/films/lff-lali and
      // /films/bfi-london-film-festival-2026/lff-lali; /imamura-stolen-desire
      // and /films/imamura-stolen-desire). The final segment identifies it.
      const key = url.slice(url.lastIndexOf("/") + 1);
      if (seen.has(key)) return false;
      seen.add(key);
      queue.push({ url, depth });
      return true;
    };
    for (const href of [...tileHrefs, ...calendarHrefs]) enqueue(href, 0);
    console.log(
      `[${id}] Found ${queue.length} pages to scrape (${tileHrefs.length} /films tiles, ` +
        `${calendarHrefs.length} /upcoming film items)`,
    );

    const pages: string[] = [];
    let hubs = 0;
    let fetched = 0;
    const failed = { seed: 0, hubChild: 0 };
    for (let i = 0; i < queue.length; i++) {
      const elapsedMs = Date.now() - startedAt;
      if (fetched >= MAX_PAGE_FETCHES || elapsedMs >= DISCOVERY_TIME_BUDGET_MS) {
        const reason = fetched >= MAX_PAGE_FETCHES
          ? `page budget (${MAX_PAGE_FETCHES})`
          : `time budget (${DISCOVERY_TIME_BUDGET_MS / 1000}s)`;
        const skipped = queue.slice(i).map((q) => q.url);
        console.warn(
          `[${id}] Discovery stopped at the ${reason} after ${Math.round(elapsedMs / 1000)}s; ` +
            `${skipped.length} queued page(s) not fetched: ${skipped.join(", ")}`,
        );
        break;
      }
      const { url, depth } = queue[i];
      fetched++;
      try {
        console.log(`[${id}] Fetching: ${url}`);
        const html = await this.fetchUrl(url);
        const $ = this.parseHtml(html);
        if ($(".performance-list .performance").length > 0) {
          pages.push(html);
        } else if (depth === 0) {
          // Hub page: queue the child pages linked from its body. Links inside
          // collapsed <details> blocks are the hub's archive (Off-Circuit lists
          // ~50 past releases there, Long Takes its past seasons); skipping them
          // saves ~60 fetches of pages with no future screenings.
          hubs++;
          let added = 0;
          $("#detail-body a[href], #detail-side a[href]").each((_, el) => {
            if ($(el).closest("details").length > 0) return;
            if (enqueue($(el).attr("href"), depth + 1)) added++;
          });
          if (added > 0) console.log(`[${id}] Hub ${url}: queued ${added} child page(s)`);
        }
      } catch (error) {
        if (depth === 0) failed.seed++;
        else failed.hubChild++;
        console.error(`[${id}] Failed to fetch ${url}:`, error);
      }
    }

    console.log(`[${id}] Fetched ${fetched} pages: ${pages.length} with performances, ${hubs} hubs`);
    if (failed.seed + failed.hubChild > 0) {
      // One line per run so a partial crawl is visible next to the counts. A
      // failed seed may have been a hub, which hides all of its children too.
      console.warn(
        `[${id}] ${failed.seed + failed.hubChild} page fetch(es) failed ` +
          `(${failed.seed} from /films or /upcoming, ${failed.hubChild} hub children); ` +
          `this run's programme is incomplete`,
      );
    }
    return pages;
  }

  /**
   * Resolve a link to a canonical www.ica.art event-page URL, or null when it
   * points somewhere that can't be an event page (another host, a section
   * index, booking, assets, calendar day links, excluded archive paths).
   */
  private toEventUrl(href: string | undefined): string | null {
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) return null;
    // A scheme-less external link ("www.docnrollfestival.com") would otherwise
    // resolve as a relative path on ica.art and 404.
    if (/^[^/:]+\.[a-z]{2,}(\/|$)/i.test(href)) return null;
    let parsed: URL;
    try {
      parsed = new URL(href, this.config.baseUrl);
    } catch {
      return null;
    }
    if (parsed.hostname !== "www.ica.art" && parsed.hostname !== "ica.art") return null;
    const path = parsed.pathname.replace(/\/+$/, "");
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    if (segments.length === 1 && SECTION_INDEXES.has(segments[0])) return null;
    if (NON_EVENT_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;
    if (/^\/\d{4}-\d{2}(-\d{2})?$/.test(path)) return null;
    if (this.isExcludedUrl(path)) return null;
    return `${this.config.baseUrl}${path}`;
  }

  private isExcludedUrl(href: string): boolean {
    // Exclude category/season pages that don't have screenings
    const excludes = [
      "/films/distribution",
      "/films/about",
      "/films/2024",
      "/films/2023",
      "/films/2022",
      "/films/2021",
      "/films/2020",
      "/films/2019",
      "/films/2018",
      "/films/today",
      "/films/tomorrow",
      "/films/next-7-days",
    ];
    return excludes.some((ex) => href === ex || href.startsWith(ex + "/"));
  }

  protected async parsePages(htmlPages: string[]): Promise<RawScreening[]> {
    const screenings: RawScreening[] = [];

    for (const html of htmlPages) {
      try {
        const $ = this.parseHtml(html);
        const filmInfo = this.extractFilmInfo($);

        if (!filmInfo.title) continue;

        const filmScreenings = this.parseFilmScreenings($, filmInfo);
        screenings.push(...filmScreenings);
      } catch (error) {
        console.error(`[${this.config.cinemaId}] Error parsing film page:`, error);
      }
    }

    console.log(`[${this.config.cinemaId}] Found ${screenings.length} screenings total`);
    return screenings;
  }

  private extractFilmInfo($: CheerioAPI): FilmInfo {
    // Get title from span.title, removing nested tag/badge elements first
    // to prevent concatenation bugs (e.g. <span class="tag">LONDON PREMIERE</span>Bouchra
    // would become "LONDON PREMIEREBouchra" without this)
    const $titleEl = $("span.title").first().clone();
    $titleEl.find(".tag, .badge, .label, .flag").remove();
    // Same bug class via a line break: "UK PREMIERE</br>The Night is Fading
    // Away" read as "UK PREMIEREThe Night is Fading Away" and minted that film.
    $titleEl.find("br").replaceWith(" ");
    // Collapse the runs of whitespace the replacement leaves. sourceIds are
    // unaffected: they already map every whitespace run to a single "-".
    let title = $titleEl.text().replace(/\s+/g, " ").trim();
    if (!title) {
      // Fallback to page title
      const pageTitle = $("title").text();
      title = pageTitle.replace(/^ICA \| /, "").trim();
    }

    // Parse metadata from #colophon
    // Format: "<i>Title</i>, dir Director Name, Country Year, Runtime mins."
    const colophon = $("#colophon").text().trim();
    const info: FilmInfo = { title };

    if (colophon) {
      // Extract director: "dir Name"
      const dirMatch = colophon.match(/dir\.?\s+([^,]+)/i);
      if (dirMatch) {
        info.director = dirMatch[1].trim();
      }

      // Extract year (4-digit number)
      const yearMatch = colophon.match(/\b(19\d{2}|20\d{2})\b/);
      if (yearMatch) {
        info.year = parseInt(yearMatch[1], 10);
      }

      // Extract runtime: "XX mins"
      const runtimeMatch = colophon.match(/(\d+)\s*mins?\.?/i);
      if (runtimeMatch) {
        info.runtime = sanitizeRuntime(runtimeMatch[1]);
      }
    }

    return info;
  }

  private parseFilmScreenings($: CheerioAPI, filmInfo: FilmInfo): RawScreening[] {
    const screenings: RawScreening[] = [];

    // Get booking URL base
    let bookingBase = "";
    const bookLink = $("[onclick*='/book/']").first().attr("onclick");
    if (bookLink) {
      const bookMatch = bookLink.match(/\/book\/(\d+)/);
      if (bookMatch) {
        bookingBase = `${this.config.baseUrl}/book/${bookMatch[1]}`;
      }
    }
    if (!bookingBase) {
      // Screenings ICA hosts but does not sell (BFI London Film Festival) point
      // the "Book tickets" button at the seller's page instead of /book/{id}.
      // Without this they fell back to og:url, which is the ICA homepage.
      const externalBook = $("[onclick*='location.href']")
        .filter((_, el) => /book/i.test($(el).text()))
        .first()
        .attr("onclick")
        // Some LFF pages pad the URL: location.href=" https://whatson.bfi.org.uk/...".
        ?.match(/location\.href\s*=\s*["']\s*(https?:\/\/[^"'\s]+)/);
      if (externalBook) bookingBase = externalBook[1];
    }

    // Fallback: get canonical URL if no booking link found
    const canonicalUrl = $('link[rel="canonical"]').attr("href") ||
                         $('meta[property="og:url"]').attr("content") || "";
    const fallbackUrl = canonicalUrl.startsWith("http")
      ? canonicalUrl
      : canonicalUrl ? `${this.config.baseUrl}${canonicalUrl}` : `${this.config.baseUrl}/films`;

    // Parse each performance in the list
    const skippedVenues = new Set<string>();
    $(".performance-list .performance").each((_, el) => {
      const $perf = $(el);

      // Get time (format: "04:15 pm")
      const timeText = $perf.find(".time").text().trim();
      const time = parseScreeningTime(timeText);

      // Get date (format: "Fri, 19 Dec 2025")
      const dateText = $perf.find(".date").text().trim();
      const date = parseScreeningDate(dateText);

      // Get venue/screen. Films play in "Cinema 1"/"Cinema 2"; talks and gigs
      // that share this markup play on "Stage" (/talks/my-tragedy,
      // /live/gilla-band), and hubs can link to them.
      const venue = $perf.find(".venue").text().trim();
      if (!/^cinema\b/i.test(venue)) {
        skippedVenues.add(venue || "(no venue)");
        return;
      }

      if (time && date) {
        const datetime = combineDateAndTime(date, time);

        // Skip past screenings
        if (datetime < new Date()) return;

        screenings.push({
          filmTitle: filmInfo.title,
          datetime,
          bookingUrl: bookingBase || fallbackUrl,
          screen: venue || undefined,
          sourceId: `ica-${filmInfo.title.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`,
          // Pass extracted metadata for better TMDB matching
          year: filmInfo.year,
          director: filmInfo.director,
          runtime: filmInfo.runtime,
          ...FestivalDetector.detect("ica", filmInfo.title, datetime, bookingBase || fallbackUrl),
        });
      }
    });

    if (screenings.length > 0) {
      console.log(`[${this.config.cinemaId}] ${filmInfo.title}: ${screenings.length} screenings`);
    }
    if (skippedVenues.size > 0) {
      console.log(
        `[${this.config.cinemaId}] ${filmInfo.title}: skipped performances outside a cinema (${[...skippedVenues].join(", ")})`,
      );
    }

    return screenings;
  }
}

/** Creates a scraper for ICA Cinema (The Mall). */
export function createICAScraper(): ICAScraper {
  return new ICAScraper();
}
