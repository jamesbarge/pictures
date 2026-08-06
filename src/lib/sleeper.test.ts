import { describe, expect, it } from "vitest";

import {
  SLEEPER,
  compareCandidates,
  passesGates,
  selectPicksForHorizon,
  sleeperScore,
  type SleeperCandidate,
} from "./sleeper";

/**
 * Almost every row below is a REAL row from the production database with its
 * real TMDB vote_count, not a synthetic fixture. Where a value is invented it
 * says so. Keeping them real is the point: the thresholds were calibrated
 * against this distribution, so a threshold change that breaks a real film is
 * exactly the signal we want.
 */
function candidate(over: Partial<SleeperCandidate> = {}): SleeperCandidate {
  return {
    filmId: "f1",
    cooldownKey: "k1",
    letterboxdRating: 4.2,
    tmdbVoteCount: 500,
    isRepertory: true,
    contentType: "film",
    genres: ["drama"],
    ...over,
  };
}

describe("sleeperScore", () => {
  it("rewards obscurity: same rating, fewer votes scores higher", () => {
    expect(sleeperScore(4.2, 250)).toBeGreaterThan(sleeperScore(4.2, 2500));
  });

  it("charges 0.30 stars per order of magnitude of votes", () => {
    // 250 -> 2500 is exactly one decade, so the gap is exactly K.
    expect(sleeperScore(4.2, 250) - sleeperScore(4.2, 2500)).toBeCloseTo(SLEEPER.K, 10);
  });

  describe("numeric safety", () => {
    // The real "Harakiri" row has vote_count 0. log10(0) is -Infinity in JS and
    // a hard ERROR in Postgres, so an unguarded score would be +Infinity and
    // win every day forever.
    it.each([
      ["zero votes (real Harakiri row)", 4.68, 0],
      ["negative votes (impossible, but cheap to guard)", 4.68, -1],
    ])("%s stays finite", (_label, rating, votes) => {
      const score = sleeperScore(rating, votes);
      expect(Number.isFinite(score)).toBe(true);
    });
  });
});

describe("passesGates", () => {
  describe("real films at the threshold boundaries", () => {
    it.each([
      // label,                              rating, votes, expected
      ["Harakiri — cross-wired TMDB match",    4.68,     0, false],
      ["Personal Problems",                    4.03,     9, false],
      ["Handsworth Songs",                     3.87,    11, false],
      ["Mahjong",                              4.0,     47, false],
      ["Made in Hong Kong — nearest miss",     4.13,   124, false],
      ["The Mother and the Whore — nearest pass", 4.18, 202, true],
      ["The Human Condition Pt 3 — archetype", 4.58,   217, true],
      ["Alice Doesn't Live Here Anymore",      3.81,   546, true],
      ["Do the Right Thing — last in",         4.4,   2028, true],
      ["Stalker — nearest miss above ceiling", 4.4,   2544, false],
      ["8½",                                   4.28,  2556, false],
      ["Seven Samurai — canon",                4.6,   4298, false],
      ["Interstellar — blockbuster",           4.43, 40612, false],
    ])("%s -> %s", (_label, letterboxdRating, tmdbVoteCount, expected) => {
      expect(passesGates(candidate({ letterboxdRating, tmdbVoteCount }))).toBe(expected);
    });
  });

  describe("quality floor", () => {
    it.each([
      ["exactly at the floor", SLEEPER.MIN_LETTERBOXD_RATING, true],
      ["a hair below", SLEEPER.MIN_LETTERBOXD_RATING - 0.01, false],
    ])("%s", (_label, letterboxdRating, expected) => {
      expect(passesGates(candidate({ letterboxdRating }))).toBe(expected);
    });
  });

  describe("vote-count band is inclusive at both ends", () => {
    it.each([
      ["at the credibility floor", SLEEPER.MIN_VOTE_COUNT, true],
      ["one below the floor", SLEEPER.MIN_VOTE_COUNT - 1, false],
      ["at the obscurity ceiling", SLEEPER.MAX_VOTE_COUNT, true],
      ["one above the ceiling", SLEEPER.MAX_VOTE_COUNT + 1, false],
    ])("%s", (_label, tmdbVoteCount, expected) => {
      expect(passesGates(candidate({ tmdbVoteCount }))).toBe(expected);
    });
  });

  describe("categorical gates", () => {
    it("rejects non-repertory films", () => {
      expect(passesGates(candidate({ isRepertory: false }))).toBe(false);
    });

    it("rejects non-film content types", () => {
      expect(passesGates(candidate({ contentType: "event" }))).toBe(false);
      expect(passesGates(candidate({ contentType: "live_broadcast" }))).toBe(false);
    });

    it("treats a null content type as a film (column default is 'film')", () => {
      expect(passesGates(candidate({ contentType: null }))).toBe(true);
    });

    it("rejects either signal being missing", () => {
      expect(passesGates(candidate({ letterboxdRating: null }))).toBe(false);
      expect(passesGates(candidate({ tmdbVoteCount: null }))).toBe(false);
    });
  });

  describe("documentary exclusion", () => {
    // Genres are lowercased at write time (film-matching.ts), but compare
    // case-insensitively so a future writer that forgets cannot silently
    // disable this gate.
    it.each([["documentary"], ["Documentary"], ["DOCUMENTARY"]])(
      "rejects genre %s",
      (genre) => {
        expect(passesGates(candidate({ genres: [genre] }))).toBe(false);
      },
    );

    it("rejects when documentary is one genre among several", () => {
      expect(passesGates(candidate({ genres: ["music", "documentary"] }))).toBe(false);
    });

    it("does not reject on a substring match", () => {
      expect(passesGates(candidate({ genres: ["docudrama"] }))).toBe(true);
    });

    it("allows films with no genres recorded", () => {
      expect(passesGates(candidate({ genres: [] }))).toBe(true);
    });
  });
});

describe("compareCandidates", () => {
  const better = (
    a: [number, number],
    b: [number, number],
  ): boolean =>
    compareCandidates(
      candidate({ filmId: "a", letterboxdRating: a[0], tmdbVoteCount: a[1] }),
      candidate({ filmId: "b", letterboxdRating: b[0], tmdbVoteCount: b[1] }),
    ) < 0;

  // These two pairs are the reason K is 0.30 — they bracket it from both
  // sides. If either flips, K has drifted out of its defensible interval.
  it("pins K from below: Punishment Park beats Do the Right Thing", () => {
    // ΔLB 0.24 over Δlog10 0.9954 — flips at K = 0.241.
    expect(better([4.16, 205], [4.4, 2028])).toBe(true);
  });

  it("pins K from above: Andrei Rublev beats Tampopo", () => {
    // ΔLB 0.12 over Δlog10 0.3365 — flips at K = 0.357.
    expect(better([4.44, 959], [4.32, 442])).toBe(true);
  });

  it("lets quality decide when obscurity is near-equal", () => {
    // The Human Condition Pt 3 (217) vs I Am Cuba (255).
    expect(better([4.58, 217], [4.46, 255])).toBe(true);
  });

  it("lets obscurity decide when quality is near-equal", () => {
    // Punishment Park (205) vs Nostalghia (611).
    expect(better([4.16, 205], [4.28, 611])).toBe(true);
  });

  describe("total ordering", () => {
    it("breaks a score tie toward the more obscure film", () => {
      expect(better([4.2, 300], [4.2, 900])).toBe(true);
    });

    it("breaks a full tie deterministically by filmId", () => {
      const a = candidate({ filmId: "aaa" });
      const b = candidate({ filmId: "bbb" });
      expect(compareCandidates(a, b)).toBeLessThan(0);
      expect(compareCandidates(b, a)).toBeGreaterThan(0);
    });

    it("sorts identically regardless of input order", () => {
      // The same ISR payload is rendered more than once; two renders must not
      // disagree about which film is the sleeper.
      const films = [
        candidate({ filmId: "a", letterboxdRating: 4.2, tmdbVoteCount: 500 }),
        candidate({ filmId: "b", letterboxdRating: 4.2, tmdbVoteCount: 500 }),
        candidate({ filmId: "c", letterboxdRating: 4.5, tmdbVoteCount: 2000 }),
      ];
      const forward = [...films].sort(compareCandidates).map((f) => f.filmId);
      const reversed = [...films].reverse().sort(compareCandidates).map((f) => f.filmId);
      expect(forward).toEqual(reversed);
    });
  });
});

describe("selectPicksForHorizon", () => {
  const DATES = ["2026-08-06", "2026-08-07", "2026-08-08"];

  it("picks the best gate-passing candidate for each day", () => {
    const picks = selectPicksForHorizon(
      DATES.slice(0, 1),
      new Map([
        [
          "2026-08-06",
          [
            candidate({ filmId: "canon", cooldownKey: "canon", letterboxdRating: 4.6, tmdbVoteCount: 2400 }),
            candidate({ filmId: "buried", cooldownKey: "buried", letterboxdRating: 4.4, tmdbVoteCount: 250 }),
          ],
        ],
      ]),
      new Map(),
    );
    expect(picks.get("2026-08-06")?.filmId).toBe("buried");
    expect(picks.get("2026-08-06")?.candidateCount).toBe(2);
    expect(picks.get("2026-08-06")?.cooldownDaysApplied).toBe(SLEEPER.COOLDOWN_DAYS);
  });

  it("omits days with no gate-passing candidate rather than lowering the bar", () => {
    const picks = selectPicksForHorizon(
      DATES.slice(0, 1),
      // Both fail: one is a documentary, one is over the ceiling.
      new Map([
        [
          "2026-08-06",
          [
            candidate({ filmId: "doc", genres: ["documentary"] }),
            candidate({ filmId: "canon", tmdbVoteCount: 9000 }),
          ],
        ],
      ]),
      new Map(),
    );
    expect(picks.has("2026-08-06")).toBe(false);
  });

  it("does not repeat a film inside the cooldown window", () => {
    // One strong film screening every day, plus a weaker alternative.
    const daily = [
      candidate({ filmId: "strong", cooldownKey: "strong", letterboxdRating: 4.5, tmdbVoteCount: 250 }),
      candidate({ filmId: "weaker", cooldownKey: "weaker", letterboxdRating: 4.0, tmdbVoteCount: 400 }),
    ];
    const picks = selectPicksForHorizon(
      DATES,
      new Map(DATES.map((d) => [d, daily])),
      new Map(),
    );
    expect(picks.get("2026-08-06")?.filmId).toBe("strong");
    expect(picks.get("2026-08-07")?.filmId).toBe("weaker");
    // Day three has nothing left inside the full cooldown, so the ladder fires.
    expect(picks.get("2026-08-08")?.filmId).toBe("strong");
    expect(picks.get("2026-08-08")?.cooldownDaysApplied).toBe(0);
  });

  it("honours cooldown state carried in from past picks", () => {
    const picks = selectPicksForHorizon(
      DATES.slice(0, 1),
      new Map([
        [
          "2026-08-06",
          [
            candidate({ filmId: "recent", cooldownKey: "recent", letterboxdRating: 4.5, tmdbVoteCount: 250 }),
            candidate({ filmId: "fresh", cooldownKey: "fresh", letterboxdRating: 4.0, tmdbVoteCount: 400 }),
          ],
        ],
      ]),
      // "recent" won three days ago, well inside the 21-day cooldown.
      new Map([["recent", "2026-08-03"]]),
    );
    expect(picks.get("2026-08-06")?.filmId).toBe("fresh");
  });

  it("allows a repeat once the cooldown has fully elapsed", () => {
    const picks = selectPicksForHorizon(
      ["2026-08-06"],
      new Map([["2026-08-06", [candidate({ filmId: "old", cooldownKey: "old" })]]]),
      // Exactly COOLDOWN_DAYS earlier — the boundary is inclusive.
      new Map([["old", "2026-07-16"]]),
    );
    expect(picks.get("2026-08-06")?.filmId).toBe("old");
    expect(picks.get("2026-08-06")?.cooldownDaysApplied).toBe(SLEEPER.COOLDOWN_DAYS);
  });

  describe("alreadyPicked (frozen rows / stored neighbours)", () => {
    // Regression: the weekly refresh does NOT rewrite picks inside 7 days, so
    // those days' real films must still consume their cooldown. Before this,
    // the cooldown was enforced against films the run merely imagined for those
    // days, and a film frozen at day 5 was free to win again at day 12 —
    // breaking the 21-day guarantee that is the whole reason daily_picks is a
    // table.
    it("registers a fixed date's film in the cooldown", () => {
      const strong = candidate({
        filmId: "strong",
        cooldownKey: "strong",
        letterboxdRating: 4.5,
        tmdbVoteCount: 250,
      });
      const other = candidate({
        filmId: "other",
        cooldownKey: "other",
        letterboxdRating: 4.0,
        tmdbVoteCount: 400,
      });
      const dates = ["2026-08-06", "2026-08-07"];

      const picks = selectPicksForHorizon(
        dates,
        new Map(dates.map((d) => [d, [strong, other]])),
        new Map(),
        // Day one is frozen to the WEAKER film — which is the whole point. Left
        // to itself the algorithm would have picked "strong" on day one and
        // "other" on day two; honouring the frozen row inverts that. Asserting
        // "strong" on day two therefore fails against a version that ignores
        // `alreadyPicked`, which asserting "other" would not.
        new Map([["2026-08-06", "other"]]),
      );

      expect(picks.get("2026-08-07")?.filmId).toBe("strong");
      expect(picks.get("2026-08-07")?.cooldownDaysApplied).toBe(SLEEPER.COOLDOWN_DAYS);
    });

    it("never emits a pick for a date that was already decided", () => {
      const picks = selectPicksForHorizon(
        ["2026-08-06"],
        new Map([["2026-08-06", [candidate()]]]),
        new Map(),
        new Map([["2026-08-06", "whatever"]]),
      );
      expect(picks.has("2026-08-06")).toBe(false);
    });
  });

  describe("degraded cooldown tiers prefer staleness over score", () => {
    // Once the full cooldown is relaxed we are already starving, and the
    // failure users actually notice is the same film two days running. So below
    // the top tier the least-recently-picked candidate wins even if a slightly
    // stronger one is available.
    it("prefers the staler film when the cooldown is waived", () => {
      const yesterday = candidate({
        filmId: "yesterday",
        cooldownKey: "yesterday",
        letterboxdRating: 4.5,
        tmdbVoteCount: 250,
      });
      const staler = candidate({
        filmId: "staler",
        cooldownKey: "staler",
        letterboxdRating: 4.4,
        tmdbVoteCount: 250,
      });

      const picks = selectPicksForHorizon(
        ["2026-08-06"],
        new Map([["2026-08-06", [yesterday, staler]]]),
        new Map([
          ["yesterday", "2026-08-05"], // 1 day ago
          ["staler", "2026-07-28"], // 9 days ago
        ]),
      );

      // `yesterday` outscores `staler`, but repeating it back-to-back is the
      // worse outcome.
      expect(picks.get("2026-08-06")?.filmId).toBe("staler");
      expect(picks.get("2026-08-06")?.cooldownDaysApplied).toBe(0);
    });

    it("still uses score at the full cooldown tier", () => {
      const picks = selectPicksForHorizon(
        ["2026-08-06"],
        new Map([
          [
            "2026-08-06",
            [
              candidate({ filmId: "weak", cooldownKey: "weak", letterboxdRating: 4.0, tmdbVoteCount: 400 }),
              candidate({ filmId: "best", cooldownKey: "best", letterboxdRating: 4.5, tmdbVoteCount: 250 }),
            ],
          ],
        ]),
        new Map(),
      );
      expect(picks.get("2026-08-06")?.filmId).toBe("best");
    });
  });

  it("deduplicates a film that exists under two ids via cooldownKey", () => {
    // Real hazard: 115 duplicate-letterboxd_slug groups in this database, e.g.
    // "Kamikaze Girls" and "Japanese Film Club: Kamikaze Girls".
    const twoRowsOneFilm = [
      candidate({ filmId: "row-a", cooldownKey: "kamikaze-girls", letterboxdRating: 4.5, tmdbVoteCount: 250 }),
      candidate({ filmId: "row-b", cooldownKey: "kamikaze-girls", letterboxdRating: 4.5, tmdbVoteCount: 251 }),
    ];
    const picks = selectPicksForHorizon(
      DATES.slice(0, 2),
      new Map(DATES.slice(0, 2).map((d) => [d, twoRowsOneFilm])),
      new Map(),
    );
    // Day two must NOT pick the same film again under its other id at full cooldown.
    expect(picks.get("2026-08-07")?.cooldownDaysApplied).toBe(0);
  });
});
