/**
 * BFI Southbank & BFI IMAX Scraper
 *
 * Strategy (2026-05-30 rewrite — single-wide-search stealth method):
 * `whatson.bfi.org.uk` is an AudienceView "Online" (Vista Classic) `.asp`
 * deployment. There is NO JSON/XHR API — instead every listing page embeds
 * the full result set inline as two JS globals:
 *   - `searchNames`   — array of ~97 column NAMES
 *   - `searchResults` — array of rows, each row an array indexed by searchNames
 *
 * We fire exactly ONE wide date-range search per venue (today → ~end of July),
 * which returns the entire window in a single response. Minimising navigations
 * is the whole game: Cloudflare's managed challenge degrades the
 * fingerprint/IP reputation after the first 1-2 navigations in a session, so
 * the previous weekly-chunked approach (6+ searches per venue) got 403'd after
 * the first hit. One cold navigation per venue, via a FRESH persistent context,
 * is what passes.
 *
 * Authoritative column indices (from `searchNames`):
 *   [2]  type        — venue ("BFI Southbank" / "IMAX")  ← filter on this
 *   [5]/[6] title    — film title
 *   [7]  start_date  — "Saturday 30 May 2026 14:50" (UK local)
 *   [8]  start_time  — "14:50"
 *   [9]  day
 *   [10] month       — 0-INDEXED (Jan=0)
 *   [11] year
 *   [15] availability
 *   [18] additional_info — booking / article URL
 *   [63] venue_name  — "Southbank - NFT3" (screen)
 *   [64] venue_desc  — "Screen NFT3"
 * Feed [11]/[10]/[9]/[8] straight into ukLocalToUTC — clean 24h times, no
 * AM/PM ambiguity, structured date parts.
 *
 * PDF importer is kept as a fallback: if all Playwright attempts fail (e.g. the
 * machine's IP is transiently Cloudflare-flagged), we route through
 * `getOrLoadBFIScreenings()` so the run still yields data rather than throwing.
 */

import type { RawScreening, ScraperConfig } from "../types";
import { createPersistentPage, waitForCloudflare } from "../utils/browser";
import type { BrowserContext, Page } from "rebrowser-playwright";
import { parseFilmMetadata } from "../utils/metadata-parser";
import { FestivalDetector } from "../festivals/festival-detector";
import { loadBFIScreenings, getBFIVenueKey } from "../bfi-pdf";
import { buildBfiSourceId } from "../bfi-pdf/bfi-source-id";
import { ukLocalToUTC } from "../utils/date-parser";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";

interface BFIVenueConfig {
  id: "bfi-southbank" | "bfi-imax";
  name: string;
  /** Column [2] value used to filter searchResults rows for this venue. */
  searchVenueName: string;
  baseUrl: string;
  /** article_search_id GUID for the date-range search. */
  searchId: string;
}

const VENUES: Record<string, BFIVenueConfig> = {
  "bfi-southbank": {
    id: "bfi-southbank",
    name: "BFI Southbank",
    searchVenueName: "BFI Southbank",
    baseUrl: "https://whatson.bfi.org.uk/Online",
    searchId: "25E7EA2E-291F-44F9-8EBC-E560154FDAEB",
  },
  "bfi-imax": {
    id: "bfi-imax",
    name: "BFI IMAX",
    // Column [2] for IMAX rows is the bare string "IMAX" (NOT "BFI IMAX").
    // Verified against live searchResults 2026-05-30.
    searchVenueName: "IMAX",
    baseUrl: "https://whatson.bfi.org.uk/imax/Online",
    searchId: "49C49C83-6BA0-420C-A784-9B485E36E2E0",
  },
};

/** How far ahead the single wide date-range search reaches (days). */
const SEARCH_WINDOW_DAYS = 70; // ~10 weeks → comfortably past end of July

/**
 * Page size for the single search request. AudienceView defaults to 50/page
 * (12 pages for the wide window). Paginating = 12 navigations = guaranteed
 * Cloudflare fingerprint degradation after nav 1-2. Setting a large page_size
 * returns the WHOLE window in page 1 (totalPages=1), so we navigate ONCE.
 * Verified 2026-05-30: page_size=2000 → Southbank 556 rows / IMAX 95 rows,
 * totalPages=1, both passing cold on the first navigation.
 */
const PAGE_SIZE = 2000;

/** Cloudflare-pass budget for the single navigation (seconds). */
const CLOUDFLARE_WAIT_SECONDS = 60;

/** Backoff (ms) before retry attempts 2 and 3 after a blocked attempt. */
const RETRY_BACKOFF_MS = [10_000, 30_000, 60_000];

/** A row from the embedded `searchResults` global. */
type SearchRow = (string | number | null)[];

export class BFIScraper {
  private venue: BFIVenueConfig;

  config: ScraperConfig;

  constructor(venueId: "bfi-southbank" | "bfi-imax" = "bfi-southbank") {
    this.venue = VENUES[venueId];
    this.config = {
      cinemaId: venueId,
      baseUrl: this.venue.baseUrl,
      requestsPerMinute: 10,
      delayBetweenRequests: 3000,
    };
  }

  async scrape(): Promise<RawScreening[]> {
    console.log(`[${this.config.cinemaId}] Starting Playwright stealth scrape (single wide date-range search)...`);
    await FestivalDetector.preload();

    // ── Primary path: single-wide-search via fresh persistent context ──
    try {
      const screenings = await this.scrapeViaPlaywright();
      const validated = this.validate(screenings);
      if (validated.length > 0) {
        console.log(`[${this.config.cinemaId}] Playwright path yielded ${validated.length} valid screenings`);
        return validated;
      }
      console.warn(`[${this.config.cinemaId}] Playwright path returned 0 valid screenings — falling back to PDF importer`);
    } catch (err) {
      console.error(`[${this.config.cinemaId}] Playwright path failed:`, err instanceof Error ? err.message : err);
      console.warn(`[${this.config.cinemaId}] Falling back to PDF importer`);
    }

    // ── Fallback path: PDF importer (still throws loudly if BOTH PDF sources fail) ──
    const allScreenings = await getOrLoadBFIScreenings();
    const venueScreenings = allScreenings.filter((s) => getBFIVenueKey(s) === this.config.cinemaId);
    console.log(`[${this.config.cinemaId}] PDF fallback returned ${venueScreenings.length} screenings (${allScreenings.length} total across both BFI venues)`);
    return venueScreenings;
  }

  /**
   * Run the single wide date-range search through a fresh persistent context,
   * retrying up to 3 times with exponential backoff. Each retry uses a brand
   * new (cold) userDataDir so it doesn't inherit a degraded fingerprint.
   */
  private async scrapeViaPlaywright(): Promise<RawScreening[]> {
    const url = this.buildWideSearchUrl();
    console.log(`[${this.config.cinemaId}] Wide search URL: ${url}`);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < RETRY_BACKOFF_MS.length; attempt++) {
      if (attempt > 0) {
        const backoff = RETRY_BACKOFF_MS[attempt - 1];
        console.log(`[${this.config.cinemaId}] Retry ${attempt} after ${backoff / 1000}s backoff...`);
        await new Promise((r) => setTimeout(r, backoff));
      }

      // Fresh, unique profile per attempt so each starts COLD. Timestamp +
      // attempt index guarantees no overlap with the prior attempt's flagged
      // fingerprint or with the other venue running in the same wave.
      const profileKey = `bfi-search-${this.config.cinemaId}-${Date.now()}-${attempt}`;
      const userDataDir = path.join(os.tmpdir(), `pictures-scraper-${profileKey}`);
      let context: BrowserContext | null = null;

      try {
        const persistent = await createPersistentPage(profileKey);
        context = persistent.context;
        const page = persistent.page;

        console.log(`[${this.config.cinemaId}] Attempt ${attempt + 1}: navigating (cold profile ${profileKey})...`);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });

        const passed = await waitForCloudflare(page, CLOUDFLARE_WAIT_SECONDS);
        if (!passed) {
          // Title still shows a challenge — this attempt is blocked.
          const title = await page.title().catch(() => "");
          throw new BlockedByCloudflareError(`Cloudflare challenge not cleared (title="${title}")`);
        }

        // Give the .asp page a beat to finish writing the inline globals.
        await page.waitForTimeout(1500);

        const rows = await this.extractSearchResults(page);
        if (rows === null) {
          throw new BlockedByCloudflareError("searchResults global/regex not found in page (likely challenge or empty body)");
        }

        console.log(`[${this.config.cinemaId}] Attempt ${attempt + 1}: extracted ${rows.length} raw rows`);
        const screenings = this.mapRows(rows);
        console.log(`[${this.config.cinemaId}] Mapped ${screenings.length} ${this.venue.searchVenueName} screenings from ${rows.length} rows`);
        return screenings;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const transient = err instanceof BlockedByCloudflareError;
        console.warn(
          `[${this.config.cinemaId}] Attempt ${attempt + 1} ${transient ? "BLOCKED (transient)" : "errored"}: ${lastError.message}`,
        );
      } finally {
        if (context) await context.close().catch(() => { /* may be closed */ });
        // Clean the cold profile dir so /tmp doesn't accumulate per-run dirs.
        await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => { /* best effort */ });
      }
    }

    throw lastError ?? new Error("All Playwright attempts failed");
  }

  /**
   * Build the single wide date-range search URL.
   * search_from = today, search_to = today + SEARCH_WINDOW_DAYS, both DD/MM/YYYY.
   */
  private buildWideSearchUrl(): string {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + SEARCH_WINDOW_DAYS);

    const fmt = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    return (
      `${this.venue.baseUrl}/default.asp?doWork::WScontent::search=1` +
      `&BOparam::WScontent::search::article_search_id=${this.venue.searchId}` +
      `&BOset::WScontent::SearchCriteria::search_from=${fmt(from)}` +
      `&BOset::WScontent::SearchCriteria::search_to=${fmt(to)}` +
      `&BOset::WScontent::SearchResultsInfo::page_size=${PAGE_SIZE}`
    );
  }

  /**
   * Pull the embedded `searchResults` array out of the loaded page.
   *
   * NOTE: `searchResults`/`searchNames` are NOT window globals — they are
   * properties of an object literal passed to AudienceView's results widget,
   * written into an inline <script> as `searchResults : [ [..], [..] ]`
   * (whitespace + COLON, no `=`, no terminating `;`). So we read the raw HTML
   * and bracket-match the array. (A `page.evaluate(() => window.searchResults)`
   * primary path was tried and confirmed `undefined` on 2026-05-30.)
   *
   * Returns null when no array is found (challenge interstitial / empty body).
   */
  private async extractSearchResults(page: Page): Promise<SearchRow[] | null> {
    let html = "";
    try {
      html = await page.content();
    } catch {
      return null;
    }

    // Active challenge interstitial — distinct from the benign "challenge-platform"
    // string Cloudflare leaves in embedded scripts on fully-loaded pages.
    if (html.includes("cf_chl") || /just a moment/i.test(html.slice(0, 2000))) {
      return null;
    }

    return parseSearchResultsArray(html);
  }

  /** Map raw searchResults rows for THIS venue into RawScreening[]. */
  private mapRows(rows: SearchRow[]): RawScreening[] {
    const screenings: RawScreening[] = [];
    const now = new Date();

    for (const row of rows) {
      if (!Array.isArray(row)) continue;

      const venueName = str(row[2]);
      // Filter to this venue. The search GUID is venue-scoped, but a search can
      // surface both venues' rows; column [2] is authoritative.
      if (venueName && this.venue.searchVenueName.toLowerCase() !== venueName.toLowerCase()) {
        continue;
      }

      const rawTitle = str(row[6]) || str(row[5]);
      if (!rawTitle || rawTitle.length < 3) continue;
      if (this.isNonFilmEvent(rawTitle)) continue;

      // Structured date parts → ukLocalToUTC. month is 0-indexed already.
      const day = num(row[9]);
      const month = num(row[10]);
      const year = num(row[11]);
      const timeStr = str(row[8]); // "14:50"

      let datetime: Date | null = null;
      const tm = timeStr.match(/^(\d{1,2}):(\d{2})/);
      if (year && tm && Number.isFinite(day) && Number.isFinite(month)) {
        datetime = ukLocalToUTC(year, month, day, parseInt(tm[1], 10), parseInt(tm[2], 10));
      } else {
        // Fallback: parse the full start_date string [7] "Saturday 30 May 2026 14:50"
        datetime = this.parseBFIDateTime(str(row[7]));
      }

      if (!datetime || isNaN(datetime.getTime()) || datetime < now) continue;

      const screen = str(row[64]) || str(row[63]) || undefined;

      // Booking / article URL from [18].
      const rawUrl = str(row[18]);
      const bookingUrl = rawUrl
        ? rawUrl.startsWith("http")
          ? rawUrl
          : `${this.venue.baseUrl}/${rawUrl.replace(/^\//, "")}`
        : this.venue.baseUrl;

      const availabilityStatus = this.mapAvailability(str(row[15]));

      // Event type from title.
      let eventType: string | undefined;
      if (/\+\s*Q\s*&?\s*A/i.test(rawTitle)) eventType = "q_and_a";
      else if (/\+\s*intro/i.test(rawTitle)) eventType = "intro";
      else if (/\+\s*discussion/i.test(rawTitle)) eventType = "discussion";
      else if (/preview/i.test(rawTitle)) eventType = "preview";
      else if (/premiere/i.test(rawTitle)) eventType = "premiere";

      const cleanTitle = this.cleanTitle(rawTitle);
      const metadata = parseFilmMetadata(rawTitle);

      // Canonical, path-agnostic sourceId (see buildBfiSourceId): identical
      // shape across Playwright/PDF/changes so a path flip cannot duplicate,
      // with the screen segment disambiguating simultaneous NFT1/NFT2 shows.
      const sourceId = buildBfiSourceId(this.config.cinemaId, cleanTitle, screen, datetime);

      screenings.push({
        filmTitle: cleanTitle,
        datetime,
        screen,
        bookingUrl,
        eventType,
        availabilityStatus,
        sourceId,
        year: metadata.year,
        director: metadata.director,
        ...FestivalDetector.detect(this.config.cinemaId, cleanTitle, datetime, bookingUrl),
      });
    }

    return screenings;
  }

  private mapAvailability(raw: string): RawScreening["availabilityStatus"] {
    const v = raw.toLowerCase();
    if (!v) return undefined;
    if (/sold\s*out|unavailable|no\s*tickets/.test(v)) return "sold_out";
    if (/low|limited|few/.test(v)) return "low";
    if (/return/.test(v)) return "returns";
    if (/available|on\s*sale|book/.test(v)) return "available";
    return "unknown";
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
      /gift\s*(card|voucher)/i,
      /membership/i,
      // Building/venue tours are listed in the same feed (e.g. "BFI Southbank
      // and BFI IMAX Tour" @ 09:45) — not film screenings.
      /\btour\b/i,
    ];
    return skipPatterns.some((p) => p.test(title));
  }

  /** Parse "Friday 19 December 2025 14:30" (UK local) → UTC Date. */
  private parseBFIDateTime(text: string): Date | null {
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
    return ukLocalToUTC(parseInt(year), month, parseInt(day), parseInt(hours), parseInt(minutes));
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/\s*\+\s*(Q\s*&?\s*A|intro|discussion|panel).*$/i, "")
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
      if (this.isSuspiciousTitle(s.filmTitle)) {
        console.warn(`[${this.config.cinemaId}] Rejecting suspicious title: "${s.filmTitle}"`);
        return false;
      }
      if (s.sourceId && seen.has(s.sourceId)) return false;
      if (s.sourceId) seen.add(s.sourceId);
      return true;
    });
  }

  private isSuspiciousTitle(title: string): boolean {
    if (/^[a-z]/.test(title) && !title.startsWith("de ") && !title.startsWith("la ") && !title.startsWith("el ")) {
      return true;
    }
    if (title.length < 3) return true;
    return false;
  }

  /**
   * Health check. Lenient by design: a UA-only fetch or a single navigation
   * gets WAF-403'd while the real (cold-profile, retrying) scrape passes. We
   * must NOT block the scrape on a false-negative precheck, so this only
   * fails on a hard error and otherwise returns true.
   */
  async healthCheck(): Promise<boolean> {
    let context: BrowserContext | null = null;
    const profileKey = `bfi-healthcheck-${this.config.cinemaId}-${Date.now()}`;
    const userDataDir = path.join(os.tmpdir(), `pictures-scraper-${profileKey}`);
    try {
      const persistent = await createPersistentPage(profileKey);
      context = persistent.context;
      const page = persistent.page;
      await page.goto(this.venue.baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await waitForCloudflare(page, 15);
      const title = await page.title().catch(() => "");
      // If the title clearly shows the BFI site, great. If it's a challenge or
      // empty, do NOT fail — the real scrape retries cold and the PDF fallback
      // covers a hard block. Returning true here lets scrape() decide.
      if (title.toLowerCase().includes("bfi")) return true;
      console.warn(`[${this.config.cinemaId}] Health check inconclusive (title="${title}") — proceeding to scrape anyway`);
      return true;
    } catch (error) {
      console.error(`[${this.config.cinemaId}] Health check hard error:`, error);
      // Even on a hard error, allow the scrape to attempt + fall back to PDF.
      return true;
    } finally {
      if (context) await context.close().catch(() => { /* may be closed */ });
      await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => { /* best effort */ });
    }
  }
}

/** Marker error: a Cloudflare-managed-challenge block (transient, retryable). */
class BlockedByCloudflareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedByCloudflareError";
  }
}

/**
 * Bracket-match and JSON.parse the embedded `searchResults : [ ... ]` array
 * out of a BFI Online HTML page. Exported for unit testing against fixtures.
 *
 * The array is written as `searchResults : [ [..], [..] ]` — colon-assigned
 * object property, contains nested arrays, no terminating `;`. A non-greedy
 * regex can't handle the nested brackets, so we find the opening `[` after the
 * `searchResults :` token and walk to its matching close bracket.
 */
export function parseSearchResultsArray(html: string): SearchRow[] | null {
  const keyMatch = html.match(/searchResults\s*:\s*\[/);
  if (!keyMatch || keyMatch.index === undefined) return null;

  const start = html.indexOf("[", keyMatch.index);
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;

  try {
    const parsed = JSON.parse(html.slice(start, end + 1));
    return Array.isArray(parsed) ? (parsed as SearchRow[]) : null;
  } catch {
    return null;
  }
}

/** Coerce a searchResults cell to a trimmed string. */
function str(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Coerce a searchResults cell to a number (NaN if not parseable). */
function num(v: string | number | null | undefined): number {
  if (typeof v === "number") return v;
  if (v === null || v === undefined) return NaN;
  return parseInt(String(v), 10);
}

/** Creates a scraper for a BFI venue (Southbank or IMAX). */
export function createBFIScraper(venueId: "bfi-southbank" | "bfi-imax"): BFIScraper {
  return new BFIScraper(venueId);
}

// ────────────────────────────────────────────────────────────────────────────
// PDF importer fallback (unchanged — kept for resilience until Playwright path
// is verified to reliably cover both venues from the production IP).
// ────────────────────────────────────────────────────────────────────────────

let bfiLoadPromise: Promise<RawScreening[]> | null = null;

/** Test-only: clear the in-process cache so a fresh test starts from a clean slate. */
export function _resetBFIScreeningsCacheForTests(): void {
  bfiLoadPromise = null;
}

export async function getOrLoadBFIScreenings(): Promise<RawScreening[]> {
  if (!bfiLoadPromise) {
    bfiLoadPromise = (async () => {
      const { screenings, sourceStatus } = await loadBFIScreenings();

      const bothFailed =
        sourceStatus.pdf !== "success" && sourceStatus.programmeChanges !== "success";
      if (bothFailed) {
        throw new Error(
          `BFI upstream load failed — pdf=${sourceStatus.pdf}, programmeChanges=${sourceStatus.programmeChanges}. ` +
            `No screenings recovered; failing loudly rather than recording success+0.`,
        );
      }

      return screenings;
    })().catch((err) => {
      bfiLoadPromise = null;
      throw err;
    });
  }
  return bfiLoadPromise;
}
