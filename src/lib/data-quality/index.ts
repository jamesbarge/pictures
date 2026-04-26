/**
 * Data quality cleanup primitives — extracted from
 * scripts/audit-and-fix-upcoming.ts so the same logic can run inside
 * Trigger.dev's daily-sweep without shelling out.
 *
 * Each function returns counts; the caller is responsible for logging and
 * Telegram reporting. Pure DB I/O — no shell, no fs (except for the
 * learnings JSON path which is read at module load via require.resolve).
 */

import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { eq, isNull, and, gte, lte, sql } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Pass 2: Non-film detection patterns
// (verbatim copy from scripts/audit-and-fix-upcoming.ts)
// ---------------------------------------------------------------------------

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

const CONCERT_PATTERNS = [
  /\blive\s+in\s+concert\b/i,
  /\balbum\s+listening\b/i,
  /\bdj\s+set\b/i,
  /\blive\s+music\s+performance\b/i,
  /\bsymphony\s+screening\b/i,
];

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

const KIDS_NON_FILM_PATTERNS = [
  /^toddler\s+time$/i,
  /^baby\s+cinema$/i,
  /\bplay\s+&?\s*stay\b/i,
  /\bsensory\s+session\b/i,
];

type ContentType = "film" | "concert" | "live_broadcast" | "event";

function classifyNonFilm(title: string): ContentType | null {
  for (const p of LIVE_BROADCAST_PATTERNS) if (p.test(title)) return "live_broadcast";
  for (const p of CONCERT_PATTERNS) if (p.test(title)) return "concert";
  for (const p of EVENT_PATTERNS) if (p.test(title)) return "event";
  for (const p of KIDS_NON_FILM_PATTERNS) if (p.test(title)) return "event";
  return null;
}

export interface NonFilmResult {
  scanned: number;
  reclassified: number;
  deleted: number;
}

/**
 * Identify and reclassify (or delete) non-film content with upcoming screenings.
 * Skips films that already have a TMDB ID — those are confirmed real films.
 *
 * Hard-delete only applies to films created >24h ago. A film scraped this
 * morning hasn't had a chance to be enriched, and a regex match alone isn't
 * a "confirmed parsing error" per .claude/rules/database.md. Younger films
 * matching event patterns are reclassified instead so they're recoverable.
 */
export async function runNonFilmDetection(): Promise<NonFilmResult> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - ONE_DAY_MS);
  const candidates = await db
    .selectDistinct({
      id: films.id,
      title: films.title,
      createdAt: films.createdAt,
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(
      and(
        eq(films.contentType, "film"),
        isNull(films.tmdbId),
        gte(screenings.datetime, now),
      )
    );

  let reclassified = 0;
  let deleted = 0;

  for (const film of candidates) {
    const newType = classifyNonFilm(film.title);
    if (!newType) continue;

    const safeToDelete =
      newType === "event" && film.createdAt && film.createdAt <= oneDayAgo;

    if (safeToDelete) {
      await db.delete(screenings).where(eq(screenings.filmId, film.id));
      await db.delete(films).where(eq(films.id, film.id));
      deleted++;
    } else {
      // Either it's not an event-pattern match, or it's a brand-new film that
      // hasn't had time to be enriched — reclassify rather than destroy.
      await db
        .update(films)
        .set({ contentType: newType, updatedAt: new Date() })
        .where(eq(films.id, film.id));
      reclassified++;
    }
  }

  return { scanned: candidates.length, reclassified, deleted };
}

// ---------------------------------------------------------------------------
// Pass 7: Dodgy entry detection
// ---------------------------------------------------------------------------

export interface DodgyEntry {
  id: string;
  title: string;
  reasons: string[];
}

const DODGY_THRESHOLDS = {
  maxTitleLength: 80,
  minYear: 1895,
  maxYear: 2027,
  maxRuntime: 600,
};

/**
 * Flag suspicious film entries with upcoming screenings. Returns the list
 * for reporting; does NOT delete or modify (these need human review).
 */
export async function detectDodgyEntries(): Promise<DodgyEntry[]> {
  const now = new Date();
  const upcoming = await db
    .selectDistinct({
      id: films.id,
      title: films.title,
      year: films.year,
      tmdbId: films.tmdbId,
      posterUrl: films.posterUrl,
      synopsis: films.synopsis,
      runtime: films.runtime,
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(
      and(
        eq(films.contentType, "film"),
        gte(screenings.datetime, now),
      )
    );

  const dodgy: DodgyEntry[] = [];
  for (const film of upcoming) {
    const reasons: string[] = [];
    if (film.title.length > DODGY_THRESHOLDS.maxTitleLength) {
      reasons.push(`title too long (${film.title.length})`);
    }
    if (film.title === film.title.toUpperCase() && film.title.length > 3 && !film.tmdbId) {
      reasons.push("ALL CAPS, no TMDB");
    }
    if (film.year !== null && (film.year > DODGY_THRESHOLDS.maxYear || film.year < DODGY_THRESHOLDS.minYear)) {
      reasons.push(`bad year: ${film.year}`);
    }
    if (film.runtime !== null && (film.runtime === 0 || film.runtime > DODGY_THRESHOLDS.maxRuntime)) {
      reasons.push(`bad runtime: ${film.runtime}m`);
    }
    if (!film.tmdbId && !film.posterUrl && !film.synopsis) {
      reasons.push("no TMDB/poster/synopsis");
    }
    if (reasons.length > 0) dodgy.push({ id: film.id, title: film.title, reasons });
  }
  return dodgy;
}

// ---------------------------------------------------------------------------
// Pass 8: Apply known-wrong TMDB corrections from learnings file
// ---------------------------------------------------------------------------

interface LearningsFile {
  wrongTmdbMatches?: Record<string, { wrong: number; correct: number; year?: number; usedCount?: number }>;
}

function loadLearnings(): LearningsFile {
  const path = join(process.cwd(), ".claude", "data-check-learnings.json");
  if (!existsSync(path)) {
    console.warn(
      `[data-quality] Learnings file not found at ${path}; TMDB corrections will no-op. ` +
        "Verify the file is bundled with the Trigger.dev deployment.",
    );
    return {};
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as LearningsFile;
  } catch (err) {
    console.warn(
      `[data-quality] Failed to parse learnings file at ${path}:`,
      err instanceof Error ? err.message : err,
    );
    return {};
  }
}

export interface LearningsResult {
  scanned: number;
  corrected: number;
  byTitle: { title: string; from: number; to: number; matchedFilms: number }[];
}

/**
 * Apply the curated list of known-wrong TMDB IDs from
 * .claude/data-check-learnings.json. Each entry maps a film title (lowercase)
 * to a wrong/correct TMDB pair; if a film matches the title (case-insensitive)
 * AND currently has the wrong TMDB ID, swap it.
 */
export async function applyKnownTmdbCorrections(): Promise<LearningsResult> {
  const learnings = loadLearnings();
  const wrongMap = learnings.wrongTmdbMatches ?? {};
  const titles = Object.keys(wrongMap);
  if (titles.length === 0) return { scanned: 0, corrected: 0, byTitle: [] };

  let corrected = 0;
  const byTitle: { title: string; from: number; to: number; matchedFilms: number }[] = [];

  for (const title of titles) {
    const entry = wrongMap[title];
    const matches = await db
      .select({ id: films.id })
      .from(films)
      .where(
        and(
          eq(films.tmdbId, entry.wrong),
          sql`lower(${films.title}) = ${title}`,
        )
      );

    if (matches.length === 0) continue;

    for (const f of matches) {
      await db
        .update(films)
        .set({ tmdbId: entry.correct, updatedAt: new Date() })
        .where(eq(films.id, f.id));
      corrected++;
    }
    byTitle.push({ title, from: entry.wrong, to: entry.correct, matchedFilms: matches.length });
  }

  return { scanned: titles.length, corrected, byTitle };
}
