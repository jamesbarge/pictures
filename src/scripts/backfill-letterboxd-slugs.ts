/**
 * Backfill letterboxd_slug for films that already have a letterboxd_url.
 *
 * Default-dry: prints the plan without writing. Pass --execute to apply.
 * Pass --skip-tmdb to skip phase 2 (the only phase that hits letterboxd.com).
 *
 * Phase 1 (no network): parse the slug out of slug-style URLs
 *   (https://letterboxd.com/film/{slug}/) and store it in letterboxd_slug.
 * Phase 2 (network):   /tmdb/{id}-style URLs are fetched (500ms rate limit);
 *   Letterboxd redirects them to the canonical film page. The final slug +
 *   URL are stored after verifying the page year against films.year (±1).
 *   Mismatches are printed for review instead of written. Stops immediately
 *   on 403/429 (bot detection) — no evasion.
 * Phase 3 (report):    staleness baseline — films with a letterboxd_url but
 *   no letterboxd_enriched_at timestamp.
 *
 * Usage:
 *   dotenv -e .env.local -- npx tsx -r tsconfig-paths/register src/scripts/backfill-letterboxd-slugs.ts [--execute] [--skip-tmdb]
 */

import * as cheerio from "cheerio";
import { and, eq, isNull, isNotNull, like, sql } from "drizzle-orm";

import { db } from "@/db";
import { films } from "@/db/schema";
import { CHROME_USER_AGENT } from "@/scrapers/constants";

const RATE_LIMIT_MS = 500;
const MISMATCH_STOP_RATIO = 0.1; // >10% year mismatches signals a deeper TMDB-match problem

/** Extract the canonical slug from a slug-style Letterboxd film URL. */
export function extractSlugFromLetterboxdUrl(url: string): string | null {
  const match = url.match(/letterboxd\.com\/film\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function phase1SlugStyle(execute: boolean): Promise<void> {
  console.log("\n━━━ Phase 1: slug-style URLs (no network) ━━━");

  const rows = await db
    .select({ id: films.id, title: films.title, letterboxdUrl: films.letterboxdUrl })
    .from(films)
    .where(
      and(
        isNull(films.letterboxdSlug),
        like(films.letterboxdUrl, "%letterboxd.com/film/%"),
      ),
    );

  let planned = 0;
  let unparseable = 0;

  for (const row of rows) {
    const slug = extractSlugFromLetterboxdUrl(row.letterboxdUrl!);
    if (!slug) {
      unparseable++;
      console.log(`  ✗ Unparseable URL for "${row.title}": ${row.letterboxdUrl}`);
      continue;
    }

    planned++;
    if (execute) {
      await db
        .update(films)
        .set({ letterboxdSlug: slug, updatedAt: new Date() })
        .where(eq(films.id, row.id));
    }
  }

  console.log(
    `  ${execute ? "Wrote" : "Would write"} letterboxd_slug for ${planned} films` +
      ` (${unparseable} unparseable)${execute ? "" : " — dry run, pass --execute to apply"}`,
  );
}

async function phase2TmdbRedirects(execute: boolean): Promise<void> {
  console.log("\n━━━ Phase 2: /tmdb/{id} redirect resolution (network) ━━━");

  const rows = await db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      letterboxdUrl: films.letterboxdUrl,
    })
    .from(films)
    .where(
      and(
        isNull(films.letterboxdSlug),
        like(films.letterboxdUrl, "%letterboxd.com/tmdb/%"),
      ),
    );

  console.log(`  ${rows.length} films with /tmdb/-style URLs to resolve`);

  if (!execute) {
    console.log("  Dry run — no fetches performed. Sample:");
    for (const row of rows.slice(0, 10)) {
      console.log(`    • ${row.title} (${row.year ?? "?"}) → ${row.letterboxdUrl}`);
    }
    console.log("  Pass --execute (without --skip-tmdb) to resolve redirects.");
    return;
  }

  const headers = { "User-Agent": CHROME_USER_AGENT, Accept: "text/html" };
  let resolved = 0;
  let mismatched = 0;
  let failed = 0;
  let checked = 0;

  for (const row of rows) {
    checked++;
    try {
      const response = await fetch(row.letterboxdUrl!, { headers });

      // Bot detection — stop the backfill, report, do not add evasion.
      if (response.status === 403 || response.status === 429) {
        console.error(
          `\n  ⛔ Letterboxd returned ${response.status} — stopping backfill (bot detection). ` +
            `Resolved ${resolved}/${rows.length} before stopping.`,
        );
        return;
      }

      if (!response.ok) {
        failed++;
        console.log(`  ✗ ${row.title}: HTTP ${response.status} for ${row.letterboxdUrl}`);
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      const finalUrl = response.url || row.letterboxdUrl!;
      const slug = extractSlugFromLetterboxdUrl(finalUrl);
      if (!slug || slug === "tmdb") {
        failed++;
        console.log(`  ✗ ${row.title}: could not extract slug from ${finalUrl}`);
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      // Verify the page year against our film year (±1). The /tmdb/ redirect
      // is Letterboxd's own TMDB mapping, so a mismatch here means OUR TMDB
      // match (or year) is suspect — print for review instead of writing.
      const html = await response.text();
      const $ = cheerio.load(html);
      const ogTitle = $('meta[property="og:title"]').attr("content") || "";
      const yearMatch = ogTitle.match(/\((\d{4})\)$/);
      const pageYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

      if (row.year && pageYear && Math.abs(pageYear - row.year) > 1) {
        mismatched++;
        console.log(
          `  ⚠ REVIEW ${row.title}: our year ${row.year} vs Letterboxd "${ogTitle}" → ${finalUrl} (not written)`,
        );
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      await db
        .update(films)
        .set({
          letterboxdSlug: slug,
          letterboxdUrl: `https://letterboxd.com/film/${slug}/`,
          updatedAt: new Date(),
        })
        .where(eq(films.id, row.id));
      resolved++;

      await sleep(RATE_LIMIT_MS);
    } catch (error) {
      failed++;
      console.log(`  ✗ ${row.title}: fetch error ${error}`);
      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log(
    `\n  Resolved ${resolved}, year-mismatched (review) ${mismatched}, failed ${failed} of ${rows.length}`,
  );

  if (checked > 0 && mismatched / checked > MISMATCH_STOP_RATIO) {
    console.error(
      `  ⛔ ${mismatched}/${checked} (${((mismatched / checked) * 100).toFixed(1)}%) year mismatches ` +
        `exceeds ${MISMATCH_STOP_RATIO * 100}% — signals a deeper TMDB-match problem. ` +
        `Coordinate with plan 005/008 before re-running.`,
    );
  }
}

async function phase3StalenessReport(): Promise<void> {
  console.log("\n━━━ Phase 3: staleness baseline ━━━");

  const [stale] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(films)
    .where(and(isNotNull(films.letterboxdUrl), isNull(films.letterboxdEnrichedAt)));

  const [missingSlug] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(films)
    .where(and(isNotNull(films.letterboxdUrl), isNull(films.letterboxdSlug)));

  console.log(
    `  Films with letterboxd_url but no letterboxd_enriched_at: ${stale.count}` +
      ` (staleness baseline — these predate enrichment timestamping)`,
  );
  console.log(`  Films with letterboxd_url but no letterboxd_slug: ${missingSlug.count}`);
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const skipTmdb = process.argv.includes("--skip-tmdb");

  console.log("🎬 Letterboxd slug backfill");
  console.log(`Mode: ${execute ? "EXECUTE" : "DRY RUN (default)"}${skipTmdb ? " | skipping /tmdb/ phase" : ""}`);

  await phase1SlugStyle(execute);

  if (skipTmdb) {
    console.log("\n━━━ Phase 2: skipped (--skip-tmdb) ━━━");
  } else {
    await phase2TmdbRedirects(execute);
  }

  await phase3StalenessReport();
}

// Run if called directly (not when imported as a module)
const isDirectRun =
  process.argv[1]?.endsWith("backfill-letterboxd-slugs.ts") ||
  process.argv[1]?.endsWith("backfill-letterboxd-slugs.js");

if (isDirectRun) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
