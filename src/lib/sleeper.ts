/**
 * THE SLEEPER — one acclaimed-but-under-seen repertory film per London day.
 *
 * Quality comes from Letterboxd (harsh cinephile curve, mean ~3.2), obscurity
 * from TMDB vote_count (mainstream voter base, so a good proxy for how many
 * ordinary people have actually seen a film). Being well-regarded on Letterboxd
 * while thinly-voted on TMDB is close to the definition of a sleeper.
 *
 * This module is deliberately pure — no DB, no clock, no I/O — so the whole
 * selection rule is unit-testable. The Postgres side supplies candidates; see
 * src/db/repositories/sleeper.ts.
 */

import { daysBetweenDateStrings } from "./london-date";

/**
 * Bump whenever K or any gate changes. Stored on each daily_picks row so the
 * refresh can identify and replace rows computed under older settings instead
 * of guessing whether a stored score is comparable to a fresh one.
 */
export const SLEEPER_ALGO_VERSION = 1;

export const SLEEPER = {
  /**
   * Obscurity weight. score = rating − K·log10(votes).
   *
   * Bracketed by two real pairs from the live candidate pool rather than
   * picked by feel:
   *   Punishment Park (4.16, 205) must beat Do the Right Thing (4.40, 2028)
   *     → K > 0.241
   *   Andrei Rublev (4.44, 959) must beat Tampopo (4.32, 442)
   *     → K < 0.357
   * Midpoint of (0.241, 0.357). Reads as: a film ten times more seen must be
   * 0.30 stars better to win; twice as seen costs 0.09 stars.
   */
  K: 0.3,

  /**
   * Quality floor. Without it the argmax of an obscurity-rewarding score is
   * "the least-seen film in London" — i.e. a bad film nobody has heard of.
   * ~80th percentile of Letterboxd ratings.
   */
  MIN_LETTERBOXD_RATING: 3.8,

  /**
   * Credibility floor. Guards two distinct failures:
   *   1. Statistical — 4.7 stars from 12 votes is noise, not acclaim.
   *   2. Data integrity — in this DB a near-zero vote count is the single best
   *      signal that the TMDB match is WRONG. Cross-wired rows (Letterboxd
   *      rating from film A, tmdb_id from film B) produce exactly the profile
   *      "very high rating + almost no votes", which is precisely what an
   *      obscurity-rewarding score ranks first. A real example shipped in this
   *      database: "Harakiri" at rating 4.68 with vote_count 0.
   */
  MIN_VOTE_COUNT: 200,

  /**
   * Obscurity ceiling. K does fine discrimination; only this hard cut reliably
   * excludes canon. At 3000 a simulated thin day picked Stalker (2544) — the
   * most canonical arthouse title in the pool, and a self-evident failure as a
   * "sleeper". 2500 also excludes 8½ (2556) and Eraserhead (2783).
   */
  MAX_VOTE_COUNT: 2500,

  /** Days before a film may be picked again. */
  COOLDOWN_DAYS: 21,

  /** First relaxation when the full cooldown starves a day. */
  COOLDOWN_RELAXED_DAYS: 10,
} as const;

/** Genre (lowercased, as stored) excluded by product decision. */
const EXCLUDED_GENRE = "documentary";

export interface SleeperCandidate {
  filmId: string;
  /**
   * Identity for cooldown purposes. NOT filmId: this database has 115
   * duplicate-letterboxd_slug groups covering 255 rows (e.g. "Kamikaze Girls"
   * and "Japanese Film Club: Kamikaze Girls" are separate rows for one film),
   * so a filmId-keyed cooldown is evadeable and the same film could win twice
   * in a week under two ids. Callers should pass
   * `letterboxdSlug ?? String(tmdbId) ?? filmId`.
   */
  cooldownKey: string;
  letterboxdRating: number | null;
  tmdbVoteCount: number | null;
  isRepertory: boolean;
  contentType: string | null;
  /** Lowercased at write time — see film-matching.ts. */
  genres: string[];
}

export interface SleeperPick {
  filmId: string;
  cooldownKey: string;
  score: number;
  letterboxdRating: number;
  tmdbVoteCount: number;
  /** How many films cleared the gates that day. Warn below 3. */
  candidateCount: number;
  /** Which cooldown tier produced this pick: 21 (full), 10 (relaxed), 0 (waived). */
  cooldownDaysApplied: number;
}

/**
 * score = letterboxdRating − K·log10(voteCount). Higher is more "sleeper".
 *
 * `Math.max(votes, 1)` mirrors the SQL guard. log10(0) is -Infinity in JS and a
 * hard ERROR in Postgres; MIN_VOTE_COUNT should make it unreachable, but the
 * highest-rated row in this database really does have vote_count 0, so the
 * belt-and-braces stays.
 */
export function sleeperScore(letterboxdRating: number, tmdbVoteCount: number): number {
  return letterboxdRating - SLEEPER.K * Math.log10(Math.max(tmdbVoteCount, 1));
}

/** Every hard gate. A candidate must pass all of them to be pickable. */
export function passesGates(candidate: SleeperCandidate): boolean {
  const { letterboxdRating, tmdbVoteCount, isRepertory, contentType, genres } = candidate;

  if (!isRepertory) return false;
  if (contentType != null && contentType !== "film") return false;
  if (letterboxdRating == null || tmdbVoteCount == null) return false;
  if (!Number.isFinite(letterboxdRating) || !Number.isFinite(tmdbVoteCount)) return false;
  if (letterboxdRating < SLEEPER.MIN_LETTERBOXD_RATING) return false;
  if (tmdbVoteCount < SLEEPER.MIN_VOTE_COUNT) return false;
  if (tmdbVoteCount > SLEEPER.MAX_VOTE_COUNT) return false;
  if (genres.some((g) => g.toLowerCase() === EXCLUDED_GENRE)) return false;

  return true;
}

/**
 * Total ordering, best first. Totality matters: the same ISR payload is
 * rendered more than once and two renders must never disagree, so ties fall
 * through to filmId rather than depending on input order.
 */
export function compareCandidates(a: SleeperCandidate, b: SleeperCandidate): number {
  const aScore = sleeperScore(a.letterboxdRating!, a.tmdbVoteCount!);
  const bScore = sleeperScore(b.letterboxdRating!, b.tmdbVoteCount!);
  if (aScore !== bScore) return bScore - aScore;
  // More obscure wins a tie — it is the more interesting recommendation.
  if (a.tmdbVoteCount !== b.tmdbVoteCount) return a.tmdbVoteCount! - b.tmdbVoteCount!;
  return a.filmId < b.filmId ? -1 : a.filmId > b.filmId ? 1 : 0;
}

/**
 * Choose one pick per date, greedily in ascending date order.
 *
 * Greedy-and-sequential is why this cannot be a SQL view or a date-seeded pure
 * function: each day's choice depends on which films the *previous* days
 * consumed. That statefulness is the entire reason daily_picks is a table.
 *
 * @param dates            Horizon, ascending "YYYY-MM-DD".
 * @param candidatesByDate All candidates screening on each date (ungated).
 * @param lastPickedAt     cooldownKey -> most recent past pick date. Mutated.
 * @param alreadyPicked    date -> cooldownKey for dates whose pick is already
 *                         decided and will NOT be rewritten (frozen rows in the
 *                         refresh, stored rows in the read-time fallback).
 *
 * `alreadyPicked` is load-bearing, not an optimisation. Without it the cooldown
 * is enforced against films this run merely *imagined* for those dates, while
 * the database keeps different ones — so a film frozen at day 5 is invisible
 * and free to win again at day 12, silently breaking the 21-day guarantee that
 * is the sole reason this table exists. Those dates are registered in the
 * cooldown and skipped, never re-emitted.
 */
export function selectPicksForHorizon(
  dates: readonly string[],
  candidatesByDate: ReadonlyMap<string, readonly SleeperCandidate[]>,
  lastPickedAt: Map<string, string>,
  alreadyPicked: ReadonlyMap<string, string> = new Map(),
): Map<string, SleeperPick> {
  const picks = new Map<string, SleeperPick>();

  for (const date of dates) {
    // Dates whose pick is already fixed still consume their film's cooldown.
    const fixed = alreadyPicked.get(date);
    if (fixed !== undefined) {
      lastPickedAt.set(fixed, date);
      continue;
    }

    const eligible = (candidatesByDate.get(date) ?? []).filter(passesGates);
    if (eligible.length === 0) continue;

    const ordered = [...eligible].sort(compareCandidates);

    // Ladder rather than hard failure: a starved day degrades to a shorter
    // cooldown, and records which tier fired so starvation is visible in the
    // data instead of silently looking like a normal pick.
    for (const cooldown of [SLEEPER.COOLDOWN_DAYS, SLEEPER.COOLDOWN_RELAXED_DAYS, 0]) {
      const passing = ordered.filter((c) => {
        const last = lastPickedAt.get(c.cooldownKey);
        return last === undefined || daysBetweenDateStrings(last, date) >= cooldown;
      });
      if (passing.length === 0) continue;

      // Once the full cooldown has been relaxed we are already in starvation,
      // and the failure users actually notice is the same film two days
      // running. So below the top tier, staleness outranks score: prefer the
      // least-recently-picked candidate, and only use score to break ties.
      const winner =
        cooldown === SLEEPER.COOLDOWN_DAYS
          ? passing[0]
          : passing.reduce((best, c) => {
              const gap = (x: SleeperCandidate) => {
                const last = lastPickedAt.get(x.cooldownKey);
                return last === undefined ? Number.POSITIVE_INFINITY : daysBetweenDateStrings(last, date);
              };
              return gap(c) > gap(best) ? c : best;
            }, passing[0]);

      lastPickedAt.set(winner.cooldownKey, date);
      picks.set(date, {
        filmId: winner.filmId,
        cooldownKey: winner.cooldownKey,
        score: sleeperScore(winner.letterboxdRating!, winner.tmdbVoteCount!),
        letterboxdRating: winner.letterboxdRating!,
        tmdbVoteCount: winner.tmdbVoteCount!,
        candidateCount: eligible.length,
        cooldownDaysApplied: cooldown,
      });
      break;
    }
  }

  return picks;
}
