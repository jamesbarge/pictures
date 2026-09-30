/**
 * Failed-run recording when a venue cannot be initialised.
 *
 * The multi and chain branches both write a failed `scraper_runs` row when
 * `ensureCinemaExists` throws. The single-venue branch logged the failure and
 * pushed a venue result but never attempted the record, so a venue that only
 * ever runs standalone stayed invisible to `detectSilentBreakers` and
 * `detectStaleCinemas`, which is the same blind spot the coldharbour change
 * closed.
 *
 * Recording is best-effort by construction: `recordScraperRun` returns early
 * when `isDatabaseAvailable` is false and swallows its own errors, and
 * `getBaseline` returns null on any failure. These tests assert the attempt and
 * that a recording failure cannot flip the run's outcome. They do not assert a
 * row was written.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const runInserts: Array<Record<string, unknown>> = [];
let insertShouldThrow = false;

vi.mock("../db", () => {
  const emptyChain = {
    from: () => emptyChain,
    where: () => emptyChain,
    limit: async () => [],
  };
  return {
    db: {
      select: () => emptyChain,
      insert: () => ({
        values: async (values: Record<string, unknown>) => {
          if (insertShouldThrow) throw new Error("no such cinema row");
          runInserts.push(values);
        },
      }),
    },
    isDatabaseAvailable: true,
  };
});

vi.mock("./pipeline", () => ({
  processScreenings: vi.fn(async () => ({ added: 0, updated: 0, failed: 0, blocked: false })),
  saveScreenings: vi.fn(async () => ({ added: 0, blocked: false })),
  ensureCinemaExists: vi.fn(async () => {}),
}));

import { runScraper, type SingleVenueConfig } from "./runner-factory";
import { ensureCinemaExists } from "./pipeline";
import type { CinemaScraper } from "./types";

const brokenVenueConfig: SingleVenueConfig = {
  type: "single",
  venue: { id: "made-up-venue", name: "Made Up", shortName: "mu" },
  createScraper: () => ({ scrape: vi.fn(async () => []) }) as unknown as CinemaScraper,
};

beforeEach(() => {
  runInserts.length = 0;
  insertShouldThrow = false;
  vi.mocked(ensureCinemaExists).mockReset();
  vi.mocked(ensureCinemaExists).mockRejectedValue(
    new Error('Cinema "made-up-venue" is not in the cinema registry'),
  );
});

describe("single-venue initialisation failure", () => {
  it("attempts a failed scraper_runs record, as the other branches do", async () => {
    const result = await runScraper(brokenVenueConfig, { useValidation: true });

    expect(result.success).toBe(false);
    expect(runInserts).toHaveLength(1);
    expect(runInserts[0]).toMatchObject({ cinemaId: "made-up-venue", status: "failed" });
    expect(runInserts[0].anomalyDetails).toMatchObject({
      errorMessage: expect.stringContaining("not in the cinema registry"),
    });
  });

  it("still reports failure when the recording itself fails", async () => {
    insertShouldThrow = true;

    const result = await runScraper(brokenVenueConfig, { useValidation: true });

    expect(result.success).toBe(false);
    expect(result.totalVenuesFailed).toBe(1);
    expect(result.venueResults[0]).toMatchObject({
      venueId: "made-up-venue",
      success: false,
    });
    expect(runInserts).toHaveLength(0);
  });
});
