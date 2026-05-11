/**
 * Iterative 100-film spot-check + auto-fix loop.
 *
 * Sampling: the 100 films with the soonest upcoming screening (what users
 * see first on the calendar). Each iteration:
 *   1. Scan all 100 for HIGH/MEDIUM/LOW data-quality issues.
 *   2. Apply every safe auto-fix.
 *   3. Re-sample (the soonest 100 may have shifted as time passes; in a
 *      single run within seconds the set is stable).
 *   4. Stop when no fixes were applied in the last iteration OR after
 *      MAX_ITERATIONS to bound runtime.
 *
 * Safe auto-fixes:
 *   - is_repertory flip when stored year < (current_year - 1) and false
 *   - year UPDATE when TMDB ID is set and TMDB release year disagrees
 *   - runtime UPDATE when TMDB ID is set and runtime differs by ≥5min
 *   - Re-enrich missing posterUrl / synopsis / directors / genres when
 *     TMDB ID is set
 *   - Strip programme-strand title prefixes (DocHouse:, LONDON PREMIERE,
 *     etc.). The dedup pass picks up resulting canonical-name films on its
 *     next cycle.
 *
 * Skipped (manual review):
 *   - Wrong-TMDB linkage (title-vs-TMDB mismatch) — too risky to swap IDs
 *     without manual verification.
 *   - year=2026 with no TMDB ID — needs TMDB search + match; the rolling
 *     patrol does this with its blocklist guardrails.
 *
 * Usage:
 *   npx tsx -r tsconfig-paths/register --env-file=.env.local scripts/spot-check-and-fix.ts            (report only)
 *   npx tsx -r tsconfig-paths/register --env-file=.env.local scripts/spot-check-and-fix.ts --apply    (auto-fix)
 */

import { db } from "@/db";
import { films } from "@/db/schema/films";
import { screenings } from "@/db/schema/screenings";
import { cinemas } from "@/db/schema/cinemas";
import { sql, eq, gte, and, inArray } from "drizzle-orm";
import { getTMDBClient } from "@/lib/tmdb";

const SAMPLE_SIZE = 100;
const MAX_ITERATIONS = 10;
const CURRENT_YEAR = new Date().getFullYear();

const PROGRAMME_STRAND_PREFIXES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^DocHouse:\s+/i, replacement: "" },
  { pattern: /^Funeral Parade presents\s+["']?/i, replacement: "" },
  { pattern: /^LOCO presents:\s+/i, replacement: "" },
  { pattern: /^Funday:\s+/i, replacement: "" },
  { pattern: /^Lost Reels:\s+/i, replacement: "" },
  { pattern: /^LAFS PRESENTS:\s+/i, replacement: "" },
  { pattern: /^UK PREMIERE\s+/i, replacement: "" },
  { pattern: /^LONDON PREMIERE\s+/i, replacement: "" },
  { pattern: /^Crafty Movie Night\s*[-–]\s*/i, replacement: "" },
  { pattern: /^Journey Through Irish Cinema:\s+/i, replacement: "" },
  // "Film Club: Jewish Culture Month: Shiva Baby" → "Shiva Baby"
  { pattern: /^Film Club:[^:]+:\s+/i, replacement: "" },
];

interface FilmRow {
  id: string;
  title: string;
  year: number | null;
  runtime: number | null;
  tmdbId: number | null;
  posterUrl: string | null;
  synopsis: string | null;
  directors: unknown;
  genres: unknown;
  isRepertory: boolean;
}

interface IssueCounts {
  high: number;
  medium: number;
  low: number;
  total: number;
  byField: Map<string, number>;
}

async function sample100(): Promise<FilmRow[]> {
  const rows = await db.execute(sql`
    WITH first_screenings AS (
      SELECT s.film_id, MIN(s.datetime) AS next_screening
      FROM screenings s
      WHERE s.datetime >= NOW()
      GROUP BY s.film_id
    )
    SELECT
      f.id, f.title, f.year, f.runtime, f.tmdb_id AS "tmdbId",
      f.poster_url AS "posterUrl", f.synopsis,
      f.directors, f.genres, f.is_repertory AS "isRepertory"
    FROM ${films} f
    INNER JOIN first_screenings fs ON fs.film_id = f.id
    ORDER BY fs.next_screening ASC
    LIMIT ${SAMPLE_SIZE};
  `);
  return rows as unknown as FilmRow[];
}

function arrayLen(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

interface FixRecord {
  filmId: string;
  title: string;
  fixType: string;
  detail: string;
}

async function runIteration(iteration: number, apply: boolean): Promise<{ issues: IssueCounts; fixes: FixRecord[] }> {
  const sample = await sample100();
  console.log(`\n--- Iteration ${iteration}: scanning ${sample.length} films ---`);

  const counts: IssueCounts = { high: 0, medium: 0, low: 0, total: 0, byField: new Map() };
  const fixes: FixRecord[] = [];
  const tmdb = getTMDBClient();

  for (const f of sample) {
    // 1. Programme-strand prefix → strip
    for (const { pattern, replacement } of PROGRAMME_STRAND_PREFIXES) {
      if (pattern.test(f.title)) {
        const newTitle = f.title.replace(pattern, replacement).trim();
        if (newTitle.length > 0 && newTitle !== f.title) {
          counts.high++;
          counts.total++;
          counts.byField.set("title", (counts.byField.get("title") ?? 0) + 1);
          if (apply) {
            await db.update(films).set({ title: newTitle, updatedAt: new Date() }).where(eq(films.id, f.id));
            fixes.push({ filmId: f.id, title: f.title, fixType: "strip-prefix", detail: `"${f.title}" → "${newTitle}"` });
          }
        }
        break;
      }
    }

    // 2. is_repertory flip: year < (currentYear - 1) and currently false
    if (f.year !== null && f.year < CURRENT_YEAR - 1 && !f.isRepertory) {
      counts.low++;
      counts.total++;
      counts.byField.set("isRepertory", (counts.byField.get("isRepertory") ?? 0) + 1);
      if (apply) {
        await db.update(films).set({ isRepertory: true, updatedAt: new Date() }).where(eq(films.id, f.id));
        fixes.push({ filmId: f.id, title: f.title, fixType: "is-repertory", detail: `${f.year} → is_repertory=true` });
      }
    }

    // 3. TMDB cross-check (only if TMDB ID set)
    if (f.tmdbId) {
      let tmdbData;
      try {
        tmdbData = await tmdb.getFullFilmData(f.tmdbId);
      } catch {
        // TMDB fetch failed (404 typically) — flag as low, skip auto-fix
        counts.low++;
        counts.total++;
        counts.byField.set("tmdbFetch", (counts.byField.get("tmdbFetch") ?? 0) + 1);
        continue;
      }
      const tmdbYear = tmdbData.details.release_date ? parseInt(tmdbData.details.release_date.slice(0, 4), 10) : null;
      const tmdbRuntime = tmdbData.details.runtime;
      const updates: Partial<typeof films.$inferInsert> = {};

      // 3a. Year mismatch
      if (tmdbYear !== null && (f.year === null || Math.abs(f.year - tmdbYear) >= 1)) {
        counts[f.year === 2026 ? "high" : "medium"]++;
        counts.total++;
        counts.byField.set("year", (counts.byField.get("year") ?? 0) + 1);
        // Title sanity: only update year if the TMDB title strongly matches the DB title.
        // Guards against fixing the year of a wrong-TMDB linkage (would compound the bug).
        // "Strong": substring overlap ≥ 80% of the shorter title — rejects "The Bird"
        // matching "The Birdcage" but still accepts "Boy and the World" ↔ "Boy & the World".
        const dbN = f.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        const tmdbTitleN = (tmdbData.details.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const tmdbOrigN = (tmdbData.details.original_title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const strongMatch = (a: string, b: string): boolean => {
          if (!a || !b) return false;
          if (a === b) return true;
          const short = a.length <= b.length ? a : b;
          const long = a.length <= b.length ? b : a;
          if (!long.includes(short)) return false;
          return short.length / long.length >= 0.8;
        };
        const looksLikeMatch = strongMatch(dbN, tmdbTitleN) || strongMatch(dbN, tmdbOrigN);
        if (looksLikeMatch) updates.year = tmdbYear;
      }

      // 3b. Runtime mismatch (≥5min)
      if (f.runtime !== null && tmdbRuntime && Math.abs(f.runtime - tmdbRuntime) >= 5) {
        counts.low++;
        counts.total++;
        counts.byField.set("runtime", (counts.byField.get("runtime") ?? 0) + 1);
        updates.runtime = tmdbRuntime;
      }

      // 3c. Missing posterUrl
      if (!f.posterUrl && tmdbData.details.poster_path) {
        counts.medium++;
        counts.total++;
        counts.byField.set("posterUrl", (counts.byField.get("posterUrl") ?? 0) + 1);
        updates.posterUrl = `https://image.tmdb.org/t/p/w500${tmdbData.details.poster_path}`;
      }

      // 3d. Missing synopsis
      if ((!f.synopsis || f.synopsis.length < 30) && tmdbData.details.overview) {
        counts.medium++;
        counts.total++;
        counts.byField.set("synopsis", (counts.byField.get("synopsis") ?? 0) + 1);
        updates.synopsis = tmdbData.details.overview;
      }

      // 3e. Missing directors
      if (arrayLen(f.directors) === 0 && tmdbData.directors.length > 0) {
        counts.medium++;
        counts.total++;
        counts.byField.set("directors", (counts.byField.get("directors") ?? 0) + 1);
        updates.directors = tmdbData.directors;
      }

      // 3f. Missing genres
      if (arrayLen(f.genres) === 0 && tmdbData.details.genres && tmdbData.details.genres.length > 0) {
        counts.low++;
        counts.total++;
        counts.byField.set("genres", (counts.byField.get("genres") ?? 0) + 1);
        updates.genres = tmdbData.details.genres.map((g: { name: string }) => g.name);
      }

      if (apply && Object.keys(updates).length > 0) {
        await db.update(films).set({ ...updates, updatedAt: new Date() }).where(eq(films.id, f.id));
        fixes.push({ filmId: f.id, title: f.title, fixType: "tmdb-enrich", detail: Object.keys(updates).join(",") });
      }
    } else {
      // 4. No TMDB ID — flag year=current_year as a heuristic for screening-year contamination
      if (f.year === CURRENT_YEAR) {
        counts.medium++;
        counts.total++;
        counts.byField.set("year-no-tmdb", (counts.byField.get("year-no-tmdb") ?? 0) + 1);
      }
    }

    // 5. BST screening check (any screening in 00:00-09:59 London)
    const odd = await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM screenings
      WHERE film_id = ${f.id}
        AND datetime >= NOW()
        AND EXTRACT(HOUR FROM datetime AT TIME ZONE 'Europe/London') < 10
    `);
    const o = odd as unknown as Array<{ n: number }>;
    if (o[0]?.n > 0) {
      counts.high++;
      counts.total++;
      counts.byField.set("screening.datetime", (counts.byField.get("screening.datetime") ?? 0) + 1);
    }
  }

  console.log(`  Issues: ${counts.total} (HIGH=${counts.high}, MED=${counts.medium}, LOW=${counts.low})`);
  console.log(`  Fixes applied: ${fixes.length}`);
  for (const [field, n] of [...counts.byField.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${field.padEnd(24)} ${n}`);
  }
  return { issues: counts, fixes };
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\n=== Spot-check loop (${apply ? "APPLY" : "REPORT-ONLY"}) ===`);

  let iter = 1;
  let totalFixes = 0;
  const allFixes: FixRecord[] = [];
  let lastIssueTotal = -1;

  while (iter <= MAX_ITERATIONS) {
    const { issues, fixes } = await runIteration(iter, apply);
    totalFixes += fixes.length;
    allFixes.push(...fixes);

    if (!apply) {
      console.log(`\n[REPORT-ONLY] Re-run with --apply to fix issues.`);
      break;
    }
    if (fixes.length === 0) {
      console.log(`\nConverged at iteration ${iter} (0 fixes applied). Remaining ${issues.total} issues are manual-review.`);
      break;
    }
    if (issues.total === lastIssueTotal) {
      console.log(`\nNo new progress at iteration ${iter}. Stopping.`);
      break;
    }
    lastIssueTotal = issues.total;
    iter++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Iterations: ${iter}`);
  console.log(`  Total fixes applied: ${totalFixes}`);
  if (allFixes.length > 0 && allFixes.length <= 50) {
    console.log(`  Fix log:`);
    for (const f of allFixes) console.log(`    [${f.fixType}] ${f.title} → ${f.detail}`);
  } else if (allFixes.length > 50) {
    console.log(`  Fix log (first 30):`);
    for (const f of allFixes.slice(0, 30)) console.log(`    [${f.fixType}] ${f.title} → ${f.detail}`);
    console.log(`    ... and ${allFixes.length - 30} more`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
