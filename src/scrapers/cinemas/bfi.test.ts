import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawScreening } from "../types";

// Mock loadBFIScreenings BEFORE importing the module under test.
const mockLoad = vi.fn();
vi.mock("../bfi-pdf", async (importOriginal) => {
  const real = await importOriginal<typeof import("../bfi-pdf")>();
  return {
    ...real,
    loadBFIScreenings: (...args: unknown[]) => mockLoad(...args),
  };
});

import {
  getOrLoadBFIScreenings,
  _resetBFIScreeningsCacheForTests,
} from "./bfi";

/**
 * Build a minimal but type-conformant RawScreening for fixture use. RawScreening
 * doesn't carry an explicit `cinemaId` field — the BFI PDF importer infers the
 * venue via `getBFIVenueKey()` from the booking URL. For these unit tests we
 * don't exercise that filter (we test the cache/yield-gate, not venue
 * routing), so the booking URL is left generic.
 */
function fixtureScreening(filmTitle: string): RawScreening {
  return {
    filmTitle,
    datetime: new Date("2026-06-01T19:00:00Z"),
    bookingUrl: "https://whatson.bfi.org.uk/Online/x",
  };
}

describe("getOrLoadBFIScreenings — yield gate + cache busting", () => {
  beforeEach(() => {
    mockLoad.mockReset();
    _resetBFIScreeningsCacheForTests();
  });

  it("returns screenings when PDF source succeeds", async () => {
    mockLoad.mockResolvedValueOnce({
      screenings: [fixtureScreening("Apocalypse Now")],
      pdfInfo: undefined,
      sourceStatus: { pdf: "success", programmeChanges: "empty" },
    });
    const out = await getOrLoadBFIScreenings();
    expect(out).toHaveLength(1);
  });

  it("returns screenings when programme-changes succeeds even if PDF empty", async () => {
    mockLoad.mockResolvedValueOnce({
      screenings: [fixtureScreening("Stalker")],
      pdfInfo: undefined,
      sourceStatus: { pdf: "empty", programmeChanges: "success" },
    });
    await expect(getOrLoadBFIScreenings()).resolves.toHaveLength(1);
  });

  it("throws (not returns []) when BOTH sources fail — preserves the truth in scraper_runs", async () => {
    mockLoad.mockResolvedValueOnce({
      screenings: [],
      pdfInfo: undefined,
      sourceStatus: { pdf: "failed", programmeChanges: "failed" },
    });
    await expect(getOrLoadBFIScreenings()).rejects.toThrow(/BFI upstream load failed/);
  });

  it("throws when both sources report empty (Cloudflare → empty page → no PDFs)", async () => {
    mockLoad.mockResolvedValueOnce({
      screenings: [],
      pdfInfo: undefined,
      sourceStatus: { pdf: "empty", programmeChanges: "empty" },
    });
    await expect(getOrLoadBFIScreenings()).rejects.toThrow(/BFI upstream load failed/);
  });

  it("does NOT cache failures — the second BFI venue gets a fresh attempt", async () => {
    // First call: simulate the Cloudflare-blocked discovery
    mockLoad.mockResolvedValueOnce({
      screenings: [],
      pdfInfo: undefined,
      sourceStatus: { pdf: "failed", programmeChanges: "failed" },
    });
    await expect(getOrLoadBFIScreenings()).rejects.toThrow();

    // Second call: simulate a recovery on the next venue's invocation
    mockLoad.mockResolvedValueOnce({
      screenings: [fixtureScreening("Persona")],
      pdfInfo: undefined,
      sourceStatus: { pdf: "success", programmeChanges: "empty" },
    });
    const out = await getOrLoadBFIScreenings();
    expect(out).toHaveLength(1);
    // Both invocations consumed a mock — that's the cache-bust working.
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it("DOES cache successes — the second venue reuses the first call's result", async () => {
    mockLoad.mockResolvedValueOnce({
      screenings: [
        fixtureScreening("Persona"),
        fixtureScreening("IMAX Doc"),
      ],
      pdfInfo: undefined,
      sourceStatus: { pdf: "success", programmeChanges: "empty" },
    });

    const first = await getOrLoadBFIScreenings();
    const second = await getOrLoadBFIScreenings();
    expect(first).toBe(second); // Same in-memory array reference
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });
});
