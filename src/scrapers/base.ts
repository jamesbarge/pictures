/**
 * Base Scraper Class
 * Abstract class that all cinema scrapers extend
 */

import * as cheerio from "cheerio";
import { readFile } from "fs/promises";
import { join } from "path";
import type { RawScreening, ScraperConfig, CinemaScraper } from "./types";
import { CHROME_USER_AGENT_FULL } from "./constants";
import type { PreFilterReason, PreFilterReport } from "./utils/screening-accounting";

/**
 * Runtime config overlay for AutoScrape experiments.
 * Primary storage: `autoresearch_config` DB table (key: `autoscrape/overlay/{cinemaId}`).
 * Fallback: JSON files in .autoresearch/overlays/{cinemaId}.json (local dev).
 */
export interface ConfigOverlay {
  /** CSS selector overrides keyed by purpose */
  selectorOverrides?: Record<string, string>;
  /** URL pattern overrides */
  urlOverrides?: Record<string, string>;
  /** Date format overrides */
  dateFormatOverrides?: Record<string, string>;
}

const OVERLAY_DIR = join(process.cwd(), ".autoresearch", "overlays");

/**
 * Module-level cache of DB overlay keys, populated on first lookup.
 * Avoids hitting the DB for every scraper run (~59 cinemas) when no overlays exist.
 */
let dbOverlayCache: Map<string, ConfigOverlay> | null = null;

export abstract class BaseScraper implements CinemaScraper {
  abstract config: ScraperConfig;

  /** Runtime config overlay loaded from DB/disk (null if none exists) */
  protected configOverlay: ConfigOverlay | null = null;

  /**
   * Pre-filter accounting for the most recent `scrape()`.
   *
   * `validate()` below drops candidates before the pipeline ever sees them, so
   * without this the loss is invisible to every downstream report. Recorded
   * here rather than returned so `scrape()` keeps its `RawScreening[]`
   * signature and every existing caller and subclass is unaffected.
   *
   * Null until a scrape has run. Reset at the start of each scrape so a stale
   * report from a previous run can never be attributed to this one.
   */
  private preFilterReport: PreFilterReport | null = null;
  private fetchedPayloadCount: number | null = null;

  /**
   * Main scrape method - template method pattern
   */
  async scrape(): Promise<RawScreening[]> {
    console.log(`[${this.config.cinemaId}] Starting scrape...`);
    this.preFilterReport = null;
    this.fetchedPayloadCount = null;

    try {
      await this.loadConfigOverlay();
      await this.initialize();
      const pages = await this.fetchPages();
      this.fetchedPayloadCount = pages.length;
      const screenings = await this.parsePages(pages);
      const validated = this.validate(screenings);
      // `validate()` is overridable and three subclasses call super and then
      // filter further, so the report recorded inside the base implementation
      // can describe a larger surviving set than the one actually returned.
      this.reconcilePreFilterReport(validated.length);
      await this.cleanup();

      console.log(`[${this.config.cinemaId}] Found ${validated.length} valid screenings`);
      return validated;
    } catch (error) {
      console.error(`[${this.config.cinemaId}] Scrape failed:`, error);
      throw error;
    }
  }

  /**
   * Bring the pre-filter report into line with what `validate()` returned.
   *
   * `BaseScraper.validate` records its report from its own predicates, but the
   * method is overridable: `nickel-v2.ts`, `genesis-v2.ts` and `lexi-v2.ts` all
   * call `super.validate()` and then filter the result again. Nickel's override
   * drops `MYSTERY MOVIE` titles, so a batch of one mystery screening reported
   * `parsed: 1, accepted: 1, rejected: 0` while `scrape()` returned nothing and
   * the pipeline accepted nothing — a conservation failure that was an
   * accounting artefact rather than a real one.
   *
   * The surviving set is passed through untouched; only the counts move. The
   * shortfall is attributed to `subclass_filter`, which names the fact honestly
   * without the base class pretending to know the subclass's reason. An
   * override that returns MORE than the base filter kept cannot be described by
   * this report at all, so the report becomes unavailable rather than wrong.
   */
  private reconcilePreFilterReport(survivorCount: number): void {
    const report = this.preFilterReport;
    if (!report || report.accepted === survivorCount) return;

    const droppedBySubclass = report.accepted - survivorCount;
    if (droppedBySubclass < 0) {
      console.warn(
        `[${this.config.cinemaId}] validate() returned ${survivorCount} screenings, ` +
          `more than the ${report.accepted} the base filter kept. Pre-filter counts ` +
          `are unavailable for this run.`,
      );
      this.preFilterReport = null;
      return;
    }

    this.preFilterReport = {
      parsed: report.parsed,
      accepted: survivorCount,
      rejected: report.parsed - survivorCount,
      byReason: { ...report.byReason, subclass_filter: droppedBySubclass },
    };
  }

  /**
   * Pre-filter counts from the last `scrape()`, or null if none has completed
   * its validate step. Callers must treat null as "not measured", never as
   * zero loss.
   */
  getPreFilterReport(): PreFilterReport | null {
    return this.preFilterReport;
  }

  /**
   * Payloads returned by the last `scrape()`'s `fetchPages()`, or null if not
   * measured.
   *
   * A payload is one entry of the `string[]` that `fetchPages()` returns, which
   * is **not** an HTTP request count: subclasses that hit a bundled JSON API,
   * or that concatenate a paginated fetch before returning, make several calls
   * per entry. Named for the unit it actually counts so no reader mistakes it
   * for request volume.
   */
  getFetchedPayloadCount(): number | null {
    return this.fetchedPayloadCount;
  }

  /**
   * Fetch HTML pages from the cinema website
   */
  protected abstract fetchPages(): Promise<string[]>;

  /**
   * Parse HTML pages into raw screenings
   */
  protected abstract parsePages(htmlPages: string[]): Promise<RawScreening[]>;

  /**
   * Initialize before scraping (optional override)
   */
  protected async initialize(): Promise<void> {}

  /**
   * Cleanup after scraping (optional override)
   */
  protected async cleanup(): Promise<void> {}

  /**
   * Validate and filter screenings.
   *
   * The predicates, their order and the surviving set are unchanged. The only
   * addition is a tally of *why* each drop happened, recorded on the instance
   * and read back by the runner via `getPreFilterReport()`. Every candidate is
   * attributed to exactly one reason (the first that matches), so
   * `parsed = accepted + rejected` holds by construction.
   */
  protected validate(screenings: RawScreening[]): RawScreening[] {
    const now = new Date();
    const seen = new Set<string>();
    const byReason: Partial<Record<PreFilterReason, number>> = {};
    const drop = (reason: PreFilterReason): false => {
      byReason[reason] = (byReason[reason] ?? 0) + 1;
      return false;
    };

    const accepted = screenings.filter((s) => {
      // Must have title
      if (!s.filmTitle || s.filmTitle.trim() === "") {
        return drop("missing_title");
      }

      // Must have valid datetime in the future
      if (!s.datetime || isNaN(s.datetime.getTime())) {
        return drop("invalid_datetime");
      }
      if (s.datetime < now) {
        return drop("past_screening");
      }

      // Must have booking URL
      if (!s.bookingUrl || s.bookingUrl.trim() === "") {
        return drop("missing_booking_url");
      }

      // Deduplicate by sourceId
      if (s.sourceId && seen.has(s.sourceId)) {
        return drop("duplicate_source_id");
      }
      if (s.sourceId) seen.add(s.sourceId);

      return true;
    });

    this.preFilterReport = {
      parsed: screenings.length,
      accepted: accepted.length,
      rejected: screenings.length - accepted.length,
      byReason,
    };

    if (this.preFilterReport.rejected > 0) {
      console.warn(
        `[${this.config.cinemaId}] Pre-filter dropped ` +
          `${this.preFilterReport.rejected} of ${screenings.length} parsed ` +
          `screening(s): ${JSON.stringify(byReason)}`
      );
    }

    return accepted;
  }

  /**
   * Fetch a single URL with rate limiting
   */
  protected async fetchUrl(url: string): Promise<string> {
    // Rate limiting delay
    await this.delay(this.config.delayBetweenRequests);

    const response = await fetch(url, {
      headers: {
        "User-Agent": CHROME_USER_AGENT_FULL,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Create a Cheerio instance from HTML
   */
  protected parseHtml(html: string) {
    return cheerio.load(html);
  }

  /**
   * Delay helper for rate limiting
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Load a config overlay if one exists for this cinema.
   * Called automatically at the start of scrape().
   * Checks DB first (AutoScrape persists learned overlays there),
   * then falls back to filesystem (local dev).
   */
  protected async loadConfigOverlay(): Promise<void> {
    // Try DB first (survives the cloud orchestrator container restarts).
    // Uses a module-level cache so only 1 DB query per process, not per scraper.
    try {
      if (dbOverlayCache === null) {
        const { db, isDatabaseAvailable } = await import("@/db");
        if (isDatabaseAvailable) {
          const { autoresearchConfig } = await import("@/db/schema/admin");
          const { like } = await import("drizzle-orm");
          const rows = await db
            .select()
            .from(autoresearchConfig)
            .where(like(autoresearchConfig.key, "autoscrape/overlay/%"));
          dbOverlayCache = new Map(
            rows.map((r) => [r.key, r.value as unknown as ConfigOverlay])
          );
        } else {
          dbOverlayCache = new Map();
        }
      }

      const dbKey = `autoscrape/overlay/${this.config.cinemaId}`;
      const cached = dbOverlayCache.get(dbKey);
      if (cached) {
        this.configOverlay = cached;
        console.log(`[${this.config.cinemaId}] Loaded config overlay from DB`);
        return;
      }
    } catch {
      dbOverlayCache = new Map(); // Mark as checked, no overlays available
    }

    // Fall back to filesystem (local dev)
    const overlayPath = join(OVERLAY_DIR, `${this.config.cinemaId}.json`);
    try {
      const raw = await readFile(overlayPath, "utf-8");
      this.configOverlay = JSON.parse(raw) as ConfigOverlay;
      console.log(`[${this.config.cinemaId}] Loaded config overlay from disk`);
    } catch (err) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
        this.configOverlay = null; // Expected: no overlay for this cinema
        return;
      }
      console.error(`[${this.config.cinemaId}] Failed to load config overlay:`, err);
      this.configOverlay = null;
    }
  }

  /**
   * Get a selector, preferring the overlay value if one exists.
   * Subclasses call this instead of hardcoding selectors to enable AutoScrape.
   */
  protected getSelector(purpose: string, defaultSelector: string): string {
    return this.configOverlay?.selectorOverrides?.[purpose] ?? defaultSelector;
  }

  /**
   * Get a URL, preferring the overlay value if one exists.
   */
  protected getUrl(purpose: string, defaultUrl: string): string {
    return this.configOverlay?.urlOverrides?.[purpose] ?? defaultUrl;
  }

  /**
   * Health check — verify the website is accessible.
   *
   * ADVISORY ONLY. The runner logs a failure and scrapes anyway
   * (runner-factory.ts, runSingleVenue) — it must never be the reason a venue
   * is skipped. It used to abort the scrape while being *stricter* than the
   * work it gated: 10s and a UA-only GET against fetchUrl's 30s and full
   * browser headers. Measured on 2026-08-05, Close-Up's homepage returns 200 in
   * 1.9-6.5s sequentially but breaches 10s under the 4-way concurrency the
   * nightly run uses, and header shape made no difference (UA-only, full
   * headers and no UA all returned 200). So the timeout and headers below now
   * match fetchUrl exactly — the precheck can no longer fail where the real
   * request would succeed.
   *
   * Retries with a short backoff: a single failing GET turned out to be the
   * root cause of the May 2026 Close-Up "33% failure rate" pattern. All 3
   * failures fell in the 03:17-03:21 UTC window and the site recovered within
   * seconds — every other run that day succeeded. Worst case on the unhealthy
   * path is 3 attempts × 30s timeout × 4s gap ≈ 98s, and that is paid at most
   * ONCE per venue per run: runSingleVenue probes outside its retry loop, so a
   * host that black-holes packets can no longer spend ~400s here and blow the
   * venue wall-clock cap. The internal retry stays because runScraperForYield
   * still treats a `false` as a hard veto, and a spurious veto there scores an
   * AutoScrape candidate config at zero yield.
   *
   * Subclasses may still override to provide cheaper or different checks
   * (e.g. Curzon HEADs the API endpoint with a 401-is-healthy contract).
   */
  async healthCheck(): Promise<boolean> {
    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = 4_000;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(this.config.baseUrl, {
          method: "GET",
          // Same headers as fetchUrl: the gate must not be less browser-like
          // than the request it gates.
          headers: {
            "User-Agent": CHROME_USER_AGENT_FULL,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-GB,en;q=0.9",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(30_000),
        });
        if (response.ok) return true;
        // 4xx/5xx — only worth retrying transient 5xx; bail fast on 4xx
        if (response.status < 500) return false;
      } catch {
        // Network error / timeout — fall through to retry
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS));
      }
    }
    return false;
  }
}
