/**
 * Dedup judgement — decision layer.
 *
 * Holds two functions that turn signals into an action:
 *   - `decideFromCurrentRules()`  what src/lib/film-similarity.ts does today
 *   - `decideFromAnswers()`       what the TypeSafe answers say to do
 *
 * Keeping policy here (and out of questions.ts) means a weight or a veto can
 * change without re-running inference, per the TypeSafe guidance on keeping
 * raw judgements reusable.
 */

import { trigramThresholdFor, violatesYearWindow } from "../../src/lib/film-similarity";
import type { CandidatePair } from "./questions";

export type Action = "merge" | "review" | "leave_unlinked";

export interface Decision {
  action: Action;
  /** Short human-readable cause, for the report. */
  reason: string;
}

/**
 * Reproduce today's behaviour for a pair.
 *
 * `findSimilarFilmsByTitle` shortlists on trigram score, then the caller
 * applies the length-aware threshold and the year window. There is no middle
 * outcome: a pair either clears both gates or it is dropped.
 */
export function decideFromCurrentRules(pair: CandidatePair): Decision {
  const words = pair.left.title.trim().split(/\s+/).filter(Boolean).length;
  const required = trigramThresholdFor(words);

  if (pair.trigramSimilarity < required) {
    return {
      action: "leave_unlinked",
      reason: `trigram ${pair.trigramSimilarity.toFixed(2)} below ${required} for a ${words}-word title`,
    };
  }
  if (violatesYearWindow(pair.left.year, pair.right.year)) {
    return {
      action: "leave_unlinked",
      reason: `year gap ${Math.abs((pair.left.year ?? 0) - (pair.right.year ?? 0))} exceeds MAX_YEAR_DELTA`,
    };
  }
  return {
    action: "merge",
    reason: `trigram ${pair.trigramSimilarity.toFixed(2)} clears ${required}, year window ok`,
  };
}

/** The answers TypeSafe returns for one pair. */
export interface PairAnswers {
  relationship: { score: number; confidence: number; probabilities: Record<string, number> };
  same_underlying_work: { noul: number };
  is_remake_pair: { noul: number };
  either_is_double_bill: { noul: number };
  either_is_not_a_film: { noul: number };
  disagree_on_instalment: { noul: number };
}

/**
 * Thresholds for the vetoes and the merge gate.
 *
 * These are policy, evaluated on our own data, so they live in one object the
 * harness can sweep. The Score itself needs no threshold: its three levels are
 * the three actions, so rounding is the decision.
 */
export const POLICY = {
  /** A Noul at or above this counts as a veto. */
  vetoAt: 0.5,
  /** Score confidence below this sends an otherwise-clear merge to review. */
  minMergeConfidence: 0.7,
} as const;

export function decideFromAnswers(a: PairAnswers, policy = POLICY): Decision {
  // Hard vetoes first. A double bill is its own entity, so it never merges
  // into a single-film record however similar the titles look.
  if (a.either_is_double_bill.noul >= policy.vetoAt) {
    return { action: "leave_unlinked", reason: "one side is a double bill, which is its own entity" };
  }
  if (a.disagree_on_instalment.noul >= policy.vetoAt) {
    return { action: "leave_unlinked", reason: "titles disagree on the instalment number" };
  }
  if (a.is_remake_pair.noul >= policy.vetoAt) {
    return { action: "leave_unlinked", reason: "a remake and its original are different films" };
  }

  // Round the Score to the nearest level: 0 different, 1 related, 2 same.
  const level = Math.round(a.relationship.score);

  // Settle "different films" before the non-film check. When the Score has
  // already put the pair at level 0 there is nothing to merge, so whether one
  // side is a film is a separate data-quality question and reporting it here
  // buries the real reason. Ordering this the other way round mislabelled
  // Imitation of Life (1959 vs a 2016 record) as "one side does not look like
  // a film" when the Score said different films at 0.94 confidence.
  if (level === 0) {
    return { action: "leave_unlinked", reason: "different films" };
  }

  // A non-film row is a data-quality problem rather than a dedup one. Route it
  // to a person instead of silently merging two placeholders together.
  if (a.either_is_not_a_film.noul >= policy.vetoAt) {
    return { action: "review", reason: "one side does not look like a film" };
  }

  if (level >= 2) {
    // The Score and the plain same-work check ask the same thing two ways. A
    // merge is the expensive mistake, so it needs both to agree.
    if (a.same_underlying_work.noul < policy.vetoAt) {
      return {
        action: "review",
        reason: `reads as the same film but the same-work check says ${a.same_underlying_work.noul.toFixed(2)}`,
      };
    }
    if (a.relationship.confidence < policy.minMergeConfidence) {
      return {
        action: "review",
        reason: `reads as the same film but confidence ${a.relationship.confidence.toFixed(2)} is below ${policy.minMergeConfidence}`,
      };
    }
    return { action: "merge", reason: "same film" };
  }
  return { action: "review", reason: "related, needs a person" };
}
