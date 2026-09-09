/**
 * Conservation and outcome-identity tests for `checkAccounting` itself.
 *
 * SCOPE, stated so nobody reads more into these than they prove. Every case
 * here builds a `ScreeningAccounting` literal and checks the checker's
 * arithmetic. That is all it tests. The counts are not produced by the code
 * that normally produces them.
 *
 * The seams that produce them are covered elsewhere:
 *   - `BaseScraper.validate()`, the real filter and its reason tally, and the
 *     `buildAccounting` assembly: `screening-accounting-seams.test.ts`.
 *   - The pipeline's write loop, its `settled` bookkeeping and the film-level
 *     catch, driven through the real `processScreenings`:
 *     `pipeline-festival-continuation.test.ts`.
 *
 * Not covered by any test: the `!filmId` early continue, the deferred-write
 * defer/retry seam inside a real `processScreenings` run, and the retry-budget
 * cutoff. `attemptScreeningWrite` and `retryDeferredWrites` are tested directly
 * in `pipeline-retry.test.ts`, and their interaction with `settled` is held by
 * review, not by a test.
 */
import { describe, expect, it } from "vitest";
import {
  UNAVAILABLE,
  checkAccounting,
  completedWrites,
  emptyWriteOutcomeCounts,
  formatAccounting,
  isAvailable,
  totalWrites,
  type ScreeningAccounting,
} from "./screening-accounting";

function accounting(overrides: Partial<ScreeningAccounting> = {}): ScreeningAccounting {
  return {
    cinemaId: "test-venue",
    fetchedPayloads: 1,
    parsed: 10,
    preFiltered: 2,
    preFilteredByReason: { past_screening: 2 },
    validationRejected: 1,
    validationRejectedByReason: { suspicious_time_early: 1 },
    accepted: 7,
    write: { upserted: 4, updated: 2, unchanged: 1, failed: 0 },
    postWriteFailures: 0,
    insertUpdateAttribution: UNAVAILABLE,
    affectedRowAttribution: UNAVAILABLE,
    supplementary: false,
    blocked: false,
    ...overrides,
  };
}

describe("unavailable is not zero", () => {
  it("keeps unavailable distinguishable from a measured zero", () => {
    expect(isAvailable(0)).toBe(true);
    expect(isAvailable(UNAVAILABLE)).toBe(false);
    expect(formatAccounting(accounting({ parsed: UNAVAILABLE }))).toContain("parsed=unavailable");
    expect(formatAccounting(accounting({ parsed: 0 }))).toContain("parsed=0");
  });

  it("always reports insert/update attribution as unavailable", () => {
    expect(formatAccounting(accounting())).toContain("insertUpdate=unavailable");
  });

  it("always reports affected-row attribution as unavailable", () => {
    // No write statement carries RETURNING or reads a row count, so neither
    // bucket can claim a row reached the table. The report must say so rather
    // than let `upserted` and `updated` be read as verified row changes.
    expect(formatAccounting(accounting())).toContain("affectedRows=unavailable");
    expect(accounting().affectedRowAttribution).toBe(UNAVAILABLE);
  });

  it("names the fetch unit as payloads, which are not HTTP requests", () => {
    expect(formatAccounting(accounting({ fetchedPayloads: 3 }))).toContain("payloads=3");
    expect(formatAccounting(accounting({ fetchedPayloads: UNAVAILABLE }))).toContain(
      "payloads=unavailable",
    );
  });
});

describe("conservation at each boundary", () => {
  it("accepts a fully reconciled venue", () => {
    expect(checkAccounting(accounting())).toEqual([]);
  });

  it("fails when pre-filter survivors do not split into accepted plus rejected", () => {
    // 10 parsed less 2 pre-filtered leaves 8 survivors, which must equal
    // accepted + validationRejected. Six accepted plus one rejected is seven.
    const problems = checkAccounting(
      accounting({ accepted: 6, write: { upserted: 4, updated: 1, unchanged: 1, failed: 0 } }),
    );
    expect(problems.map((p) => p.boundary)).toContain("validation");
  });

  it("fails when the pre-filter reason tally does not match its total", () => {
    const problems = checkAccounting(accounting({ preFilteredByReason: { past_screening: 1 } }));
    expect(problems.some((p) => p.boundary === "pre-filter")).toBe(true);
  });

  it("fails when accepted does not equal the write outcomes", () => {
    const problems = checkAccounting(
      accounting({ write: { upserted: 4, updated: 2, unchanged: 0, failed: 0 } }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0].boundary).toBe("write");
    expect(problems[0].message).toContain("accepted 7");
  });

  it("skips the parse boundary when parsed is unavailable, rather than inventing zero", () => {
    const problems = checkAccounting(
      accounting({ parsed: UNAVAILABLE, preFiltered: UNAVAILABLE, preFilteredByReason: {} }),
    );
    expect(problems).toEqual([]);
  });

  it("requires a blocked batch to report no completed or unchanged writes", () => {
    expect(checkAccounting(accounting({ blocked: true, accepted: 0, write: emptyWriteOutcomeCounts() })))
      .toEqual([]);
    const problems = checkAccounting(
      accounting({ blocked: true, accepted: 0, write: { upserted: 3, updated: 0, unchanged: 0, failed: 0 } }),
    );
    expect(problems.map((p) => p.boundary)).toEqual(["blocked"]);
  });

  it("refuses a blocked batch that claims candidates reached the write loop", () => {
    // Boundary 3 is skipped when blocked, so without the `accepted` term this
    // record passed clean: five candidates handed to a loop that never ran and
    // produced no outcome for any of them.
    const problems = checkAccounting(
      accounting({ blocked: true, accepted: 5, write: emptyWriteOutcomeCounts() }),
    );
    expect(problems.map((p) => p.boundary)).toEqual(["blocked"]);
    expect(problems[0].message).toContain("accepted 5");
  });

  it("refuses more post-write failures than completed write statements", () => {
    const problems = checkAccounting(accounting({ postWriteFailures: 99 }));
    expect(problems.some((p) => p.message.includes("exceeds completed write statements"))).toBe(true);
  });

  it("allows a validation reason tally above the rejected row count", () => {
    // One screening can carry several errors, so the tally is a sum over
    // errors and legitimately exceeds the row count.
    const problems = checkAccounting(
      accounting({
        validationRejectedByReason: { suspicious_time_early: 1, malformed_booking_url: 1 },
      }),
    );
    expect(problems).toEqual([]);
  });
});

describe("write outcome identities", () => {
  it("counts completed write statements as upserted plus updated, excluding skips", () => {
    const counts = { upserted: 4, updated: 2, unchanged: 5, failed: 3 };
    expect(completedWrites(counts)).toBe(6);
    expect(totalWrites(counts)).toBe(14);
  });

  it("treats an unchanged row as neither written nor failed", () => {
    const counts = { upserted: 0, updated: 0, unchanged: 1, failed: 0 };
    // Both sides derived, so neither restates a literal the test just wrote:
    // the row is counted (totalWrites sees it) but not as a completed write.
    expect(completedWrites(counts)).toBe(0);
    expect(totalWrites(counts) - completedWrites(counts)).toBe(1);
  });
});
