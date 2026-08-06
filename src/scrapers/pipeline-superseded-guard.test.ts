/**
 * Superseded-cleanup guard for accidentally-partial batches.
 *
 * cleanupSupersededScreenings() deletes a previously-scraped screening when a
 * NEWLY-written row exists for the same film, on the same London date, within
 * 3 hours. That is only sound when the batch just written is the venue's
 * COMPLETE current listing.
 *
 * Two ways a batch can be incomplete:
 *   1. By design — the L-CUT gap-fill writes only the screenings we're missing.
 *      Callers pass { skipSupersededCleanup: true }. Already handled.
 *   2. By accident — writes failed. A venue with 217 screenings that only
 *      persisted 200 (Supabase pooler contention → `timeout after 15000ms
 *      (client-side)`) is a partial batch with the guard OFF. If a film had two
 *      showings that day inside the 3h window and only one insert landed, the
 *      surviving old row for the other showing is deleted as "superseded" even
 *      though its replacement never arrived.
 *
 * Case 2 is what these tests pin down. Observed on 2026-08-05 (rich-mix 17
 * failed writes, electric-portobello 14) and previously on 2026-06-11
 * (electric-white-city, 19 screenings) which is what motivated the deferred-write
 * retry queue — the retry reduced the frequency but never closed the
 * cleanup-on-partial-batch hole.
 *
 * Note `rejected` (validation failures) deliberately does NOT block cleanup:
 * routine rejections are common enough that guarding on them would disable the
 * cleanup permanently, and rejected rows are invalid data we never want stored.
 */
import { describe, it, expect } from "vitest";

import { shouldRunSupersededCleanup } from "./pipeline";

/** A clean, complete venue write — the only shape that should permit cleanup. */
const cleanResult = { added: 120, updated: 30, failed: 0, blocked: false };

describe("shouldRunSupersededCleanup", () => {
  it("runs for a clean, complete batch that wrote something", () => {
    expect(shouldRunSupersededCleanup(cleanResult, {})).toBe(true);
  });

  it("defaults options to {} so callers may omit them", () => {
    expect(shouldRunSupersededCleanup(cleanResult)).toBe(true);
  });

  describe("partial by design", () => {
    it("does not run when the caller opts out (L-CUT gap-fill)", () => {
      expect(shouldRunSupersededCleanup(cleanResult, { skipSupersededCleanup: true })).toBe(false);
    });
  });

  describe("partial by accident — the 2026-08-05 hole", () => {
    it("does not run when any write failed, even alongside many successes", () => {
      // rich-mix shape: most screenings landed, 17 timed out terminally.
      expect(
        shouldRunSupersededCleanup({ added: 200, updated: 0, failed: 17, blocked: false }, {}),
      ).toBe(false);
    });

    it("does not run when a single write failed", () => {
      expect(
        shouldRunSupersededCleanup({ added: 120, updated: 30, failed: 1, blocked: false }, {}),
      ).toBe(false);
    });

    it("does not run when every write failed", () => {
      expect(
        shouldRunSupersededCleanup({ added: 0, updated: 0, failed: 50, blocked: false }, {}),
      ).toBe(false);
    });
  });

  describe("pre-existing conditions still hold", () => {
    it("does not run when the scrape was blocked by the diff check", () => {
      expect(
        shouldRunSupersededCleanup({ added: 120, updated: 30, failed: 0, blocked: true }, {}),
      ).toBe(false);
    });

    it("does not run when nothing was written", () => {
      expect(
        shouldRunSupersededCleanup({ added: 0, updated: 0, failed: 0, blocked: false }, {}),
      ).toBe(false);
    });

    it("runs when only updates landed (no new rows)", () => {
      expect(
        shouldRunSupersededCleanup({ added: 0, updated: 5, failed: 0, blocked: false }, {}),
      ).toBe(true);
    });
  });

  describe("validation rejections do not block", () => {
    // The diff's most contestable design decision, so pin it rather than leave
    // it to prose. `past_screening` is a rejection *error*, and scrapers routinely
    // return today's earlier showings, so `rejected > 0` on essentially every run
    // — guarding on it would disable the cleanup close to permanently. Past and
    // too-far-future rejections are also harmless to this DELETE, which only
    // touches `datetime >= NOW()`.
    //
    // Declared as a variable, not an inline literal: `rejected` is not part of the
    // predicate's parameter type, and TypeScript's excess-property check only
    // applies to fresh object literals. This is deliberately the full
    // PipelineResult-ish shape a real caller passes.
    const withRejections = { added: 120, updated: 30, failed: 0, rejected: 12, blocked: false };

    it("still runs when screenings were rejected by validation", () => {
      expect(shouldRunSupersededCleanup(withRejections, {})).toBe(true);
    });

    it("does not run when rejections coexist with a failed write", () => {
      const both = { added: 120, updated: 30, failed: 1, rejected: 12, blocked: false };
      expect(shouldRunSupersededCleanup(both, {})).toBe(false);
    });
  });

  describe("guard precedence", () => {
    it("a failed write blocks cleanup even when the caller did not opt out", () => {
      expect(
        shouldRunSupersededCleanup(
          { added: 1, updated: 0, failed: 1, blocked: false },
          { skipSupersededCleanup: false },
        ),
      ).toBe(false);
    });
  });
});
