import { describe, it, expect } from "vitest";
import { buildRequest, trimSynopsis, RELATIONSHIP_LEVELS, type CandidatePair } from "./questions";
import { decideFromAnswers, decideFromCurrentRules, type PairAnswers } from "./policy";
import { MODEL } from "../typesafe-experiments/types";

/**
 * Dedup judgement — decision-layer tests.
 *
 * These pin the four domain rules set on 2026-09-22 (restoration merges,
 * dub merges, director's cut merges, double bill stays separate) and the
 * baseline behaviour the harness diffs against. No network, no DB.
 */

function pair(over: Partial<CandidatePair> = {}): CandidatePair {
  const side = {
    title: "Blue Velvet",
    year: 1986,
    tmdbId: 793,
    directors: ["David Lynch"],
    runtime: 120,
    synopsis: null,
    venues: ["Prince Charles Cinema"],
    screeningCount: 4,
  };
  return {
    leftId: "a",
    rightId: "b",
    left: { ...side },
    right: { ...side, year: 2011, tmdbId: 680713 },
    trigramSimilarity: 1,
    ...over,
  };
}

function answers(over: Partial<PairAnswers> = {}): PairAnswers {
  return {
    relationship: { score: 2, confidence: 0.9, probabilities: { "0": 0.02, "1": 0.08, "2": 0.9 } },
    same_underlying_work: { noul: 0.95 },
    is_remake_pair: { noul: 0.02 },
    either_is_double_bill: { noul: 0.01 },
    either_is_not_a_film: { noul: 0.01 },
    disagree_on_instalment: { noul: 0.01 },
    ...over,
  };
}

describe("RELATIONSHIP_LEVELS", () => {
  it("is ordered different -> related -> same", () => {
    expect(RELATIONSHIP_LEVELS.map((l) => l.level)).toEqual([
      "different films",
      "related, a person should decide",
      "same film",
    ]);
  });

  it("puts restorations, dubs and director's cuts under 'same film'", () => {
    const same = RELATIONSHIP_LEVELS[2].includes.join(" ").toLowerCase();
    expect(same).toContain("restoration");
    expect(same).toContain("dubbed");
    expect(same).toContain("director's cut");
  });

  it("puts remakes under 'different films'", () => {
    expect(RELATIONSHIP_LEVELS[0].includes.join(" ").toLowerCase()).toContain("remake");
  });
});

describe("trimSynopsis", () => {
  it("passes short text through and collapses whitespace", () => {
    expect(trimSynopsis("A  small\ntown.")).toBe("A small town.");
  });

  it("truncates on a word boundary", () => {
    const long = `${"word ".repeat(200)}`;
    const out = trimSynopsis(long, 40)!;
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out.endsWith("…")).toBe(true);
  });

  it("returns null for null", () => {
    expect(trimSynopsis(null)).toBeNull();
  });
});

describe("buildRequest", () => {
  it("asks all six questions in one request", () => {
    expect(Object.keys(buildRequest(pair()).questions).sort()).toEqual([
      "disagree_on_instalment",
      "either_is_double_bill",
      "either_is_not_a_film",
      "is_remake_pair",
      "relationship",
      "same_underlying_work",
    ]);
  });

  it("sends both sides as named state fields", () => {
    const state = buildRequest(pair()).state as Record<string, Record<string, unknown>>;
    expect(state.left.title).toBe("Blue Velvet");
    expect(state.right.tmdb_id).toBe(680713);
  });

  it("pins the model version so cached runs stay comparable", () => {
    expect(buildRequest(pair()).model).toBe(MODEL);
  });
});

describe("decideFromCurrentRules — the baseline being replaced", () => {
  it("rejects the Blue Velvet pair on the year window despite identical titles", () => {
    const d = decideFromCurrentRules(pair());
    expect(d.action).toBe("leave_unlinked");
    expect(d.reason).toContain("year gap");
  });

  it("rejects a short title below its length-aware threshold", () => {
    const d = decideFromCurrentRules(
      pair({ left: { ...pair().left, title: "Drive", year: null }, trigramSimilarity: 0.7 })
    );
    expect(d.action).toBe("leave_unlinked");
    expect(d.reason).toContain("0.78");
  });

  it("merges when both gates pass", () => {
    const p = pair();
    p.right.year = 1986;
    expect(decideFromCurrentRules(p).action).toBe("merge");
  });

  it("has no middle outcome", () => {
    const actions = [pair(), pair({ trigramSimilarity: 0.5 })].map(
      (p) => decideFromCurrentRules(p).action
    );
    expect(actions).not.toContain("review");
  });
});

describe("decideFromAnswers", () => {
  it("merges a restoration pair the year window rejects", () => {
    expect(decideFromAnswers(answers()).action).toBe("merge");
  });

  it("never merges a double bill, however confident the score", () => {
    const d = decideFromAnswers(answers({ either_is_double_bill: { noul: 0.8 } }));
    expect(d.action).toBe("leave_unlinked");
    expect(d.reason).toContain("double bill");
  });

  it("never merges a remake and its original", () => {
    expect(decideFromAnswers(answers({ is_remake_pair: { noul: 0.9 } })).action).toBe(
      "leave_unlinked"
    );
  });

  it("never merges across an instalment disagreement", () => {
    expect(
      decideFromAnswers(answers({ disagree_on_instalment: { noul: 0.7 } })).action
    ).toBe("leave_unlinked");
  });

  it("routes a non-film row to review rather than dropping it", () => {
    expect(decideFromAnswers(answers({ either_is_not_a_film: { noul: 0.8 } })).action).toBe(
      "review"
    );
  });

  it("sends a low-confidence 'same film' to review", () => {
    const d = decideFromAnswers(
      answers({ relationship: { score: 2, confidence: 0.4, probabilities: {} } })
    );
    expect(d.action).toBe("review");
    expect(d.reason).toContain("confidence");
  });

  it("sends a 'same film' score to review when the same-work check disagrees", () => {
    const d = decideFromAnswers(answers({ same_underlying_work: { noul: 0.2 } }));
    expect(d.action).toBe("review");
    expect(d.reason).toContain("same-work check");
  });

  it("routes the middle level to a person", () => {
    expect(
      decideFromAnswers(answers({ relationship: { score: 1.2, confidence: 0.8, probabilities: {} } }))
        .action
    ).toBe("review");
  });

  it("leaves different films unlinked", () => {
    expect(
      decideFromAnswers(answers({ relationship: { score: 0.1, confidence: 0.9, probabilities: {} } }))
        .action
    ).toBe("leave_unlinked");
  });
});

describe("decideFromAnswers — veto ordering", () => {
  it("reports 'different films' rather than the non-film veto when the score is at level 0", () => {
    // Regression: Imitation of Life (1959, tmdb 34148) against a 2016 record
    // scored 0.04 at 0.94 confidence, and the non-film veto ran first and
    // buried that behind a misleading reason.
    const d = decideFromAnswers(
      answers({
        relationship: { score: 0.04, confidence: 0.94, probabilities: {} },
        either_is_not_a_film: { noul: 0.8 },
      })
    );
    expect(d.action).toBe("leave_unlinked");
    expect(d.reason).toBe("different films");
  });

  it("still catches a non-film pair the score did not separate", () => {
    const d = decideFromAnswers(
      answers({
        relationship: { score: 1.1, confidence: 0.8, probabilities: {} },
        either_is_not_a_film: { noul: 0.8 },
      })
    );
    expect(d.action).toBe("review");
    expect(d.reason).toContain("does not look like a film");
  });
});
