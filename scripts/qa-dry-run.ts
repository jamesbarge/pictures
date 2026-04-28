#!/usr/bin/env npx tsx
/**
 * QA Dry Run — Local manual execution against prod
 *
 * Runs the QA pipeline locally without Trigger.dev:
 *   1. Browse pictures.london with Playwright
 *   2. Load DB state and run deterministic checks
 *   3. Print findings (no DB writes, no Gemini calls)
 *
 * Usage: npx tsx scripts/qa-dry-run.ts
 */

// Load env BEFORE any other imports
import { config } from "dotenv";
config({ path: ".env.local" });

import { chromium } from "rebrowser-playwright";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { eq, gte, lte, and } from "drizzle-orm";
import { extractFrontEndData, checkCompleteness } from "@/trigger/qa/utils/front-end-extractor";
import { normalizeTitle } from "@/trigger/qa/utils/title-utils";

const DIVIDER = "═".repeat(60);

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function main() {
  const startTime = Date.now();

  console.log(`\n${DIVIDER}`);
  console.log("  QA Dry Run — pictures.london vs Production DB");
  console.log(`${DIVIDER}\n`);

  // Create a direct DB connection (bypasses @/db singleton)
  const sql = postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 1,
    idle_timeout: 10,
    connect_timeout: 10,
  });
  const db = drizzle(sql, { schema });

  // Date range
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().split("T")[0];
  const dayAfterTomorrow = new Date(now.getTime() + 2 * 86_400_000).toISOString().split("T")[0];
  log(`Date range: ${today} to ${tomorrow}`);

  // ── Step 1: DB pre-check ─────────────────────────────────────
  log("Loading DB state...");
  const dbScreenings = await db
    .select({
      screeningId: schema.screenings.id,
      filmId: schema.screenings.filmId,
      cinemaId: schema.screenings.cinemaId,
      datetime: schema.screenings.datetime,
      bookingUrl: schema.screenings.bookingUrl,
      filmTitle: schema.films.title,
      tmdbId: schema.films.tmdbId,
      posterUrl: schema.films.posterUrl,
      letterboxdRating: schema.films.letterboxdRating,
      matchConfidence: schema.films.matchConfidence,
      matchStrategy: schema.films.matchStrategy,
    })
    .from(schema.screenings)
    .innerJoin(schema.films, eq(schema.screenings.filmId, schema.films.id))
    .where(
      and(
        gte(schema.screenings.datetime, new Date(`${today}T00:00:00Z`)),
        lte(schema.screenings.datetime, new Date(`${dayAfterTomorrow}T00:00:00Z`))
      )
    );

  const uniqueFilmIds = new Set(dbScreenings.map((s) => s.filmId));
  log(`DB: ${dbScreenings.length} screenings, ${uniqueFilmIds.size} unique films for today+tomorrow`);

  // ── Step 2: Playwright extraction ────────────────────────────
  log("Launching browser...");
  const browser = await chromium.launch({ headless: true });

  let extractResult;
  try {
    extractResult = await extractFrontEndData(browser, [today, tomorrow]);
  } finally {
    await browser.close();
  }

  log(`Front-end: ${extractResult.films.length} films, ${extractResult.screenings.length} screenings`);

  if (extractResult.errors.length > 0) {
    console.log(`\n⚠ Extraction errors (${extractResult.errors.length}):`);
    for (const err of extractResult.errors.slice(0, 10)) {
      console.log(`  - ${err.url ?? ""} ${err.message}`);
    }
  }

  // ── Completeness guard ───────────────────────────────────────
  const completeness = checkCompleteness(extractResult.films.length, uniqueFilmIds.size);
  log(`Completeness: ${extractResult.films.length}/${uniqueFilmIds.size} = ${(completeness.ratio * 100).toFixed(1)}% (${completeness.ok ? "PASS" : "FAIL"})`);

  if (!completeness.ok) {
    console.log("\n🚫 Completeness guard would abort the pipeline here.");
    console.log("   This means the front-end may be down, cached stale, or Playwright failed to render.\n");
  }

  // ── Step 3: Deterministic checks ─────────────────────────────
  console.log(`\n${DIVIDER}`);
  console.log("  Deterministic Checks");
  console.log(`${DIVIDER}\n`);

  // 3a: Stale screenings
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000);
  const stale = dbScreenings.filter((s) => s.datetime < twoHoursAgo);
  console.log(`Stale screenings (>2h past): ${stale.length}`);
  for (const s of stale.slice(0, 5)) {
    console.log(`  ⏰ "${s.filmTitle}" at ${s.datetime.toISOString()} [${s.cinemaId}]`);
  }
  if (stale.length > 5) console.log(`  ... and ${stale.length - 5} more`);

  // 3b: Missing Letterboxd
  const missingLb = new Map<string, string>();
  for (const s of dbScreenings) {
    if (s.tmdbId && !s.letterboxdRating && !missingLb.has(s.filmId)) {
      missingLb.set(s.filmId, s.filmTitle);
    }
  }
  console.log(`\nMissing Letterboxd (has TMDB, no rating): ${missingLb.size}`);
  for (const [, title] of Array.from(missingLb.entries()).slice(0, 10)) {
    console.log(`  📊 "${title}"`);
  }
  if (missingLb.size > 10) console.log(`  ... and ${missingLb.size - 10} more`);

  // 3c: Low confidence TMDB matches
  const lowConf = new Map<string, { title: string; confidence: number; strategy: string | null }>();
  for (const s of dbScreenings) {
    if (s.matchConfidence !== null && s.matchConfidence < 0.6 && !lowConf.has(s.filmId)) {
      lowConf.set(s.filmId, { title: s.filmTitle, confidence: s.matchConfidence, strategy: s.matchStrategy });
    }
  }
  console.log(`\nLow confidence TMDB matches (<0.6): ${lowConf.size}`);
  for (const [, film] of Array.from(lowConf.entries()).slice(0, 10)) {
    console.log(`  🎯 "${film.title}" (confidence: ${film.confidence?.toFixed(2)}, strategy: ${film.strategy})`);
  }

  // ── Step 4: Front-end vs DB comparison ───────────────────────
  console.log(`\n${DIVIDER}`);
  console.log("  Front-End vs DB Comparison");
  console.log(`${DIVIDER}\n`);

  // 4a: Films on front-end but title doesn't match any DB film
  const dbTitleSet = new Set(dbScreenings.map((s) => normalizeTitle(s.filmTitle)));
  const feOnlyFilms = extractResult.films.filter(
    (f) => !dbTitleSet.has(normalizeTitle(f.title))
  );
  console.log(`Films on front-end not found in DB (normalized): ${feOnlyFilms.length}`);
  for (const f of feOnlyFilms.slice(0, 10)) {
    console.log(`  🔍 "${f.title}" (slug: ${f.slug})`);
  }
  if (feOnlyFilms.length > 10) console.log(`  ... and ${feOnlyFilms.length - 10} more`);

  // 4b: Screening title mismatches (same booking URL, different title)
  let titleMismatches = 0;
  const mismatchExamples: string[] = [];
  for (const feScreening of extractResult.screenings) {
    if (!feScreening.bookingUrl) continue;
    const dbMatch = dbScreenings.find((d) => d.bookingUrl === feScreening.bookingUrl);
    if (dbMatch) {
      const feNorm = normalizeTitle(feScreening.filmTitle);
      const dbNorm = normalizeTitle(dbMatch.filmTitle);
      if (feNorm !== dbNorm) {
        titleMismatches++;
        if (mismatchExamples.length < 5) {
          mismatchExamples.push(`  📝 FE: "${feScreening.filmTitle}" vs DB: "${dbMatch.filmTitle}" [${feScreening.bookingUrl.slice(0, 60)}...]`);
        }
      }
    }
  }
  console.log(`\nTitle mismatches (same booking URL): ${titleMismatches}`);
  for (const ex of mismatchExamples) console.log(ex);
  if (titleMismatches > 5) console.log(`  ... and ${titleMismatches - 5} more`);

  // 4c: Booking URLs from front-end not in DB
  const dbUrlSet = new Set(dbScreenings.map((s) => s.bookingUrl));
  const feOnlyUrls = extractResult.screenings.filter(
    (s) => s.bookingUrl && !dbUrlSet.has(s.bookingUrl)
  );
  console.log(`\nBooking URLs on front-end not in DB: ${feOnlyUrls.length}`);
  for (const s of feOnlyUrls.slice(0, 5)) {
    console.log(`  🔗 "${s.filmTitle}" at ${s.cinemaName} → ${s.bookingUrl.slice(0, 80)}...`);
  }
  if (feOnlyUrls.length > 5) console.log(`  ... and ${feOnlyUrls.length - 5} more`);

  // ── Step 5: Scope classification preview ─────────────────────
  console.log(`\n${DIVIDER}`);
  console.log("  Scope Classification Preview");
  console.log(`${DIVIDER}\n`);

  const filmsMissingPoster = dbScreenings.filter((s) => !s.posterUrl);
  const cinemasMissingPoster = new Map<string, number>();
  for (const s of filmsMissingPoster) {
    cinemasMissingPoster.set(s.cinemaId, (cinemasMissingPoster.get(s.cinemaId) ?? 0) + 1);
  }
  console.log(`Screenings with missing poster: ${filmsMissingPoster.length}`);
  for (const [cinemaId, count] of Array.from(cinemasMissingPoster.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    const systemic = count >= 3 ? " ⚠ SYSTEMIC" : "";
    console.log(`  🖼 ${cinemaId}: ${count} screenings${systemic}`);
  }

  console.log(`\nMissing Letterboxd: ${missingLb.size >= 5 ? "⚠ SYSTEMIC (≥5 films)" : `${missingLb.size} films (spot)`}`);

  // ── Summary ──────────────────────────────────────────────────
  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n${DIVIDER}`);
  console.log("  Summary");
  console.log(`${DIVIDER}\n`);
  console.log(`Duration: ${durationSec}s`);
  console.log(`DB screenings: ${dbScreenings.length}`);
  console.log(`FE films: ${extractResult.films.length}`);
  console.log(`FE screenings: ${extractResult.screenings.length}`);
  console.log(`Completeness: ${(completeness.ratio * 100).toFixed(1)}% ${completeness.ok ? "✓" : "✗"}`);
  console.log(`Stale: ${stale.length}`);
  console.log(`Missing Letterboxd: ${missingLb.size}`);
  console.log(`Low confidence TMDB: ${lowConf.size}`);
  console.log(`Title mismatches: ${titleMismatches}`);
  console.log(`FE-only films: ${feOnlyFilms.length}`);
  console.log(`FE-only booking URLs: ${feOnlyUrls.length}`);
  console.log(`Extraction errors: ${extractResult.errors.length}`);
  console.log();

  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
