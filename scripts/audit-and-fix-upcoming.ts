/**
 * Comprehensive Upcoming Screenings Data Quality Audit & Fix
 *
 * Multi-pass orchestrator that chains existing scripts in the right order,
 * adds non-film detection and dodgy entry flagging, and produces a
 * before/after comparison report.
 *
 * Passes:
 *   1. Pre-flight audit (baseline metrics)
 *   2. Identify & reclassify non-film content
 *   3. Duplicate detection & merge (shells out to cleanup-duplicate-films)
 *   4. Title cleanup + TMDB matching + metadata fill + Letterboxd (shells out to cleanup:upcoming)
 *   5. Fallback enrichment (shells out to agents:fallback-enrich)
 *   6. Poster audit & fix (shells out to poster:audit)
 *   7. Dodgy entry detection & flagging
 *   8. Final audit (comparison report)
 *
 * Usage:
 *   npx dotenv -e .env.local -- npx tsx scripts/audit-and-fix-upcoming.ts
 *   npx dotenv -e .env.local -- npx tsx scripts/audit-and-fix-upcoming.ts --dry-run
 *   npx dotenv -e .env.local -- npx tsx scripts/audit-and-fix-upcoming.ts --pass 2
 *   npx dotenv -e .env.local -- npx tsx scripts/audit-and-fix-upcoming.ts --skip 5,6
 */

import { db } from "../src/db";
import { films, screenings } from "../src/db/schema";
import { eq, isNull, gte, and, count } from "drizzle-orm";
import { execFileSync } from "child_process";
import type { AuditSummary } from "../src/scripts/audit-film-data";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const passIndex = args.indexOf("--pass");
const PASS_FILTER = passIndex !== -1 ? parseInt(args[passIndex + 1], 10) : null;
const skipIndex = args.indexOf("--skip");
const SKIP_PASSES = skipIndex !== -1
  ? new Set(args[skipIndex + 1].split(",").map(Number))
  : new Set<number>();

// ---------------------------------------------------------------------------
// Non-film detection patterns (Pass 2)
// ---------------------------------------------------------------------------

/** Patterns that indicate live broadcast content */
const LIVE_BROADCAST_PATTERNS = [
  /\bnt\s+live\b/i,
  /\bmet\s+opera\b/i,
  /\broh\s*(:|live)\b/i,
  /\broyal\s+opera\s+house\b/i,
  /\broyal\s+ballet\b/i,
  /\bbolshoi\s+ballet\b/i,
  /\brbo\s+(cinema|encore|live)\b/i,
  /\bglyndebourne\b/i,
  /\blive\s+from\s+(the\s+)?(met|royal|national|covent)/i,
  /\bopera\s+live\b/i,
  /\bballet\s+live\b/i,
];

/** Patterns that indicate concert/music content */
const CONCERT_PATTERNS = [
  /\blive\s+in\s+concert\b/i,
  /\balbum\s+listening\b/i,
  /\bdj\s+set\b/i,
  /\blive\s+music\s+performance\b/i,
  /\bsymphony\s+screening\b/i,
];

/** Patterns that indicate non-viewable events */
const EVENT_PATTERNS = [
  /\bquiz\s+night\b/i,
  /\bpub\s+quiz\b/i,
  /\bworkshop\b/i,
  /\bmasterclass\b/i,
  /\bfilm\s+reading\s+group\b/i,
  /\bpodcast\s+live\b/i,
  /\bbook\s+launch\b/i,
  /\bpanel\s+discussion\b/i,
  /\bnetworking\s+event\b/i,
  /\bcommunity\s+meeting\b/i,
  /\bfundraiser\b/i,
  /\bcharity\s+event\b/i,
  /\bopen\s+mic\b/i,
  /\bstand[\s-]up\s+comedy\b/i,
  /\bcomedy\s+night\b/i,
  /\bkaraoke\b/i,
  /\bcraft\s+session\b/i,
  /\btasting\s+(event|evening|session)\b/i,
];

/** Patterns for kids activities that aren't actual films */
const KIDS_NON_FILM_PATTERNS = [
  /^toddler\s+time$/i,           // "Toddler Time" alone (no film title)
  /^baby\s+cinema$/i,            // "Baby Cinema" alone
  /\bplay\s+&?\s*stay\b/i,
  /\bsensory\s+session\b/i,
];

type ContentType = "film" | "concert" | "live_broadcast" | "event";

/**
 * Classify a film title as non-film content.
 * Returns null if it looks like a real film.
 */
function classifyNonFilm(title: string): ContentType | null {
  for (const pattern of LIVE_BROADCAST_PATTERNS) {
    if (pattern.test(title)) return "live_broadcast";
  }
  for (const pattern of CONCERT_PATTERNS) {
    if (pattern.test(title)) return "concert";
  }
  for (const pattern of EVENT_PATTERNS) {
    if (pattern.test(title)) return "event";
  }
  for (const pattern of KIDS_NON_FILM_PATTERNS) {
    if (pattern.test(title)) return "event";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dodgy entry type
// ---------------------------------------------------------------------------

interface DodgyEntry {
  id: string;
  title: string;
  year: number | null;
  tmdbId: number | null;
  posterUrl: string | null;
  synopsis: string | null;
  upcomingCount: number;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shouldRun(pass: number): boolean {
  if (PASS_FILTER !== null) return PASS_FILTER === pass;
  if (SKIP_PASSES.has(pass)) return false;
  return true;
}

/**
 * Shell out to an npm script safely using execFileSync (no shell injection).
 * All arguments are passed as array elements, never interpolated into a shell string.
 */
function runNpmScript(script: string, extraArgs: string[] = []): void {
  const scriptArgs = ["run", script, "--"];
  if (DRY_RUN) scriptArgs.push("--dry-run");
  scriptArgs.push(...extraArgs);

  console.log(`\n  $ npm ${scriptArgs.join(" ")}\n`);
  try {
    execFileSync("npm", scriptArgs, { stdio: "inherit", cwd: process.cwd() });
  } catch {
    console.warn(`  [Warning] ${script} exited with non-zero status`);
  }
}

function banner(pass: number, title: string): void {
  console.log("\n" + "=".repeat(70));
  console.log(`  PASS ${pass}: ${title}`);
  console.log("=".repeat(70) + "\n");
}

// ---------------------------------------------------------------------------
// Pass 1: Pre-flight Audit (baseline)
// ---------------------------------------------------------------------------

async function pass1PreFlight(): Promise<AuditSummary> {
  banner(1, "Pre-Flight Audit (Baseline)");

  const { auditFilmData } = await import("../src/scripts/audit-film-data");
  const result = await auditFilmData(true); // upcoming-only

  console.log(`  Total films:                  ${result.summary.totalFilms}`);
  console.log(`  Films with upcoming:          ${result.summary.filmsWithUpcoming}`);
  console.log(`  Missing TMDB ID (upcoming):   ${result.summary.missingTmdbIdUpcoming}`);
  console.log(`  Missing poster (upcoming):    ${result.summary.missingPosterUpcoming}`);
  console.log(`  Missing synopsis (upcoming):  ${result.summary.missingSynopsisUpcoming}`);
  console.log(`  Missing Letterboxd (upcoming): ${result.summary.missingLetterboxdRatingUpcoming}`);
  console.log(`  Missing year:                 ${result.summary.missingYear}`);
  console.log(`  Missing directors:            ${result.summary.missingDirectors}`);
  console.log(`  Missing genres:               ${result.summary.missingGenres}`);
  console.log(`  Missing runtime:              ${result.summary.missingRuntime}`);

  return result.summary;
}

// ---------------------------------------------------------------------------
// Pass 2: Identify & Reclassify Non-Film Content
// ---------------------------------------------------------------------------

async function pass2NonFilmDetection(): Promise<{ reclassified: number; deleted: number }> {
  banner(2, "Identify & Reclassify Non-Film Content");

  const now = new Date();

  // Get films with upcoming screenings: contentType='film' and no TMDB match
  // Films WITH a TMDB match are very likely real films, so skip those
  const candidates = await db
    .selectDistinct({
      id: films.id,
      title: films.title,
      tmdbId: films.tmdbId,
      contentType: films.contentType,
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(
      and(
        eq(films.contentType, "film"),
        isNull(films.tmdbId),
        gte(screenings.datetime, now)
      )
    );

  console.log(`  Found ${candidates.length} unmatched films with upcoming screenings\n`);

  let reclassified = 0;
  let deleted = 0;

  for (const film of candidates) {
    const newType = classifyNonFilm(film.title);
    if (!newType) continue;

    const isNonViewable = newType === "event";

    if (isNonViewable) {
      console.log(`  [DELETE] "${film.title}" -> ${newType}`);
      if (!DRY_RUN) {
        await db.delete(screenings).where(eq(screenings.filmId, film.id));
        await db.delete(films).where(eq(films.id, film.id));
      }
      deleted++;
    } else {
      console.log(`  [RECLASSIFY] "${film.title}" -> ${newType}`);
      if (!DRY_RUN) {
        await db
          .update(films)
          .set({ contentType: newType, updatedAt: new Date() })
          .where(eq(films.id, film.id));
      }
      reclassified++;
    }
  }

  console.log(`\n  Reclassified: ${reclassified}`);
  console.log(`  Deleted:      ${deleted}`);
  if (DRY_RUN) console.log("  (dry run - no changes written)");

  return { reclassified, deleted };
}

// ---------------------------------------------------------------------------
// Pass 3: Duplicate Detection & Merge
// ---------------------------------------------------------------------------

function pass3DuplicateCleanup(): void {
  banner(3, "Duplicate Detection & Merge");

  const scriptArgs = ["tsx", "scripts/cleanup-duplicate-films.ts"];
  if (!DRY_RUN) scriptArgs.push("--execute");

  console.log(`  $ npx dotenv -e .env.local -- npx ${scriptArgs.join(" ")}\n`);
  try {
    execFileSync(
      "npx",
      ["dotenv", "-e", ".env.local", "--", "npx", ...scriptArgs],
      { stdio: "inherit", cwd: process.cwd() }
    );
  } catch {
    console.warn("  [Warning] cleanup-duplicate-films exited with non-zero status");
  }
}

// ---------------------------------------------------------------------------
// Pass 4: Title Cleanup + TMDB + Metadata + Letterboxd
// ---------------------------------------------------------------------------

function pass4CleanupUpcoming(): void {
  banner(4, "Title Cleanup + TMDB Matching + Metadata Fill + Letterboxd");
  runNpmScript("cleanup:upcoming");
}

// ---------------------------------------------------------------------------
// Pass 5: Fallback Enrichment
// ---------------------------------------------------------------------------

function pass5FallbackEnrichment(): void {
  banner(5, "Fallback Enrichment for Remaining Unmatched Films");

  if (DRY_RUN) {
    console.log("  [dry-run] Would run: npm run agents:fallback-enrich -- --dry");
    return;
  }

  runNpmScript("agents:fallback-enrich", ["100"]);
}

// ---------------------------------------------------------------------------
// Pass 6: Poster Audit & Fix
// ---------------------------------------------------------------------------

function pass6PosterAudit(): void {
  banner(6, "Poster Audit & Fix");
  runNpmScript("poster:audit", ["--upcoming-only"]);
}

// ---------------------------------------------------------------------------
// Pass 7: Dodgy Entry Detection
// ---------------------------------------------------------------------------

async function pass7DodgyDetection(): Promise<DodgyEntry[]> {
  banner(7, "Dodgy Entry Detection & Flagging");

  const now = new Date();

  // Get all films with upcoming screenings
  const upcomingFilms = await db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      tmdbId: films.tmdbId,
      posterUrl: films.posterUrl,
      synopsis: films.synopsis,
      runtime: films.runtime,
      contentType: films.contentType,
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(
      and(
        eq(films.contentType, "film"),
        gte(screenings.datetime, now)
      )
    );

  // Deduplicate (inner join produces one row per screening)
  const filmMap = new Map<string, (typeof upcomingFilms)[0]>();
  for (const f of upcomingFilms) {
    filmMap.set(f.id, f);
  }
  const uniqueFilms = [...filmMap.values()];

  // Count upcoming screenings per film
  const upcomingCounts = await db
    .select({
      filmId: screenings.filmId,
      count: count(),
    })
    .from(screenings)
    .where(gte(screenings.datetime, now))
    .groupBy(screenings.filmId);

  const countMap = new Map(upcomingCounts.map((r) => [r.filmId, r.count]));

  const dodgy: DodgyEntry[] = [];

  for (const film of uniqueFilms) {
    const reasons: string[] = [];

    // Extremely long titles (>80 chars) - likely descriptions or event names
    if (film.title.length > 80) {
      reasons.push(`title too long (${film.title.length} chars)`);
    }

    // ALL CAPS titles with no TMDB match - likely events
    if (film.title === film.title.toUpperCase() && film.title.length > 3 && !film.tmdbId) {
      reasons.push("ALL CAPS, no TMDB match");
    }

    // Year outliers
    if (film.year !== null && (film.year > 2027 || film.year < 1895)) {
      reasons.push(`suspicious year: ${film.year}`);
    }

    // Runtime outliers
    if (film.runtime !== null && (film.runtime === 0 || film.runtime > 600)) {
      reasons.push(`suspicious runtime: ${film.runtime}min`);
    }

    // Films with no TMDB, no poster, no synopsis after all enrichment
    if (!film.tmdbId && !film.posterUrl && !film.synopsis) {
      reasons.push("no TMDB, no poster, no synopsis");
    }

    if (reasons.length > 0) {
      dodgy.push({
        id: film.id,
        title: film.title,
        year: film.year,
        tmdbId: film.tmdbId,
        posterUrl: film.posterUrl,
        synopsis: film.synopsis,
        upcomingCount: countMap.get(film.id) ?? 0,
        reasons,
      });
    }
  }

  // Sort by upcoming screening count descending - prioritize visible entries
  dodgy.sort((a, b) => b.upcomingCount - a.upcomingCount);

  if (dodgy.length === 0) {
    console.log("  No dodgy entries found!");
  } else {
    console.log(`  Found ${dodgy.length} dodgy entries:\n`);
    console.log(
      "  " +
        "Title".padEnd(50) +
        "Year".padEnd(6) +
        "Up".padEnd(5) +
        "Reasons"
    );
    console.log("  " + "-".repeat(100));

    for (const entry of dodgy.slice(0, 40)) {
      const title =
        entry.title.length > 47
          ? entry.title.slice(0, 47) + "..."
          : entry.title;
      console.log(
        "  " +
          title.padEnd(50) +
          (entry.year?.toString() ?? "?").padEnd(6) +
          entry.upcomingCount.toString().padEnd(5) +
          entry.reasons.join("; ")
      );
    }

    if (dodgy.length > 40) {
      console.log(`\n  ... and ${dodgy.length - 40} more dodgy entries`);
    }
  }

  return dodgy;
}

// ---------------------------------------------------------------------------
// Pass 8: Final Audit (comparison)
// ---------------------------------------------------------------------------

async function pass8FinalAudit(baseline: AuditSummary | null): Promise<void> {
  banner(8, "Final Audit & Comparison");

  const { auditFilmData } = await import("../src/scripts/audit-film-data");
  const result = await auditFilmData(true);
  const after = result.summary;

  if (!baseline) {
    console.log("  (No baseline - showing current metrics only)\n");
    console.log(`  Films with upcoming:          ${after.filmsWithUpcoming}`);
    console.log(`  Missing TMDB ID (upcoming):   ${after.missingTmdbIdUpcoming}`);
    console.log(`  Missing poster (upcoming):    ${after.missingPosterUpcoming}`);
    console.log(`  Missing synopsis (upcoming):  ${after.missingSynopsisUpcoming}`);
    console.log(`  Missing Letterboxd (upcoming): ${after.missingLetterboxdRatingUpcoming}`);
    return;
  }

  // Before/After comparison
  type MetricKey = keyof AuditSummary;
  const metrics: Array<{ label: string; key: MetricKey }> = [
    { label: "Total films", key: "totalFilms" },
    { label: "Films w/ upcoming", key: "filmsWithUpcoming" },
    { label: "Missing TMDB (upcoming)", key: "missingTmdbIdUpcoming" },
    { label: "Missing poster (upcoming)", key: "missingPosterUpcoming" },
    { label: "Missing synopsis (upcoming)", key: "missingSynopsisUpcoming" },
    { label: "Missing Letterboxd (upcoming)", key: "missingLetterboxdRatingUpcoming" },
    { label: "Missing year (all)", key: "missingYear" },
    { label: "Missing directors (all)", key: "missingDirectors" },
    { label: "Missing genres (all)", key: "missingGenres" },
    { label: "Missing runtime (all)", key: "missingRuntime" },
  ];

  console.log(
    "  " +
      "Metric".padEnd(35) +
      "Before".padEnd(10) +
      "After".padEnd(10) +
      "Delta"
  );
  console.log("  " + "-".repeat(65));

  for (const { label, key } of metrics) {
    const before = baseline[key] as number;
    const current = after[key] as number;
    const delta = current - before;
    const deltaStr = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "0";
    const indicator = delta < 0 ? " (improved)" : delta > 0 ? " (worse)" : "";

    console.log(
      "  " +
        label.padEnd(35) +
        before.toString().padEnd(10) +
        current.toString().padEnd(10) +
        deltaStr +
        indicator
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n" + "#".repeat(70));
  console.log("#  Comprehensive Upcoming Screenings Data Quality Audit & Fix");
  if (DRY_RUN) {
    console.log("#  MODE: DRY RUN (no database changes)");
  } else {
    console.log("#  MODE: LIVE (will modify database)");
  }
  console.log("#".repeat(70));

  let baseline: AuditSummary | null = null;

  // Pass 1: Baseline
  if (shouldRun(1)) {
    try {
      baseline = await pass1PreFlight();
    } catch (error) {
      console.error("  [Error] Pre-flight audit failed:", error);
    }
  }

  // Pass 2: Non-film detection
  if (shouldRun(2)) {
    try {
      await pass2NonFilmDetection();
    } catch (error) {
      console.error("  [Error] Non-film detection failed:", error);
    }
  }

  // Pass 3: Duplicate cleanup
  if (shouldRun(3)) {
    try {
      pass3DuplicateCleanup();
    } catch (error) {
      console.error("  [Error] Duplicate cleanup failed:", error);
    }
  }

  // Pass 4: Title cleanup + TMDB + metadata + Letterboxd
  if (shouldRun(4)) {
    try {
      pass4CleanupUpcoming();
    } catch (error) {
      console.error("  [Error] Cleanup upcoming failed:", error);
    }
  }

  // Pass 5: Fallback enrichment
  if (shouldRun(5)) {
    try {
      pass5FallbackEnrichment();
    } catch (error) {
      console.error("  [Error] Fallback enrichment failed:", error);
    }
  }

  // Pass 6: Poster audit
  if (shouldRun(6)) {
    try {
      pass6PosterAudit();
    } catch (error) {
      console.error("  [Error] Poster audit failed:", error);
    }
  }

  // Pass 7: Dodgy entry detection
  if (shouldRun(7)) {
    try {
      await pass7DodgyDetection();
    } catch (error) {
      console.error("  [Error] Dodgy detection failed:", error);
    }
  }

  // Pass 8: Final audit (comparison)
  if (shouldRun(8)) {
    try {
      await pass8FinalAudit(baseline);
    } catch (error) {
      console.error("  [Error] Final audit failed:", error);
    }
  }

  console.log("\n" + "#".repeat(70));
  console.log("#  Audit & Fix Complete");
  console.log("#".repeat(70) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
