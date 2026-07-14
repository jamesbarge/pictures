#!/usr/bin/env npx tsx
/**
 * L-CUT Gap-Fill
 *
 * L-CUT (https://lcutlondon.com) is a repertory listings guide with a public
 * JSON API. We scrape all of its venues directly, but occasional venues and
 * the odd missed screening slip through. This script diffs L-CUT's listings
 * against our database and inserts only the screenings we're missing,
 * attributed to the real venue (never to "L-CUT").
 *
 * API: GET https://lcutlondon.com/api/films/date/DD-MM-YYYY?page=N
 *      → { films: [...], hasMore: boolean }
 * Each row carries an ISO UTC `timestamp` (no local-time parsing needed) and
 * the venue's real booking URL.
 *
 * The core is exposed as `runLcutGapfill()` so the weekly `/scrape` orchestrator
 * (src/scripts/run-scrape-and-enrich.ts) can run it AFTER the main scrape wave
 * as both a gap-fill source and a scraper-regression detector. The scheduled
 * caller only inserts for venues WITHOUT a first-party scraper (source-only)
 * and treats a high missing-count at a scraped venue as a regression signal —
 * see classifyLcutTargets / detectLcutRegressions.
 *
 * Usage (CLI — supervised; inserts for ALL venues unless --targets narrows it):
 *   npx dotenv -e .env.local -- npx tsx -r tsconfig-paths/register scripts/lcut-gapfill.ts            # dry run (default)
 *   npx dotenv -e .env.local -- npx tsx -r tsconfig-paths/register scripts/lcut-gapfill.ts --execute  # insert missing screenings
 *   ... --days 14                          # horizon (default 35)
 *   ... --execute --targets the-arzner,horse-hospital   # insert only for these cinema ids
 *
 * sourceId scheme: lcut-{lcutMongoId} — see SCRAPING_PLAYBOOK.md.
 */

import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { processScreenings, normalizeTitle } from "@/scrapers/pipeline";
import { sanitizeRuntime } from "@/scrapers/utils/metadata-parser";
import type { RawScreening } from "@/scrapers/types";

const LCUT_BASE = "https://lcutlondon.com";
const REQUEST_DELAY_MS = 400;
const MAX_PAGES_PER_DAY = 15;
const DEDUP_WINDOW_MS = 20 * 60 * 1000; // ±20 minutes

/**
 * L-CUT venue name → our cinema ID(s).
 * First ID is the insert target; ALL IDs are checked during dedup (L-CUT
 * labels both BFI venues "British Film Institute", so a Southbank-attributed
 * row must also dedup against IMAX).
 * Keys are normalized via normalizeVenueName (lowercase, emoji stripped).
 */
const VENUE_MAP: Record<string, string[]> = {
  "prince charles cinema": ["prince-charles"],
  "british film institute": ["bfi-southbank", "bfi-imax"],
  "institute of contemporary arts": ["ica"],
  "the garden cinema": ["garden"],
  "barbican centre": ["barbican"],
  "the lexi cinema": ["lexi"],
  "the castle cinema": ["castle"],
  "the rio cinema": ["rio-dalston"],
  // The Arzner is a distinct LGBTQ+ cinema in Bermondsey (NOT ArtHouse Crouch
  // End — an easy mixup; verified against thearzner.com 2026-07-13)
  "the arzner": ["the-arzner"],
  "the nickel": ["the-nickel"],
  "phoenix cinema": ["phoenix-east-finchley"],
  "cine lumiere": ["cine-lumiere"],
  "close-up film centre": ["close-up-cinema"],
  "the cinema museum": ["cinema-museum"],
  "the horse hospital": ["horse-hospital"],
  "good shepherd studios": ["good-shepherd-studios"],
  "project loop": ["project-loop"],
};

export function normalizeVenueName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (Ciné → Cine)
    .replace(/[^\p{L}\p{N}\s-]/gu, "") // strip emoji/symbols (🏳️‍🌈)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Distinct insert-target cinema ids (the first id of each VENUE_MAP entry). */
export function getLcutTargetCinemaIds(): string[] {
  return [...new Set(Object.values(VENUE_MAP).map((ids) => ids[0]))];
}

/**
 * Split L-CUT targets into "source-only" (no first-party scraper — safe to
 * auto-insert) vs "scraped" (we scrape it ourselves — report-only, monitored
 * for regressions). `scrapedIds` is the set of cinema ids covered by the
 * scraper registry (see getScrapedCinemaIds in scrapers/registry.ts). Deriving
 * the split at runtime means a venue auto-reclassifies the moment it gains a
 * first-party scraper.
 */
export function classifyLcutTargets(scrapedIds: Set<string>): {
  sourceOnly: Set<string>;
  scraped: Set<string>;
} {
  const sourceOnly = new Set<string>();
  const scraped = new Set<string>();
  for (const target of getLcutTargetCinemaIds()) {
    (scrapedIds.has(target) ? scraped : sourceOnly).add(target);
  }
  return { sourceOnly, scraped };
}

export interface LcutFilm {
  id: string;
  title: string;
  director: string | null;
  year: number | null;
  runtime: number | null;
  imageUrl: string | null;
  cinema: string;
  timestamp: string;
  url: string;
  date: string;
  showtime: string;
}

interface LcutApiResponse {
  films: LcutFilm[];
  hasMore: boolean;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJsonWithRetry(url: string, attempts = 3): Promise<LcutApiResponse> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; pictures.london)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return (await res.json()) as LcutApiResponse;
    } catch (error) {
      lastError = error;
      console.warn(`[lcut] Fetch failed (attempt ${i + 1}/${attempts}): ${url}`);
      await delay(1000 * (i + 1));
    }
  }
  // Never swallow fetch errors as empty success (SCRAPING_PLAYBOOK.md)
  throw lastError;
}

/** DD-MM-YYYY in Europe/London for a date offset from today */
function lcutDateKey(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("day")}-${get("month")}-${get("year")}`;
}

async function fetchLcutListings(days: number): Promise<LcutFilm[]> {
  const all: LcutFilm[] = [];
  for (let offset = 0; offset < days; offset++) {
    const dateKey = lcutDateKey(offset);
    for (let page = 1; page <= MAX_PAGES_PER_DAY; page++) {
      const data = await fetchJsonWithRetry(
        `${LCUT_BASE}/api/films/date/${dateKey}?page=${page}`,
      );
      all.push(...data.films);
      await delay(REQUEST_DELAY_MS);
      if (!data.hasMore) break;
    }
  }
  return all;
}

interface ExistingScreening {
  datetime: Date;
  normTitle: string;
  gentleTitle: string;
  /** Normalized films.original_title — canonicalization can rename a film
   * (e.g. "As Aves" → "Breaking and Re-entering"), so match either. */
  normOriginalTitle: string | null;
  sourceId: string | null;
}

async function loadExistingScreenings(
  cinemaIds: string[],
  from: Date,
  to: Date,
): Promise<Map<string, ExistingScreening[]>> {
  const byCinema = new Map<string, ExistingScreening[]>();
  for (const cinemaId of cinemaIds) {
    const rows = await db
      .select({
        datetime: screenings.datetime,
        title: films.title,
        originalTitle: films.originalTitle,
        sourceId: screenings.sourceId,
      })
      .from(screenings)
      .innerJoin(films, eq(screenings.filmId, films.id))
      .where(
        and(
          eq(screenings.cinemaId, cinemaId),
          gte(screenings.datetime, from),
          lte(screenings.datetime, to),
        ),
      );
    byCinema.set(
      cinemaId,
      rows.map((r) => ({
        datetime: r.datetime,
        normTitle: normalizeTitle(r.title),
        gentleTitle: gentleNormalize(r.title),
        normOriginalTitle: r.originalTitle ? normalizeTitle(r.originalTitle) : null,
        sourceId: r.sourceId,
      })),
    );
  }
  return byCinema;
}

/**
 * Gentle normalization WITHOUT the pipeline's cleanFilmTitle — that helper
 * strips "Something:" as an event prefix, which mangles legitimate colon
 * titles ("Kingdom of Heaven: Director's Cut" → "directors cut"). Compare
 * under BOTH normalizations and match on either.
 */
export function gentleNormalize(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/i, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sørensen–Dice bigram similarity on normalized titles (0..1). */
export function bigramSimilarity(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return (2 * overlap) / (a.length - 1 + b.length - 1);
}

/**
 * Loose title equivalence: normalized equality, containment either way, or
 * high bigram similarity (catches spelling variants — "Colour of
 * Pomegranates" vs "Color of Pomegranates" scored a real duplicate on the
 * 2026-07-13 dry run).
 */
export function titlesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // Containment guards: only for reasonably long titles to avoid "It"⊂"It Follows"
  if (a.length >= 6 && b.includes(a)) return true;
  if (b.length >= 6 && a.includes(b)) return true;
  return bigramSimilarity(a, b) >= 0.85;
}

export function isCovered(
  lcut: { normTitle: string; gentleTitle: string; datetime: Date; sourceId: string },
  existing: ExistingScreening[],
): boolean {
  for (const e of existing) {
    if (e.sourceId === lcut.sourceId) return true;
    const dt = Math.abs(e.datetime.getTime() - lcut.datetime.getTime());
    if (dt > DEDUP_WINDOW_MS) continue;
    const candidates = [e.normTitle, e.gentleTitle, e.normOriginalTitle].filter(
      (t): t is string => t !== null,
    );
    for (const c of candidates) {
      if (titlesMatch(lcut.normTitle, c) || titlesMatch(lcut.gentleTitle, c)) {
        return true;
      }
    }
  }
  return false;
}

function toRawScreening(f: LcutFilm): RawScreening {
  const posterUrl = f.imageUrl
    ? f.imageUrl.startsWith("http")
      ? f.imageUrl
      : `${LCUT_BASE}${f.imageUrl}`
    : undefined;
  return {
    filmTitle: f.title.trim(),
    datetime: new Date(f.timestamp),
    bookingUrl: f.url || LCUT_BASE,
    sourceId: `lcut-${f.id}`,
    year: f.year ?? undefined,
    director: f.director ?? undefined,
    runtime: sanitizeRuntime(f.runtime),
    posterUrl,
    timeSource: "iso",
  };
}

// ============================================================================
// Reusable core — used by the CLI (below) and the weekly /scrape orchestrator.
// ============================================================================

/** Per-venue coverage of L-CUT's listings against our DB for a single run. */
export interface VenueParity {
  /** Insert-target cinema id (first id of the VENUE_MAP entry). */
  venue: string;
  /** Total L-CUT listings mapped to this venue in the horizon. */
  total: number;
  /** Listings already present in our DB (deduped). */
  covered: number;
  /** Listings we're missing (count). */
  missing: number;
  /** The missing rows, ready to insert. */
  missingRows: RawScreening[];
  /** added+updated when this venue was executed (0 if report-only). */
  inserted: number;
  /** failed+rejected when this venue was executed. */
  failed: number;
  /** True if the pipeline diff-check blocked the insert. */
  blocked: boolean;
}

export interface LcutGapfillReport {
  days: number;
  executed: boolean;
  listingCount: number;
  /** L-CUT venue names we have no mapping for (need adding to VENUE_MAP). */
  unmapped: Array<{ name: string; count: number }>;
  /** Per-venue parity, sorted by missing count descending. */
  venues: VenueParity[];
  totalMissing: number;
  totalInserted: number;
  totalFailed: number;
}

export interface RunLcutGapfillOptions {
  /** Horizon in days (default 35). */
  days?: number;
  /** Insert missing screenings (default false = dry run / report only). */
  execute?: boolean;
  /**
   * When executing, only insert for these target cinema ids. Parity is still
   * computed and returned for EVERY venue. Undefined = insert for all venues
   * with missing rows. The scheduled caller passes the source-only set so
   * scraped venues stay report-only (see classifyLcutTargets).
   */
  executeTargets?: Set<string>;
  /** Injectable fetch (tests). Defaults to the real L-CUT API crawl. */
  fetchListings?: (days: number) => Promise<LcutFilm[]>;
  /** Injectable DB read (tests). Defaults to loadExistingScreenings. */
  loadExisting?: (
    cinemaIds: string[],
    from: Date,
    to: Date,
  ) => Promise<Map<string, ExistingScreening[]>>;
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
}

/**
 * Fetch L-CUT's listings, diff them against our DB, and (optionally) insert the
 * screenings we're missing. Returns per-venue parity so callers can both fill
 * gaps and detect scraper regressions.
 */
export async function runLcutGapfill(
  opts: RunLcutGapfillOptions = {},
): Promise<LcutGapfillReport> {
  const days = opts.days ?? 35;
  const execute = opts.execute ?? false;
  const log = opts.log ?? ((m: string) => console.log(m));
  const warn = opts.warn ?? ((m: string) => console.warn(m));
  const fetchListings = opts.fetchListings ?? fetchLcutListings;
  const loadExisting = opts.loadExisting ?? loadExistingScreenings;

  const listings = await fetchListings(days);

  // Partition listings by insert-target cinema id.
  const unmappedCounts = new Map<string, number>();
  const byTarget = new Map<string, LcutFilm[]>();
  const dedupIds = new Set<string>();
  for (const f of listings) {
    const ids = VENUE_MAP[normalizeVenueName(f.cinema)];
    if (!ids) {
      unmappedCounts.set(f.cinema, (unmappedCounts.get(f.cinema) ?? 0) + 1);
      continue;
    }
    ids.forEach((id) => dedupIds.add(id));
    const target = ids[0];
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target)!.push(f);
  }
  const unmapped = [...unmappedCounts].map(([name, count]) => ({ name, count }));

  const now = new Date();
  const to = new Date(now.getTime() + (days + 1) * 86_400_000);
  const existingByCinema = await loadExisting([...dedupIds], now, to);

  // Diff each venue's listings against the DB → per-venue parity.
  const venues: VenueParity[] = [];
  for (const [target, rows] of byTarget) {
    // Dedup against every candidate cinema for this venue name.
    const candidates = Object.values(VENUE_MAP).find((ids) => ids[0] === target) ?? [target];
    const existing = candidates.flatMap((id) => existingByCinema.get(id) ?? []);
    const missing: RawScreening[] = [];
    let covered = 0;
    for (const f of rows) {
      const raw = toRawScreening(f);
      if (raw.datetime <= now) continue; // past screenings — not our problem
      // timeSource:"iso" relaxes the pipeline's early-time heuristics, so
      // guard here: screenings before 09:00 London are almost certainly bad
      // upstream data (e.g. "Blue Heron" at Phoenix, 06:00). Skip + warn.
      const londonHour = parseInt(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/London",
          hour: "2-digit",
          hour12: false,
        }).format(raw.datetime),
        10,
      );
      if (londonHour < 9) {
        warn(
          `⚠️  Skipping implausible early screening: ${raw.filmTitle} @ ${f.cinema} ${raw.datetime.toISOString()}`,
        );
        continue;
      }
      const probe = {
        normTitle: normalizeTitle(raw.filmTitle),
        gentleTitle: gentleNormalize(raw.filmTitle),
        datetime: raw.datetime,
        sourceId: raw.sourceId!,
      };
      if (isCovered(probe, existing)) {
        covered++;
        continue;
      }
      // Self-dedup: L-CUT itself lists the same screening under variant
      // titles (e.g. "Backrooms" ×3 at PCC 31 Jul 17:00). Keep the first.
      const dupOfKept = missing.some(
        (m) =>
          Math.abs(m.datetime.getTime() - raw.datetime.getTime()) <= DEDUP_WINDOW_MS &&
          (titlesMatch(normalizeTitle(m.filmTitle), probe.normTitle) ||
            titlesMatch(gentleNormalize(m.filmTitle), probe.gentleTitle)),
      );
      if (dupOfKept) {
        covered++;
        continue;
      }
      missing.push(raw);
    }
    venues.push({
      venue: target,
      total: rows.length,
      covered,
      missing: missing.length,
      missingRows: missing,
      inserted: 0,
      failed: 0,
      blocked: false,
    });
  }
  venues.sort((a, b) => b.missing - a.missing);

  let totalInserted = 0;
  let totalFailed = 0;
  if (execute) {
    for (const v of venues) {
      if (v.missingRows.length === 0) continue;
      // Report-only for venues excluded from executeTargets (i.e. venues we
      // scrape ourselves — auto-inserting L-CUT rows there would mask scraper
      // regressions the parity report is meant to catch).
      if (opts.executeTargets && !opts.executeTargets.has(v.venue)) continue;
      log(`[lcut] Inserting ${v.missingRows.length} screenings for ${v.venue}...`);
      // skipSupersededCleanup: this is a PARTIAL batch — running the pipeline's
      // superseded-cleanup against it deletes legitimate rows (2026-07-13).
      const result = await processScreenings(v.venue, v.missingRows, {
        skipSupersededCleanup: true,
      });
      v.inserted = result.added + result.updated;
      v.failed = result.failed + result.rejected;
      v.blocked = result.blocked;
      totalInserted += v.inserted;
      totalFailed += v.failed;
      if (result.blocked) {
        warn(`[lcut] ${v.venue} blocked by diff check — investigate manually`);
      }
    }
  }

  return {
    days,
    executed: execute,
    listingCount: listings.length,
    unmapped,
    venues,
    totalMissing: venues.reduce((s, v) => s + v.missing, 0),
    totalInserted,
    totalFailed,
  };
}

/** A scraped venue that L-CUT sees more screenings at than we do. */
export interface RegressionSignal {
  venue: string;
  missing: number;
  total: number;
  covered: number;
}

/**
 * Scraped venues (in `scrapedIds`) whose missing count exceeds `threshold` —
 * a signal that our own scraper silently dropped screenings a third party
 * still lists. Source-only venues are excluded (their "missing" is expected
 * gap-fill work, not a regression).
 */
export function detectLcutRegressions(
  report: LcutGapfillReport,
  scrapedIds: Set<string>,
  threshold: number,
): RegressionSignal[] {
  return report.venues
    .filter((v) => scrapedIds.has(v.venue) && v.missing > threshold)
    .map((v) => ({ venue: v.venue, missing: v.missing, total: v.total, covered: v.covered }))
    .sort((a, b) => b.missing - a.missing);
}

/** Render the per-venue coverage table as a printable string. */
export function formatParityTable(report: LcutGapfillReport): string {
  const lines: string[] = [];
  lines.push("=== L-CUT coverage report ===");
  lines.push(
    [
      "venue".padEnd(26),
      "lcut".padStart(5),
      "covered".padStart(8),
      "missing".padStart(8),
    ].join(" "),
  );
  for (const v of report.venues) {
    lines.push(
      [
        v.venue.padEnd(26),
        String(v.total).padStart(5),
        String(v.covered).padStart(8),
        String(v.missing).padStart(8),
      ].join(" "),
    );
  }
  lines.push(`\nTotal missing: ${report.totalMissing}`);
  return lines.join("\n");
}

// ============================================================================
// CLI wrapper (supervised manual runs).
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const daysArg = args.indexOf("--days");
  const days = daysArg !== -1 ? parseInt(args[daysArg + 1], 10) : 35;
  const targetsArg = args.indexOf("--targets");
  const executeTargets =
    targetsArg !== -1
      ? new Set(
          // `?? ""` guards `--targets` passed as the last arg (no value).
          (args[targetsArg + 1] ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        )
      : undefined;

  console.log(`\nL-CUT gap-fill — ${days}-day horizon — ${execute ? "EXECUTE" : "DRY RUN"}\n`);

  const report = await runLcutGapfill({ days, execute, executeTargets });
  console.log(`Fetched ${report.listingCount} L-CUT listings\n`);

  if (report.unmapped.length > 0) {
    console.warn("⚠️  UNMAPPED L-CUT venues (add to VENUE_MAP):");
    for (const u of report.unmapped) console.warn(`   ${u.count} listing(s) at ${u.name}`);
  }

  console.log("\n" + formatParityTable(report));

  for (const v of report.venues) {
    if (v.missingRows.length === 0) continue;
    console.log(`\n--- ${v.venue}: ${v.missingRows.length} missing ---`);
    for (const m of v.missingRows) {
      console.log(`  ${m.datetime.toISOString()}  ${m.filmTitle}  (${m.sourceId})`);
    }
  }

  if (!execute) {
    console.log("\nDry run complete. Re-run with --execute to insert missing screenings.");
    process.exit(0);
  }

  console.log(
    `\nDone. ${report.totalInserted} added/updated, ${report.totalFailed} failed/rejected.`,
  );
  process.exit(0);
}

// Only run when executed directly (not when imported by tests or the orchestrator)
if (process.argv[1] && /lcut-gapfill/.test(process.argv[1])) {
  main().catch((error) => {
    console.error("[lcut] FATAL:", error);
    process.exit(1);
  });
}
