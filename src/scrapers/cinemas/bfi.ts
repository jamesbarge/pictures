/**
 * BFI Southbank & BFI IMAX Scraper
 * Uses Playwright with stealth plugin to bypass Cloudflare protection
 * Iterates through dates to fetch complete listings
 */

import * as cheerio from "cheerio";
import type { RawScreening, ScraperConfig } from "../types";
import { createPersistentPage, waitForCloudflare } from "../utils/browser";
import type { BrowserContext, Page } from "rebrowser-playwright";
import { parseFilmMetadata } from "../utils/metadata-parser";
import { FestivalDetector } from "../festivals/festival-detector";
import { runBFIImport } from "../bfi-pdf";

interface BFIVenueConfig {
  id: "bfi-southbank" | "bfi-imax";
  name: string;
  baseUrl: string;
}

const VENUES: Record<string, BFIVenueConfig> = {
  "bfi-southbank": {
    id: "bfi-southbank",
    name: "BFI Southbank",
    baseUrl: "https://whatson.bfi.org.uk/Online",
  },
  "bfi-imax": {
    id: "bfi-imax",
    name: "BFI IMAX",
    baseUrl: "https://whatson.bfi.org.uk/imax/Online",
  },
};

export class BFIScraper {
  private venue: BFIVenueConfig;
  private page: Page | null = null;
  private context: BrowserContext | null = null;

  config: ScraperConfig;

  constructor(venueId: "bfi-southbank" | "bfi-imax" = "bfi-southbank") {
    this.venue = VENUES[venueId];
    this.config = {
      cinemaId: venueId,
      baseUrl: this.venue.baseUrl,
      requestsPerMinute: 10,
      delayBetweenRequests: 3000, // Increased for Cloudflare
    };
  }

  async scrape(): Promise<RawScreening[]> {
    // The Playwright click-flow below is structurally broken under Cloudflare:
    // every internal navigation triggers a fresh challenge that doesn't clear
    // locally. Verified 2026-05-14: it produces 0 screenings for both venues.
    //
    // Route to the PDF importer instead, which is the playbook-preferred path
    // anyway. runBFIImport handles BOTH bfi-southbank and bfi-imax in one pass:
    // - Fetches the monthly PDF guide (via persistent Playwright context to
    //   bypass Cloudflare on the discovery page)
    // - Parses screenings for both venues
    // - Saves directly via the standard `saveScreenings` pipeline
    //
    // We dedupe across the two venue instances with `bfiImportRunPromise`
    // so the PDF is fetched + parsed once per /scrape session. The second
    // venue instance shares the cached promise and the importer's per-venue
    // save side-effects are already complete.
    //
    // Returning [] is correct here: runBFIImport has already persisted both
    // venues' screenings. The unified pipeline will report "0 added, 0 updated"
    // for each BFI venue in its per-cinema summary, but the DB state is right.
    console.log(`[${this.config.cinemaId}] Routing to PDF importer (Playwright click-flow is Cloudflare-blocked)...`);
    try {
      await getOrRunBFIImport();
    } catch (error) {
      console.error(`[${this.config.cinemaId}] PDF importer failed:`, error);
      // Fall through with [] — better to underreport than to throw and abort
      // the rest of the /scrape wave.
    }
    return [];
  }

  /**
   * @deprecated Kept for reference / future use if the Playwright path becomes
   * viable again (e.g. Cloudflare relaxes, or we add a paid proxy). Currently
   * unreachable — `scrape()` always routes to the PDF importer.
   */
  async _legacyPlaywrightScrape(): Promise<RawScreening[]> {
    console.log(`[${this.config.cinemaId}] Starting scrape with Playwright stealth mode...`);
    await FestivalDetector.preload();

    try {
      await this.initialize();
      const screenings = await this.fetchAllDates();
      await this.cleanup();

      const validated = this.validate(screenings);
      console.log(`[${this.config.cinemaId}] Found ${validated.length} valid screenings`);
      return validated;
    } catch (error) {
      console.error(`[${this.config.cinemaId}] Scrape failed:`, error);
      await this.cleanup();
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    // BFI requires a persistent browser context to bypass Cloudflare. The shared
    // browser singleton (used by Curzon, Phoenix, etc.) launches cold every run
    // and re-issues the challenge — verified to time out in the 2026-05-12
    // /scrape run. The persistent context preserves the cf_clearance cookie and
    // browser fingerprint across runs, so the challenge passes on subsequent
    // visits. Profile key keeps BFI Southbank and BFI IMAX isolated so their
    // cookies don't interfere.
    console.log(`[${this.config.cinemaId}] Launching persistent browser context...`);
    const { context, page } = await createPersistentPage(this.config.cinemaId);
    this.context = context;
    this.page = page;

    // Warm up the session directly on the CALENDAR URL we'll actually scrape.
    // Previously this warmed up on `baseUrl` (e.g. /Online), which cleared the
    // challenge for that URL but then re-triggered a fresh challenge when
    // fetchAllDates() navigated to `/Online/default.asp` — burning the cf_clearance
    // budget on a URL we never use. Warming on the target URL lets a single
    // challenge pass cover the whole scrape session.
    const calendarUrl = `${this.venue.baseUrl}/default.asp`;
    console.log(`[${this.config.cinemaId}] Warming up session on calendar URL: ${calendarUrl}`);
    await this.page.goto(calendarUrl, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    // Cloudflare can take 30-60s to clear; 90s gives headroom under load.
    // (Standalone diagnostic cleared in ~38s; the scraper context runs slower
    // alongside other Playwright tasks in the same wave.)
    const passed = await waitForCloudflare(this.page, 90);
    if (!passed) {
      console.log(`[${this.config.cinemaId}] Cloudflare challenge timeout, continuing anyway...`);
    }

    // Wait for the calendar grid to render after Cloudflare passes
    await this.page.waitForTimeout(3000);
    console.log(`[${this.config.cinemaId}] Session established`);
  }

  private async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => { /* page may already be closed */ });
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => { /* context may already be closed */ });
      this.context = null;
    }
    // NOTE: do NOT call closeBrowser() — this scraper owns its own persistent
    // context, not the shared singleton. Closing the singleton would tear down
    // a browser other scrapers in the same wave may still be using.
    console.log(`[${this.config.cinemaId}] Browser context closed`);
  }

  /**
   * Advance the calendar to a month with enough active programming dates.
   * Skips past months that have fewer than the threshold of clickable dates.
   */
  private async navigateToActiveMonth(): Promise<void> {
    if (!this.page) return;

    const minActiveDatesThreshold = 5;
    const maxMonthsToAdvance = 3;
    for (let monthOffset = 0; monthOffset < maxMonthsToAdvance; monthOffset++) {
      const activeCells = await this.page.$$('[role="gridcell"]:not([aria-disabled="true"])');

      if (activeCells.length >= minActiveDatesThreshold) {
        console.log(`[${this.config.cinemaId}] Found ${activeCells.length} active dates in current month view`);
        return;
      }

      console.log(`[${this.config.cinemaId}] Only ${activeCells.length} active dates (need ${minActiveDatesThreshold}+), advancing...`);

      const nextMonthBtn = this.page.getByRole('button', { name: 'Next month' });
      if (await nextMonthBtn.count() > 0) {
        console.log(`[${this.config.cinemaId}] Clicking Next month...`);
        await nextMonthBtn.click();
        await this.page.waitForTimeout(1500);
      } else {
        console.log(`[${this.config.cinemaId}] Next month button not found`);
        return;
      }
    }
  }

  /**
   * Scrape screenings for a single date cell, then navigate back to the calendar.
   * Returns null when the date index exceeds available cells (signals loop to stop).
   */
  private async scrapeDateCell(dateIndex: number, monthNum: number): Promise<RawScreening[] | null> {
    if (!this.page) return null;
    const currentCells = await this.page.$$('[role="gridcell"]:not([aria-disabled="true"])');
    if (dateIndex >= currentCells.length) return null;

    const cell = currentCells[dateIndex];
    const dateLabel = await cell.getAttribute("aria-label") || await cell.textContent() || "";
    console.log(`[${this.config.cinemaId}] Clicking: ${dateLabel.trim()}...`);

    await cell.click();
    await this.page.waitForTimeout(2000);
    // Cloudflare re-challenges on every internal navigation. 60s matches what
    // we see clear in the wild — the 10s previously used was the proximate
    // cause of the 0-screenings runs (challenge still active when parsed).
    await waitForCloudflare(this.page, 60);

    const html = await this.page.content();
    const dayScreenings = this.parseSearchResults(html);
    if (dayScreenings.length > 0) {
      console.log(`[${this.config.cinemaId}] ${dateLabel.trim()}: ${dayScreenings.length} screenings`);
    }

    // Return to calendar
    await this.page.goto(`${this.venue.baseUrl}/default.asp`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await waitForCloudflare(this.page, 60);
    await this.page.waitForTimeout(1500);

    // Navigate back to the same month we were scraping
    for (let m = 0; m <= monthNum; m++) {
      const nextBtn = this.page.getByRole('button', { name: 'Next month' });
      if (await nextBtn.count() > 0) {
        await nextBtn.click();
        await this.page.waitForTimeout(1000);
      }
    }

    return dayScreenings;
  }


  private async fetchAllDates(): Promise<RawScreening[]> {
    if (!this.page) throw new Error("Browser not initialized");

    const screenings: RawScreening[] = [];

    try {
      // initialize() has already navigated to the calendar URL and waited for
      // Cloudflare to clear, so we're on the right page already. Re-navigating
      // here would trigger a fresh Cloudflare challenge and burn another 60s+
      // (and in practice, our 45s window often wasn't long enough to pass it).
      console.log(`[${this.config.cinemaId}] Reusing session from initialize()...`);

      // Navigate to a month with active programming
      await this.navigateToActiveMonth();

      // Now scrape up to 2 months of calendar data
      for (let monthNum = 0; monthNum < 2; monthNum++) {
        console.log(`[${this.config.cinemaId}] Scraping month ${monthNum + 1}...`);

        // Get all clickable date cells
        const dateCells = await this.page.$$('[role="gridcell"]:not([aria-disabled="true"])');
        console.log(`[${this.config.cinemaId}] Found ${dateCells.length} active dates`);

        // Click each date to get screenings
        for (let i = 0; i < dateCells.length; i++) {
          try {
            const dayScreenings = await this.scrapeDateCell(i, monthNum);
            if (!dayScreenings) break;
            screenings.push(...dayScreenings);
          } catch (error) {
            console.error(`[${this.config.cinemaId}] Error on date ${i}:`, error);
            // Try to recover
            await this.page!.goto(`${this.venue.baseUrl}/default.asp`, {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            }).catch(() => {});
            await this.page!.waitForTimeout(2000);
          }
        }

        // Move to next month for next iteration
        const nextMonthButton = this.page.getByRole('button', { name: 'Next month' });
        if (await nextMonthButton.count() > 0) {
          await nextMonthButton.click();
          await this.page.waitForTimeout(1500);
        }
      }
    } catch (error) {
      console.error(`[${this.config.cinemaId}] Calendar navigation failed:`, error);
    }

    return screenings;
  }

  private parseSearchResults(html: string): RawScreening[] {
    const $ = cheerio.load(html);
    const screenings: RawScreening[] = [];
    const now = new Date();

    // Check if we hit Cloudflare
    if (html.includes("challenge-platform") || html.includes("Checking your browser")) {
      return [];
    }

    // BFI search results structure:
    // Links with loadArticle in href point to film/event pages
    // The datetime and screen info is in sibling/parent elements
    // Note: Page may not have <main> element - search for loadArticle links directly

    // Find all links that point to articles (film/event pages)
    const loadArticleLinks = $('a[href*="loadArticle"]');
    console.log(`[${this.config.cinemaId}] Found ${loadArticleLinks.length} loadArticle links`);

    let processedCount = 0;
    loadArticleLinks.each((idx, el) => {
      const $link = $(el);
      const title = $link.text().trim();
      const href = $link.attr("href") || "";

      // Debug: log first few links
      if (idx < 3) {
        console.log(`[${this.config.cinemaId}] Link ${idx}: title="${title.substring(0, 50)}", href contains loadArticle`);
      }

      // Skip empty, short titles, and navigation links
      if (!title || title.length < 3) return;
      if (href.includes("javascript:")) return;

      // Skip non-film items
      if (this.isNonFilmEvent(title)) return;

      processedCount++;

      // Get the parent container to find datetime and screen
      // Structure: generic > generic > [link, datetime div, screen div]
      const $container = $link.parent();
      const $grandparent = $container.parent();

      // Try to find datetime in container text or grandparent
      const containerText = $container.text();
      const grandparentText = $grandparent.text();

      // Debug: log structure for first few
      if (processedCount <= 3) {
        console.log(`[${this.config.cinemaId}] Processing "${title.substring(0, 30)}...": container="${containerText.substring(0, 100)}..."`);
      }

      // Find datetime from sibling elements
      let datetimeStr = "";
      let screen = "";

      // First try to match from the grandparent text (which includes siblings)
      const datetimePattern = /(\w+)\s+(\d{1,2})\s+(\w+)\s+(\d{4})\s+(\d{1,2}:\d{2})/;
      const dtMatch = grandparentText.match(datetimePattern);
      if (dtMatch) {
        datetimeStr = dtMatch[0];
      }

      // Also look for screen info
      const screenMatch = grandparentText.match(/(NFT[1-4]|IMAX|Studio|BFI Reuben Library)/i);
      if (screenMatch) {
        screen = screenMatch[1];
      }

      if (!datetimeStr) {
        if (processedCount <= 3) {
          console.log(`[${this.config.cinemaId}] No datetime found in: "${grandparentText.substring(0, 200)}..."`);
        }
        return;
      }

      const datetime = this.parseBFIDateTime(datetimeStr);
      if (!datetime || datetime < now) return;

      // Build booking URL
      const bookingUrl = href.startsWith("http")
        ? href
        : `${this.venue.baseUrl}/${href}`;

      // Detect special event types from title
      let eventType: string | undefined;
      const cleanTitle = this.cleanTitle(title);

      if (/\+\s*Q\s*&?\s*A/i.test(title)) eventType = "q_and_a";
      else if (/\+\s*intro/i.test(title)) eventType = "intro";
      else if (/\+\s*discussion/i.test(title)) eventType = "discussion";
      else if (/preview/i.test(title)) eventType = "preview";
      else if (/premiere/i.test(title)) eventType = "premiere";

      // Extract director/year from the listing text
      // BFI often includes "Dir. Name" and year in the description
      const metadata = parseFilmMetadata(grandparentText);

      screenings.push({
        filmTitle: cleanTitle,
        datetime,
        screen: screen || undefined,
        bookingUrl,
        eventType,
        sourceId: `${this.config.cinemaId}-${cleanTitle.toLowerCase().replace(/\s+/g, "-")}-${datetime.toISOString()}`,
        // Pass extracted metadata for better TMDB matching
        year: metadata.year,
        director: metadata.director,
        // Detect festival based on title/date
        ...FestivalDetector.detect(this.config.cinemaId, cleanTitle, datetime, bookingUrl),
      });
    });

    return screenings;
  }

  private isNonFilmEvent(title: string): boolean {
    const skipPatterns = [
      /^library/i,
      /auction/i,
      /members?\s+(only|event|screening)/i,
      /research\s+session/i,
      /workshop/i,
      /^talk\s*$/i,
      /lecture/i,
    ];
    return skipPatterns.some((p) => p.test(title));
  }

  private parseBFIDateTime(text: string): Date | null {
    // Format: "Friday 19 December 2025 14:30"
    const match = text.match(/(\d{1,2})\s+(\w+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (!match) return null;

    const [, day, monthName, year, hours, minutes] = match;

    const months: Record<string, number> = {
      January: 0, February: 1, March: 2, April: 3,
      May: 4, June: 5, July: 6, August: 7,
      September: 8, October: 9, November: 10, December: 11,
    };

    const month = months[monthName];
    if (month === undefined) return null;

    return new Date(
      parseInt(year),
      month,
      parseInt(day),
      parseInt(hours),
      parseInt(minutes)
    );
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/\s*\+\s*(Q\s*&?\s*A|intro|discussion|panel).*$/i, "")
      // Only strip prefix when followed by colon (e.g. "Preview: Film Title")
      // NOT "UK Premiere of 4K Restoration: The Razor's Edge" (would leave "of 4K...")
      .replace(/^(Preview|UK Premiere|Premiere):\s*/i, "")
      .trim();
  }

  private validate(screenings: RawScreening[]): RawScreening[] {
    const now = new Date();
    const seen = new Set<string>();

    return screenings.filter((s) => {
      if (!s.filmTitle || s.filmTitle.trim() === "") return false;
      if (!s.datetime || isNaN(s.datetime.getTime())) return false;
      if (s.datetime < now) return false;
      if (!s.bookingUrl || s.bookingUrl.trim() === "") return false;

      // Reject titles that look garbled (common scraping artifacts)
      if (this.isSuspiciousTitle(s.filmTitle)) {
        console.warn(`[${this.config.cinemaId}] Rejecting suspicious title: "${s.filmTitle}"`);
        return false;
      }

      // Deduplicate by sourceId
      if (s.sourceId && seen.has(s.sourceId)) return false;
      if (s.sourceId) seen.add(s.sourceId);

      return true;
    });
  }

  /**
   * Detect garbled or suspicious titles from scraping errors.
   * Returns true if the title looks wrong and should be rejected.
   */
  private isSuspiciousTitle(title: string): boolean {
    // Starts with lowercase word (likely a fragment — "of 4K Restoration...")
    if (/^[a-z]/.test(title) && !title.startsWith("de ") && !title.startsWith("la ") && !title.startsWith("el ")) {
      return true;
    }
    // Note: pagination artifacts like "Hamnet p12" are now cleaned by cleanFilmTitle()
    // in the pipeline, so we no longer reject them here
    // Extremely short single-word titles are suspicious
    if (title.length < 3) return true;
    return false;
  }

  async healthCheck(): Promise<boolean> {
    let context: BrowserContext | null = null;
    try {
      console.log(`[${this.config.cinemaId}] Running health check...`);
      // Same persistent-context fix as initialize() — the shared browser
      // singleton can't pass Cloudflare cold, and the previous implementation
      // failed in the wild with: "page.content: Unable to retrieve content
      // because the page is navigating and changing the content" on BFI IMAX.
      const persistent = await createPersistentPage(`${this.config.cinemaId}-healthcheck`);
      context = persistent.context;
      const page = persistent.page;

      await page.goto(this.venue.baseUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Wait for potential Cloudflare challenge — use the shared helper which
      // already handles "page is navigating" by polling instead of single-shot
      // content() reads.
      await waitForCloudflare(page, 15);

      const title = await page.title().catch(() => "");
      return title.toLowerCase().includes("bfi");
    } catch (error) {
      console.error(`[${this.config.cinemaId}] Health check failed:`, error);
      return false;
    } finally {
      if (context) await context.close().catch(() => { /* may be closed */ });
    }
  }

}

/** Creates a scraper for a BFI venue (Southbank or IMAX). */
export function createBFIScraper(venueId: "bfi-southbank" | "bfi-imax"): BFIScraper {
  return new BFIScraper(venueId);
}

// ────────────────────────────────────────────────────────────────────────────
// PDF importer dedupe
// ────────────────────────────────────────────────────────────────────────────

/**
 * Module-scope cache so the PDF import runs ONCE per process even when the
 * unified scrape calls `createBFIScraper("bfi-southbank").scrape()` and
 * `createBFIScraper("bfi-imax").scrape()` in succession (or in parallel).
 *
 * runBFIImport saves screenings for BOTH venues in a single call, so the
 * second invocation would just re-fetch and re-save the same data. Caching
 * the promise lets the second caller await the first one's result.
 *
 * Reset each session by re-importing the module; the cache lives in memory
 * only for one Node process.
 */
let bfiImportRunPromise: Promise<void> | null = null;

async function getOrRunBFIImport(): Promise<void> {
  if (!bfiImportRunPromise) {
    bfiImportRunPromise = (async () => {
      await runBFIImport();
    })();
  }
  return bfiImportRunPromise;
}
