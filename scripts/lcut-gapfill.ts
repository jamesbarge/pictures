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
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx -r tsconfig-paths/register scripts/lcut-gapfill.ts            # dry run (default)
 *   npx dotenv -e .env.local -- npx tsx -r tsconfig-paths/register scripts/lcut-gapfill.ts --execute  # insert missing screenings
 *   ... --days 14   # horizon (default 35)
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
  "the arzner": ["arthouse-crouch-end"],
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
        sourceId: r.sourceId,
      })),
    );
  }
  return byCinema;
}

/** Loose title equivalence: normalized equality or containment either way. */
export function titlesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // Containment guards: only for reasonably long titles to avoid "It"⊂"It Follows"
  if (a.length >= 6 && b.includes(a)) return true;
  if (b.length >= 6 && a.includes(b)) return true;
  return false;
}

export function isCovered(
  lcut: { normTitle: string; datetime: Date; sourceId: string },
  existing: ExistingScreening[],
): boolean {
  for (const e of existing) {
    if (e.sourceId === lcut.sourceId) return true;
    const dt = Math.abs(e.datetime.getTime() - lcut.datetime.getTime());
    if (dt <= DEDUP_WINDOW_MS && titlesMatch(lcut.normTitle, e.normTitle)) {
      return true;
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

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const daysArg = args.indexOf("--days");
  const days = daysArg !== -1 ? parseInt(args[daysArg + 1], 10) : 35;

  console.log(`\nL-CUT gap-fill — ${days}-day horizon — ${execute ? "EXECUTE" : "DRY RUN"}\n`);

  const listings = await fetchLcutListings(days);
  console.log(`Fetched ${listings.length} L-CUT listings\n`);

  // Partition by venue
  const unmapped = new Map<string, number>();
  const byTarget = new Map<string, LcutFilm[]>();
  const dedupIds = new Set<string>();
  for (const f of listings) {
    const ids = VENUE_MAP[normalizeVenueName(f.cinema)];
    if (!ids) {
      unmapped.set(f.cinema, (unmapped.get(f.cinema) ?? 0) + 1);
      continue;
    }
    ids.forEach((id) => dedupIds.add(id));
    const target = ids[0];
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target)!.push(f);
  }

  if (unmapped.size > 0) {
    console.warn("⚠️  UNMAPPED L-CUT venues (add to VENUE_MAP):");
    for (const [name, n] of unmapped) console.warn(`   ${n} listing(s) at ${name}`);
  }

  const now = new Date();
  const to = new Date(now.getTime() + (days + 1) * 86_400_000);
  const existingByCinema = await loadExistingScreenings([...dedupIds], now, to);

  // Diff
  const missingByTarget = new Map<string, RawScreening[]>();
  const report: Array<{ venue: string; total: number; covered: number; missing: number }> = [];
  for (const [target, rows] of byTarget) {
    // Dedup against every candidate cinema for this venue name
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
        console.warn(
          `⚠️  Skipping implausible early screening: ${raw.filmTitle} @ ${f.cinema} ${raw.datetime.toISOString()}`,
        );
        continue;
      }
      const probe = {
        normTitle: normalizeTitle(raw.filmTitle),
        datetime: raw.datetime,
        sourceId: raw.sourceId!,
      };
      if (isCovered(probe, existing)) {
        covered++;
      } else {
        missing.push(raw);
      }
    }
    report.push({ venue: target, total: rows.length, covered, missing: missing.length });
    if (missing.length > 0) missingByTarget.set(target, missing);
  }

  // Coverage report
  report.sort((a, b) => b.missing - a.missing);
  console.log("\n=== L-CUT coverage report ===");
  console.log("venue".padEnd(26), "lcut".padStart(5), "covered".padStart(8), "missing".padStart(8));
  for (const r of report) {
    console.log(r.venue.padEnd(26), String(r.total).padStart(5), String(r.covered).padStart(8), String(r.missing).padStart(8));
  }
  const totalMissing = report.reduce((s, r) => s + r.missing, 0);
  console.log(`\nTotal missing: ${totalMissing}`);

  for (const [target, missing] of missingByTarget) {
    console.log(`\n--- ${target}: ${missing.length} missing ---`);
    for (const m of missing) {
      console.log(`  ${m.datetime.toISOString()}  ${m.filmTitle}  (${m.sourceId})`);
    }
  }

  if (!execute) {
    console.log("\nDry run complete. Re-run with --execute to insert missing screenings.");
    process.exit(0);
  }

  // Execute: run each venue's missing batch through the standard pipeline
  // (title extraction, TMDB matching, upsert on (cinema, sourceId)).
  let added = 0;
  let failed = 0;
  for (const [target, missing] of missingByTarget) {
    console.log(`\n[lcut] Inserting ${missing.length} screenings for ${target}...`);
    const result = await processScreenings(target, missing);
    added += result.added + result.updated;
    failed += result.failed + result.rejected;
    if (result.blocked) {
      console.error(`[lcut] ${target} blocked by diff check — investigate manually`);
    }
  }
  console.log(`\nDone. ${added} added/updated, ${failed} failed/rejected.`);
  process.exit(0);
}

// Only run when executed directly (not when imported by tests)
if (process.argv[1] && /lcut-gapfill/.test(process.argv[1])) {
  main().catch((error) => {
    console.error("[lcut] FATAL:", error);
    process.exit(1);
  });
}
