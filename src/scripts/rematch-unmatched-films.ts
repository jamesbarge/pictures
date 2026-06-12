/**
 * Re-match sweep for unmatched films (plan 008, step 3).
 *
 * 306/993 upcoming films have no tmdb_id and nothing ever retries them — the
 * pipeline only attempts a match at first sight of a title. This sweep
 * re-runs TMDB matching for every film that:
 *   - has tmdb_id IS NULL
 *   - has content_type = 'film'
 *   - has at least one upcoming screening
 *
 * For each film it cleans the title (fixture-driven cleaner from step 1,
 * including decoration suffixes and (YYYY) year-hint capture), skips
 * suspected non-films (flagged for review, never auto-reclassified), and
 * runs the plan-005 matcher (year discipline, 0.6 confidence floor,
 * blocklist filtering all built in). Outcomes:
 *
 *   UPDATE  — no existing film row has the matched tmdb_id: update the row
 *             in place with full TMDB data + audit trail
 *             (match_strategy='rematch-sweep') + letterboxd_url=/tmdb/{id}.
 *   MERGE   — another film row already owns the tmdb_id: repoint this row's
 *             screenings/season_films/user_film_statuses to it and delete
 *             the now-empty row (cleanup-duplicate-films repoint logic, in
 *             one transaction, with a repoint-before-delete verification).
 *   SUSPECTED_NON_FILM — title matches the audit non-film patterns; flagged
 *             only, left untouched.
 *   NO_MATCH — matcher returned nothing above the confidence floor.
 *
 * Usage:
 *   npm run rematch:unmatched                      # dry run (default)
 *   npm run rematch:unmatched -- --execute         # apply changes
 *   npm run rematch:unmatched -- --limit 20        # cap processed films
 */

import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { matchFilmToTMDB, getTMDBClient, isRepertoryFilm, getDecade } from "@/lib/tmdb";
import type { TMDBSearchResult } from "@/lib/tmdb/types";
import { NON_FILM_PATTERNS, LIVE_BROADCAST_KEYWORDS } from "@/lib/title-patterns";
import {
  cleanFilmTitleWithMetadata,
  getKnownNonFilmType,
} from "@/scrapers/utils/film-title-cleaner";
import { sanitizeDirectors, sanitizeYear } from "@/scrapers/utils/film-write-guards";

const DRY_RUN = !process.argv.includes("--execute");

/** TMDB rate limit: ~3 req/s. One film costs 1-3 TMDB calls. */
const RATE_LIMIT_MS = 350;
/** Backoff schedule when TMDB answers 429 — do not hammer (plan STOP condition). */
const RATE_LIMIT_BACKOFF_MS = [2_000, 5_000, 15_000];
/** Plan STOP condition: >250 UPDATEs in one run is suspiciously high. */
const MAX_EXECUTE_UPDATES = 250;

function parseLimit(argv: string[]): number | undefined {
  const idx = argv.indexOf("--limit");
  if (idx === -1) return undefined;
  const value = parseInt(argv[idx + 1] ?? "", 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--limit requires a positive integer, got "${argv[idx + 1]}"`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Year discipline (plan 005): only accept a year hint that is strictly before
 * the current year and within sane bounds. Current/future years are
 * indistinguishable from screening-year pollution (and from re-release years
 * like "AKIRA (2026 Re-release)") — a wrong current-year hint SELECTS junk
 * stubs via the exact-year bonus, while a dropped true hint merely costs a
 * bonus.
 */
export function sanitizeYearHint(
  year: number | null | undefined,
  currentYear = new Date().getFullYear(),
): number | undefined {
  if (year && year >= 1900 && year < currentYear) return year;
  return undefined;
}

/**
 * Compose the year hint from the film row and the title-extracted year.
 * Each candidate is sanitized INDIVIDUALLY: a polluted `film.year` (e.g. a
 * screening year written before the write guards landed) must not shadow a
 * valid year extracted from the title — "Suspiria (1977)" with row year 2026
 * should hint 1977, not nothing. (Code-review blocker fix.)
 */
export function resolveYearHint(
  filmYear: number | null | undefined,
  extractedYear: number | undefined,
  currentYear = new Date().getFullYear(),
): number | undefined {
  return (
    sanitizeYearHint(filmYear, currentYear) ?? sanitizeYearHint(extractedYear, currentYear)
  );
}

/**
 * Suspected non-film check — same signals the audit orchestrator uses
 * (NON_FILM_PATTERNS + live-broadcast keywords + patrol learnings). Flag
 * only: the sweep never auto-reclassifies content_type (out of scope per
 * plan 008).
 */
export function isSuspectedNonFilm(rawTitle: string, cleanedTitle: string): string | null {
  for (const title of [cleanedTitle, rawTitle]) {
    const pattern = NON_FILM_PATTERNS.find((p) => p.test(title));
    if (pattern) return `non-film pattern: ${pattern.source}`;

    const lower = title.toLowerCase();
    const keyword = LIVE_BROADCAST_KEYWORDS.find((k) => lower.includes(k));
    if (keyword) return `live-broadcast keyword: "${keyword}"`;

    const learnedType = getKnownNonFilmType(title);
    if (learnedType) return `patrol-learned non-film (${learnedType})`;
  }
  return null;
}

/** Derived-year fallback guards (see pickDominantExactTitleMatch). */
const EXACT_TITLE_MIN_POPULARITY = 2;
const EXACT_TITLE_DOMINANCE_RATIO = 5;

/** Strict normalizer for exact-title equality — deliberately NOT the loose
 *  matcher normalizer (which strips ": subtitles", so "Alien: Romulus" would
 *  "equal" "Alien"). Lowercase, fold diacritics, fold punctuation to spaces
 *  (TMDB's official title for the 2002 Jonze film is "Adaptation." with a
 *  trailing period), collapse whitespace. The words themselves must still
 *  match exactly — "alien romulus" remains distinct from "aliens". */
function normalizeExact(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Second-chance pass for hint-less films: plain classic titles like "Aliens"
 * or "Adaptation" fail the primary match not because the film is unclear but
 * because franchise siblings trigger the competition penalty (0.73 - 0.15 =
 * 0.58 < the 0.6 floor) and the DB rows carry no year/director to recover it.
 *
 * From the raw search results, pick a candidate ONLY when:
 *   - its title or original_title is an exact normalized match, AND
 *   - its release year is a past year (year discipline: current/future-year
 *     stubs are exactly the junk the matcher reform exists to avoid), AND
 *   - it is popular enough to be a real film (not a TMDB stub), AND
 *   - it dominates every other exact-title candidate by >= 5x popularity
 *     (same-title art-film-vs-blockbuster cases like "Dracula" stay
 *     unresolved rather than guessed).
 *
 * The caller then re-runs the REAL matcher with the candidate's year as a
 * hint and only accepts the result if the matcher independently lands on the
 * same tmdb id at/above the unchanged 0.6 floor.
 */
export function pickDominantExactTitleMatch(
  cleanedTitle: string,
  results: TMDBSearchResult[],
  currentYear = new Date().getFullYear(),
): { tmdbId: number; year: number } | null {
  const target = normalizeExact(cleanedTitle);
  if (!target) return null;

  const exact = results
    .filter(
      (r) =>
        !r.adult &&
        r.release_date &&
        (normalizeExact(r.title) === target || normalizeExact(r.original_title) === target),
    )
    .map((r) => ({ r, year: parseInt(r.release_date.split("-")[0], 10) }))
    .filter(({ year }) => Number.isInteger(year) && year >= 1900 && year < currentYear);

  if (exact.length === 0) return null;

  exact.sort((a, b) => b.r.popularity - a.r.popularity);
  const top = exact[0];
  if (top.r.popularity < EXACT_TITLE_MIN_POPULARITY) return null;
  if (exact.length > 1 && top.r.popularity < exact[1].r.popularity * EXACT_TITLE_DOMINANCE_RATIO) {
    return null;
  }

  return { tmdbId: top.r.id, year: top.year };
}

// ---------------------------------------------------------------------------
// TMDB call with 429 backoff
// ---------------------------------------------------------------------------

async function withTmdbBackoff<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("429")) throw error;
      if (attempt >= RATE_LIMIT_BACKOFF_MS.length) {
        throw new Error(`TMDB still rate-limiting after ${attempt} backoffs — aborting sweep`);
      }
      const wait = RATE_LIMIT_BACKOFF_MS[attempt];
      console.warn(`  ! TMDB 429 — backing off ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

function matchWithBackoff(
  title: string,
  hints: { year?: number; director?: string },
): Promise<Awaited<ReturnType<typeof matchFilmToTMDB>>> {
  return withTmdbBackoff(() =>
    matchFilmToTMDB(title, {
      ...hints,
      // The titles in this sweep already sit in the DB and have been
      // through the cleaner; single-word classics like "Aliens" or
      // "Adaptation" often carry no year/director, and the ambiguity gate
      // would refuse them outright. Bypassing it follows the
      // enrich-upcoming-films precedent — the 0.6 confidence floor,
      // blocklist filtering, and dry-run review are the safeguards here.
      skipAmbiguityCheck: true,
    }),
  );
}

// ---------------------------------------------------------------------------
// Plan types
// ---------------------------------------------------------------------------

interface UnmatchedFilm {
  id: string;
  title: string;
  year: number | null;
  directors: string[];
}

interface UpdateAction {
  film: UnmatchedFilm;
  cleanedTitle: string;
  tmdbId: number;
  tmdbTitle: string;
  tmdbYear: number;
  confidence: number;
  yearHint?: number;
  /** Year derived via the exact-title second-chance pass (review marker). */
  derivedYear?: number;
  directorHint?: string;
}

interface MergeAction {
  film: UnmatchedFilm;
  cleanedTitle: string;
  tmdbId: number;
  targetFilmId: string;
  targetTitle: string;
  screeningCount: number;
}

interface FlagAction {
  film: UnmatchedFilm;
  cleanedTitle: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Execute helpers
// ---------------------------------------------------------------------------

/** Apply an UPDATE action: enrich the existing row in place with TMDB data. */
async function executeUpdate(action: UpdateAction): Promise<void> {
  const client = getTMDBClient();
  const details = await withTmdbBackoff(() => client.getFullFilmData(action.tmdbId));

  // Same write guards as the pipeline path (film-matching.ts) — every
  // film-write path enforces the same invariants (code-review major).
  const guardedYear = sanitizeYear(action.tmdbYear);
  const guardedDirectors = sanitizeDirectors(
    details.directors.length > 0 ? details.directors : action.film.directors,
    `rematch-sweep tmdb=${action.tmdbId} title="${details.details.title}"`,
  );

  await db
    .update(films)
    .set({
      tmdbId: action.tmdbId,
      imdbId: details.details.imdb_id || null,
      title: details.details.title,
      originalTitle: details.details.original_title,
      year: guardedYear,
      runtime: details.details.runtime || null,
      directors: guardedDirectors,
      cast: details.cast,
      genres: details.details.genres.map((g) => g.name.toLowerCase()),
      countries: details.details.production_countries.map((c) => c.iso_3166_1),
      languages: details.details.spoken_languages.map((l) => l.iso_639_1),
      certification: details.certification || null,
      synopsis: details.details.overview || null,
      tagline: details.details.tagline || null,
      posterUrl: details.details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.details.poster_path}`
        : null,
      backdropUrl: details.details.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${details.details.backdrop_path}`
        : null,
      isRepertory: isRepertoryFilm(details.details.release_date),
      decade: guardedYear ? getDecade(guardedYear) : null,
      tmdbRating: details.details.vote_average,
      tmdbPopularity: details.details.popularity,
      // Audit trail + Letterboxd anchor, consistent with the pipeline path.
      letterboxdUrl: `https://letterboxd.com/tmdb/${action.tmdbId}`,
      matchConfidence: action.confidence,
      matchStrategy: "rematch-sweep",
      matchedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(films.id, action.film.id));
}

/**
 * Apply a MERGE action: repoint all references from the unmatched row to the
 * existing row that already owns the tmdb_id, then delete the empty row.
 * Replicates scripts/cleanup-duplicate-films.ts merge logic, in one
 * transaction, with a repoint-before-delete verification (plan STOP
 * condition: never delete a film row that still has screenings).
 */
async function executeMerge(action: MergeAction): Promise<void> {
  const dupeId = action.film.id;
  const primaryId = action.targetFilmId;

  await db.transaction(async (tx) => {
    // 0. Drop dupe screenings that would collide with the primary on the
    //    unique (film_id, cinema_id, datetime) index after repoint — they are
    //    true duplicates of rows the primary already has (the sanctioned
    //    deletion case). Without this, a single collision aborts the merge
    //    (code-review major; the BFI phantom rows make it a real scenario).
    await tx.execute(sql`
      DELETE FROM screenings s
      WHERE s.film_id = ${dupeId}
        AND EXISTS (
          SELECT 1 FROM screenings p
          WHERE p.film_id = ${primaryId}
            AND p.cinema_id = s.cinema_id
            AND p.datetime = s.datetime
        )
    `);

    // 1. Repoint screenings
    await tx
      .update(screenings)
      .set({ filmId: primaryId })
      .where(eq(screenings.filmId, dupeId));

    // 2. Verify the repoint actually happened before any delete
    const remaining = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(screenings)
      .where(eq(screenings.filmId, dupeId));
    if ((remaining[0]?.count ?? 0) > 0) {
      throw new Error(
        `MERGE aborted: ${remaining[0].count} screenings still point at ${dupeId}`,
      );
    }

    // 3. Repoint season_films (conflict-safe: skip rows where the primary is
    //    already in the season, then delete leftovers)
    await tx.execute(sql`
      UPDATE season_films
      SET film_id = ${primaryId}
      WHERE film_id = ${dupeId}
        AND NOT EXISTS (
          SELECT 1 FROM season_films sf2
          WHERE sf2.season_id = season_films.season_id
            AND sf2.film_id = ${primaryId}
        )
    `);
    await tx.execute(sql`DELETE FROM season_films WHERE film_id = ${dupeId}`);

    // 4. Repoint user_film_statuses (conflict-safe on user_id + film_id)
    await tx.execute(sql`
      UPDATE user_film_statuses
      SET film_id = ${primaryId}
      WHERE film_id = ${dupeId}
        AND NOT EXISTS (
          SELECT 1 FROM user_film_statuses ufs2
          WHERE ufs2.user_id = user_film_statuses.user_id
            AND ufs2.film_id = ${primaryId}
        )
    `);
    await tx.execute(sql`DELETE FROM user_film_statuses WHERE film_id = ${dupeId}`);

    // 5. Delete the now-empty duplicate row
    await tx.delete(films).where(eq(films.id, dupeId));
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const limit = parseLimit(process.argv);

  console.log(
    DRY_RUN
      ? "DRY RUN — no changes will be written (use --execute to apply)\n"
      : "EXECUTE MODE — unmatched films will be updated/merged\n",
  );

  const now = new Date();

  // Films with no TMDB match, classified as films, with >= 1 upcoming screening
  const rows = await db
    .selectDistinct({
      id: films.id,
      title: films.title,
      year: films.year,
      directors: films.directors,
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(
      and(
        isNull(films.tmdbId),
        eq(films.contentType, "film"),
        gte(screenings.datetime, now),
      ),
    );

  // Deterministic order for reviewable dry-run diffs
  rows.sort((a, b) => a.title.localeCompare(b.title));

  const candidates = limit ? rows.slice(0, limit) : rows;
  console.log(
    `Found ${rows.length} unmatched films with upcoming screenings` +
      (limit ? ` — processing first ${candidates.length} (--limit ${limit})` : "") +
      "\n",
  );

  const updates: UpdateAction[] = [];
  const merges: MergeAction[] = [];
  const suspectedNonFilms: FlagAction[] = [];
  const noMatches: FlagAction[] = [];
  const failed: FlagAction[] = [];

  // tmdb_id -> film planned for UPDATE in this run. A second film matching
  // the same id must MERGE into it (the tmdb_id column is UNIQUE; in dry
  // mode the DB lookup can't see planned updates, so track them here).
  const plannedByTmdbId = new Map<number, { id: string; title: string }>();

  for (let i = 0; i < candidates.length; i++) {
    const film = candidates[i];
    const meta = cleanFilmTitleWithMetadata(film.title);
    const cleaned = meta.cleanedTitle;
    const progress = `[${i + 1}/${candidates.length}]`;

    // Non-film flagging — skip before spending TMDB calls
    const nonFilmReason = isSuspectedNonFilm(film.title, cleaned);
    if (nonFilmReason) {
      suspectedNonFilms.push({ film, cleanedTitle: cleaned, reason: nonFilmReason });
      console.log(`${progress} FLAG "${film.title}" — ${nonFilmReason}`);
      continue;
    }

    const yearHint = resolveYearHint(film.year, meta.extractedYear);
    const directorHint = film.directors?.[0] || undefined;

    let match: Awaited<ReturnType<typeof matchFilmToTMDB>>;
    let derivedYear: number | undefined;
    try {
      match = await matchWithBackoff(cleaned, { year: yearHint, director: directorHint });

      // Second-chance pass for hint-less films (see pickDominantExactTitleMatch):
      // derive a year hint from a dominant exact-title candidate, then make
      // the real matcher confirm it independently with the year on board.
      if (!match && !yearHint) {
        const search = await withTmdbBackoff(() => getTMDBClient().searchFilms(cleaned));
        const pick = pickDominantExactTitleMatch(cleaned, search.results);
        if (pick) {
          await sleep(RATE_LIMIT_MS);
          const retry = await matchWithBackoff(cleaned, {
            year: pick.year,
            director: directorHint,
          });
          if (retry && retry.tmdbId === pick.tmdbId) {
            match = retry;
            derivedYear = pick.year;
            console.log(
              `${progress}   derived-year pass: "${cleaned}" → ${pick.year} (tmdb ${pick.tmdbId})`,
            );
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("aborting sweep")) throw error;
      console.warn(`${progress} ERROR "${film.title}": ${message}`);
      noMatches.push({ film, cleanedTitle: cleaned, reason: `error: ${message}` });
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    if (!match) {
      noMatches.push({ film, cleanedTitle: cleaned, reason: "no match above floor" });
      console.log(`${progress} NO_MATCH "${film.title}" (searched "${cleaned}")`);
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    // Does another row already own this tmdb_id? (DB row, or an UPDATE
    // planned/applied earlier in this run.)
    const planned = plannedByTmdbId.get(match.tmdbId);
    const existing = planned
      ? [{ id: planned.id, title: planned.title }]
      : await db
          .select({ id: films.id, title: films.title })
          .from(films)
          .where(eq(films.tmdbId, match.tmdbId))
          .limit(1);

    if (existing.length > 0) {
      const screeningCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(screenings)
        .where(eq(screenings.filmId, film.id));

      const action: MergeAction = {
        film,
        cleanedTitle: cleaned,
        tmdbId: match.tmdbId,
        targetFilmId: existing[0].id,
        targetTitle: existing[0].title,
        screeningCount: screeningCount[0]?.count ?? 0,
      };
      console.log(
        `${progress} MERGE "${film.title}" → existing "${existing[0].title}" ` +
          `(tmdb ${match.tmdbId}), ${action.screeningCount} screenings to repoint`,
      );
      if (DRY_RUN) {
        merges.push(action);
      } else {
        // Per-film failure isolation: one failed write (unique violation
        // from a concurrent scrape, transient TMDB/DB error) must not abort
        // the rest of the run. The transaction guarantees per-film atomicity.
        try {
          await executeMerge(action);
          merges.push(action);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`${progress} MERGE FAILED "${film.title}": ${message}`);
          failed.push({ film, cleanedTitle: cleaned, reason: `merge failed: ${message}` });
        }
      }
    } else {
      const action: UpdateAction = {
        film,
        cleanedTitle: cleaned,
        tmdbId: match.tmdbId,
        tmdbTitle: match.title,
        tmdbYear: match.year,
        confidence: match.confidence,
        yearHint,
        derivedYear,
        directorHint,
      };
      console.log(
        `${progress} UPDATE "${film.title}" → "${match.title}" (${match.year}) ` +
          `[tmdb ${match.tmdbId}, conf ${match.confidence.toFixed(2)}]`,
      );
      if (DRY_RUN) {
        updates.push(action);
        plannedByTmdbId.set(match.tmdbId, { id: film.id, title: match.title });
      } else if (updates.length >= MAX_EXECUTE_UPDATES) {
        // Plan STOP condition: >250 proposed UPDATEs is suspiciously high.
        // In execute mode stop applying instead of ploughing on.
        console.warn(
          `${progress} UPDATE cap reached (${MAX_EXECUTE_UPDATES}) — skipping "${film.title}"; ` +
            "review with the operator before a larger run",
        );
        failed.push({ film, cleanedTitle: cleaned, reason: "skipped: execute UPDATE cap reached" });
      } else {
        try {
          await executeUpdate(action);
          updates.push(action);
          plannedByTmdbId.set(match.tmdbId, { id: film.id, title: match.title });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`${progress} UPDATE FAILED "${film.title}": ${message}`);
          failed.push({ film, cleanedTitle: cleaned, reason: `update failed: ${message}` });
        }
      }
    }

    await sleep(RATE_LIMIT_MS);
  }

  // -------------------------------------------------------------------------
  // Plan summary, grouped by action
  // -------------------------------------------------------------------------
  const mode = DRY_RUN ? "would be applied with --execute" : "applied";

  console.log(`\n${"=".repeat(70)}`);
  console.log(`=== UPDATE (${updates.length}) — ${mode} ===`);
  for (const u of updates) {
    const hints = [
      u.yearHint ? `year ${u.yearHint}` : null,
      u.derivedYear ? `DERIVED year ${u.derivedYear} — review` : null,
      u.directorHint ? `director ${u.directorHint}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    console.log(
      `  "${u.film.title}" → "${u.tmdbTitle}" (${u.tmdbYear}) ` +
        `tmdb=${u.tmdbId} conf=${u.confidence.toFixed(2)}${hints ? ` [${hints}]` : ""}`,
    );
  }

  console.log(`\n=== MERGE (${merges.length}) — ${mode} ===`);
  for (const m of merges) {
    console.log(
      `  "${m.film.title}" [${m.film.id}] → "${m.targetTitle}" [${m.targetFilmId}] ` +
        `tmdb=${m.tmdbId}, ${m.screeningCount} screenings`,
    );
  }

  console.log(`\n=== SUSPECTED_NON_FILM (${suspectedNonFilms.length}) — flagged only, never auto-reclassified ===`);
  for (const f of suspectedNonFilms) {
    console.log(`  "${f.film.title}" — ${f.reason}`);
  }

  console.log(`\n=== NO_MATCH (${noMatches.length}) ===`);
  for (const f of noMatches) {
    console.log(`  "${f.film.title}" (searched "${f.cleanedTitle}") — ${f.reason}`);
  }

  if (failed.length > 0) {
    console.log(`\n=== FAILED (${failed.length}) — left untouched, re-run to retry ===`);
    for (const f of failed) {
      console.log(`  "${f.film.title}" — ${f.reason}`);
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Summary: ${candidates.length} processed`);
  console.log(`  UPDATE:             ${updates.length}`);
  console.log(`  MERGE:              ${merges.length}`);
  console.log(`  SUSPECTED_NON_FILM: ${suspectedNonFilms.length}`);
  console.log(`  NO_MATCH:           ${noMatches.length}`);
  if (failed.length > 0) {
    console.log(`  FAILED:             ${failed.length}`);
  }
  if (DRY_RUN) {
    if (updates.length > MAX_EXECUTE_UPDATES) {
      console.warn(
        `\n[WARNING] ${updates.length} proposed UPDATEs exceeds the ${MAX_EXECUTE_UPDATES} ` +
          "STOP threshold — review with the operator before executing.",
      );
    }
    console.log("\n[DRY RUN] No changes were made. Review the UPDATE/MERGE lists, then re-run with --execute.");
  }
}

// Only run when called directly (not when imported by tests)
const isDirectRun =
  process.argv[1]?.endsWith("rematch-unmatched-films.ts") ||
  process.argv[1]?.endsWith("rematch-unmatched-films.js");

if (isDirectRun) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}
