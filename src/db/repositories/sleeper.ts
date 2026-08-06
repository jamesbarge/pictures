/**
 * Sleeper Repository — THE SLEEPER daily pick.
 *
 * Splits cleanly from src/lib/sleeper.ts: that module owns the *rule* (gates,
 * score, cooldown) and is pure and unit-tested; this module owns the *data*
 * (which films screen when, what was picked before, persisting the result).
 *
 * Two conventions worth knowing before editing:
 *
 * 1. Day bucketing is done in SQL with `(datetime AT TIME ZONE 'Europe/London')
 *    ::date`, never in TypeScript. Postgres gets the BST/GMT transitions right
 *    and it keeps the grouping in the query.
 * 2. Every date leaves SQL as `::text`. postgres.js hydrates `date` columns
 *    into JS Date objects at UTC midnight, which format as the PREVIOUS day
 *    under BST — the same off-by-one the schema comment warns about.
 */

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { addDaysToDateString, londonDateString } from "@/lib/london-date";
import {
  SLEEPER,
  SLEEPER_ALGO_VERSION,
  type SleeperCandidate,
  type SleeperPick,
  selectPicksForHorizon,
} from "@/lib/sleeper";

/** How many days ahead the pipeline precomputes. Matches the cooldown window. */
export const SLEEPER_HORIZON_DAYS = 21;

/**
 * Picks for dates within this many days of today are frozen once written, so a
 * pick a user can still act on never changes under them. Dates beyond it stay
 * refreshable as new screenings land.
 */
const IMMUTABLE_WITHIN_DAYS = 7;

/**
 * Below this many backfilled vote counts the pool is not meaningfully
 * populated and the phase should decline to write rather than produce
 * garbage picks from a handful of rows.
 */
export const MIN_BACKFILLED_VOTE_COUNTS = 500;

// A type alias, not an interface: db.execute<T> constrains T to
// Record<string, unknown>, and only type aliases get an implicit index
// signature. An interface here fails with TS2344.
type CandidateRow = {
  pick_date: string;
  film_id: string;
  cooldown_key: string;
  letterboxd_rating: number | null;
  tmdb_vote_count: number | null;
  is_repertory: boolean;
  content_type: string | null;
  genres: string[];
};

/**
 * All films screening on each London date in [from, to], ungated.
 *
 * Gating happens in the pure module so the rule lives in exactly one place and
 * so `candidate_count` can be computed from the same filtered list the winner
 * came from.
 */
export async function getCandidatesByDate(
  from: string,
  to: string,
): Promise<Map<string, SleeperCandidate[]>> {
  const rows = await db.execute<CandidateRow>(sql`
    SELECT
      (s.datetime AT TIME ZONE 'Europe/London')::date::text AS pick_date,
      f.id                                                  AS film_id,
      -- Cooldown identity, not row identity: this DB has 115 duplicate
      -- letterboxd_slug groups, so a film_id key lets one film win twice in a
      -- week under two rows.
      COALESCE(f.letterboxd_slug, f.tmdb_id::text, f.id)    AS cooldown_key,
      f.letterboxd_rating,
      f.tmdb_vote_count,
      f.is_repertory,
      f.content_type,
      f.genres
    FROM screenings s
    JOIN films f ON f.id = s.film_id
    -- Sargable bounds so this never scans the ~60k historical screenings nor
    -- every future one; the London-date filter then narrows exactly. The 1-day
    -- slack on each side covers the widest possible UTC/London offset.
    WHERE s.datetime >= now() - interval '1 day'
      AND s.datetime < ${to}::date + interval '2 days'
      AND (s.datetime AT TIME ZONE 'Europe/London')::date
            BETWEEN ${from}::date AND ${to}::date
    -- One row per (day, film): a film with three showings is one candidate.
    GROUP BY 1, f.id
  `);

  const byDate = new Map<string, SleeperCandidate[]>();
  for (const row of rows) {
    const candidate: SleeperCandidate = {
      filmId: row.film_id,
      cooldownKey: row.cooldown_key,
      letterboxdRating: row.letterboxd_rating,
      tmdbVoteCount: row.tmdb_vote_count,
      isRepertory: row.is_repertory,
      contentType: row.content_type,
      genres: row.genres ?? [],
    };
    const existing = byDate.get(row.pick_date);
    if (existing) existing.push(candidate);
    else byDate.set(row.pick_date, [candidate]);
  }
  return byDate;
}

/**
 * cooldownKey -> the most recent date it was picked, looking back one full
 * cooldown window before `from`.
 */
export async function getLastPickedMap(from: string): Promise<Map<string, string>> {
  const since = addDaysToDateString(from, -SLEEPER.COOLDOWN_DAYS);
  const rows = await db.execute<{ cooldown_key: string; last_picked: string }>(sql`
    SELECT
      COALESCE(f.letterboxd_slug, f.tmdb_id::text, f.id) AS cooldown_key,
      MAX(dp.pick_date)::text                            AS last_picked
    FROM daily_picks dp
    JOIN films f ON f.id = dp.film_id
    WHERE dp.pick_date >= ${since}::date
      AND dp.pick_date <  ${from}::date
    GROUP BY 1
  `);
  return new Map(rows.map((r) => [r.cooldown_key, r.last_picked]));
}

export interface RefreshResult {
  written: number;
  skippedImmutable: number;
  /** Dates in the horizon with fewer than 3 gate-passing candidates. */
  thinDays: Array<{ date: string; candidateCount: number }>;
  /** Dates with no eligible film at all. */
  emptyDays: string[];
  /** Subset of emptyDays inside the next 7 days — user-visible, worth alerting. */
  emptyDaysWithin7: string[];
  /** Dates that had to relax or waive the cooldown to find anyone. */
  cooldownDegradedDays: string[];
  /** Null when the run proceeded; a reason string when it declined to write. */
  declined: string | null;
}

/**
 * Recompute and persist picks for today .. today+SLEEPER_HORIZON_DAYS.
 *
 * Idempotent and cheap (~2s), which is why the pipeline phase always runs it
 * rather than treating it as checkpointable work.
 */
export async function refreshSleeperPicks(now: Date = new Date()): Promise<RefreshResult> {
  const today = londonDateString(now);
  const lastDate = addDaysToDateString(today, SLEEPER_HORIZON_DAYS);

  const empty: RefreshResult = {
    written: 0,
    skippedImmutable: 0,
    thinDays: [],
    emptyDays: [],
    emptyDaysWithin7: [],
    cooldownDegradedDays: [],
    declined: null,
  };

  // Guard: the whole feature is meaningless before the vote-count backfill has
  // run, and silently writing picks chosen from a handful of rows would look
  // like success.
  const [{ backfilled }] = await db.execute<{ backfilled: number }>(sql`
    SELECT count(*)::int AS backfilled FROM films WHERE tmdb_vote_count IS NOT NULL
  `);
  if (backfilled < MIN_BACKFILLED_VOTE_COUNTS) {
    return {
      ...empty,
      declined: `only ${backfilled} films have tmdb_vote_count — run npm run db:backfill-tmdb-vote-count -- --execute`,
    };
  }

  const dates: string[] = [];
  for (let i = 0; i <= SLEEPER_HORIZON_DAYS; i++) dates.push(addDaysToDateString(today, i));

  const frozenThrough = addDaysToDateString(today, IMMUTABLE_WITHIN_DAYS);

  const [candidatesByDate, lastPickedAt, frozen] = await Promise.all([
    getCandidatesByDate(today, lastDate),
    getLastPickedMap(today),
    // Rows inside the freeze window will NOT be rewritten below, so the
    // selection must be told what they actually are. Without this the cooldown
    // is enforced against films this run merely imagined for those days, and a
    // film frozen at day 5 is free to win again at day 12 — silently breaking
    // the 21-day no-repeat that is the whole reason this table exists.
    getStoredPicks(today, frozenThrough),
  ]);

  const alreadyPicked = new Map(frozen.map((p) => [p.date, p.cooldownKey]));

  const picks = selectPicksForHorizon(dates, candidatesByDate, lastPickedAt, alreadyPicked);

  // Drop future rows computed under an older algo version — their scores are
  // not comparable to fresh ones and we would otherwise never replace them.
  await db.execute(sql`
    DELETE FROM daily_picks
    WHERE pick_date >= ${today}::date
      AND algo_version <> ${SLEEPER_ALGO_VERSION}
  `);

  const result: RefreshResult = { ...empty };

  for (const [dayOffset, date] of dates.entries()) {
    // Frozen rows were never candidates for rewriting, so they are neither
    // "written" nor "empty" — reporting them as gaps would cry wolf every run.
    if (alreadyPicked.has(date)) {
      result.skippedImmutable++;
      continue;
    }

    const pick = picks.get(date);
    if (!pick) {
      result.emptyDays.push(date);
      if (dayOffset <= IMMUTABLE_WITHIN_DAYS) result.emptyDaysWithin7.push(date);
      continue;
    }

    if (pick.candidateCount < 3) {
      result.thinDays.push({ date, candidateCount: pick.candidateCount });
    }
    if (pick.cooldownDaysApplied < SLEEPER.COOLDOWN_DAYS) {
      result.cooldownDegradedDays.push(date);
    }

    const written = await upsertPick(date, pick, today);
    if (written) result.written++;
    else result.skippedImmutable++;
  }

  return result;
}

/**
 * @returns true if the row was written, false if an existing near-term row was
 *          left frozen.
 */
async function upsertPick(date: string, pick: SleeperPick, today: string): Promise<boolean> {
  const frozenThrough = addDaysToDateString(today, IMMUTABLE_WITHIN_DAYS);
  const rows = await db.execute<{ pick_date: string }>(sql`
    INSERT INTO daily_picks (
      pick_date, film_id, score, letterboxd_rating, tmdb_vote_count,
      candidate_count, cooldown_days_applied, algo_version, computed_at
    ) VALUES (
      ${date}::date, ${pick.filmId}, ${pick.score}, ${pick.letterboxdRating},
      ${pick.tmdbVoteCount}, ${pick.candidateCount}, ${pick.cooldownDaysApplied},
      ${SLEEPER_ALGO_VERSION}, now()
    )
    ON CONFLICT (pick_date) DO UPDATE SET
      film_id               = EXCLUDED.film_id,
      score                 = EXCLUDED.score,
      letterboxd_rating     = EXCLUDED.letterboxd_rating,
      tmdb_vote_count       = EXCLUDED.tmdb_vote_count,
      candidate_count       = EXCLUDED.candidate_count,
      cooldown_days_applied = EXCLUDED.cooldown_days_applied,
      algo_version          = EXCLUDED.algo_version,
      computed_at           = now()
    -- Freeze anything a user could still act on. Only far-future rows get
    -- rewritten as new screenings land.
    WHERE daily_picks.pick_date > ${frozenThrough}::date
    RETURNING pick_date::text AS pick_date
  `);
  return rows.length > 0;
}

export interface StoredSleeperPick {
  date: string;
  filmId: string;
  /** Identity used for cooldown — see SleeperCandidate.cooldownKey. */
  cooldownKey: string;
  score: number;
  letterboxdRating: number;
  tmdbVoteCount: number;
  source: "precomputed" | "fallback";
}

/**
 * Read picks for [from, from+days], validated against live screenings.
 *
 * The stored row is an advisory cache, not the truth: screenings get cancelled
 * between weekly scrapes, so a row whose film no longer screens that day is
 * discarded here and recomputed by the caller. Checking only for the row's
 * existence would surface picks you cannot actually go and see.
 */
export async function getStoredPicks(from: string, to: string): Promise<StoredSleeperPick[]> {
  const rows = await db.execute<{
    pick_date: string;
    film_id: string;
    cooldown_key: string;
    score: number;
    letterboxd_rating: number;
    tmdb_vote_count: number;
  }>(sql`
    SELECT
      dp.pick_date::text                                 AS pick_date,
      dp.film_id,
      COALESCE(f.letterboxd_slug, f.tmdb_id::text, f.id) AS cooldown_key,
      dp.score,
      dp.letterboxd_rating,
      dp.tmdb_vote_count
    FROM daily_picks dp
    JOIN films f ON f.id = dp.film_id
    WHERE dp.pick_date BETWEEN ${from}::date AND ${to}::date
      -- Rows scored under an older rule are not comparable to fresh ones, and
      -- serving them alongside a new meta.algoVersion would misreport what the
      -- reader is looking at. Drop them and let the fallback recompute.
      AND dp.algo_version = ${SLEEPER_ALGO_VERSION}
      AND EXISTS (
        SELECT 1
        FROM screenings s
        WHERE s.film_id = dp.film_id
          AND (s.datetime AT TIME ZONE 'Europe/London')::date = dp.pick_date
      )
    ORDER BY dp.pick_date
  `);

  return rows.map((r) => ({
    date: r.pick_date,
    filmId: r.film_id,
    cooldownKey: r.cooldown_key,
    score: r.score,
    letterboxdRating: r.letterboxd_rating,
    tmdbVoteCount: r.tmdb_vote_count,
    source: "precomputed" as const,
  }));
}

/**
 * Recompute picks for specific dates without persisting.
 *
 * Used when a stored row is missing or has been invalidated. Calls the same
 * selection function the pipeline uses, so there is no second copy of the rule
 * to drift — which is the main legitimate objection to having a fallback path
 * at all. A public GET must not write, hence no persistence here.
 */
export async function computePicksForDates(
  dates: string[],
  /**
   * Stored picks the caller already holds for other dates in the same window.
   * Required for correctness, not speed: without them a recomputed gap day is
   * blind to the film stored on the day either side of it and will happily
   * duplicate it.
   */
  known: readonly StoredSleeperPick[] = [],
): Promise<StoredSleeperPick[]> {
  if (dates.length === 0) return [];

  const wanted = new Set(dates);
  const alreadyPicked = new Map(known.map((p) => [p.date, p.cooldownKey]));

  // Walk every date in the window, not just the gaps, so the known picks are
  // registered in the cooldown in the right order relative to the gaps.
  const span = [...new Set([...dates, ...known.map((p) => p.date)])].sort();

  const [candidatesByDate, lastPickedAt] = await Promise.all([
    getCandidatesByDate(span[0], span[span.length - 1]),
    getLastPickedMap(span[0]),
  ]);

  const picks = selectPicksForHorizon(span, candidatesByDate, lastPickedAt, alreadyPicked);

  return span
    .filter((date) => wanted.has(date))
    .map((date): StoredSleeperPick | null => {
      const pick = picks.get(date);
      if (!pick) return null;
      return {
        date,
        filmId: pick.filmId,
        cooldownKey: pick.cooldownKey,
        score: pick.score,
        letterboxdRating: pick.letterboxdRating,
        tmdbVoteCount: pick.tmdbVoteCount,
        source: "fallback" as const,
      };
    })
    .filter((p): p is StoredSleeperPick => p !== null);
}
