/**
 * Venue-identity guard at the persistence boundary.
 *
 * The 2026-09-08 audit found two active `cinemas` rows for one venue —
 * `nickel` and `the-nickel` — holding the same 56 upcoming screenings under
 * identical source IDs. `getCanonicalId()` already knew the mapping, but it
 * had exactly one production caller (POST /api/admin/scrape). Everything
 * downstream (`processScreenings`, `ensureCinemaExists`) was a pass-through:
 * `ensureCinemaExists` INSERTs a brand-new `cinemas` row for any string it is
 * handed and re-asserts `isActive: true`, which is how an ID deleted in the
 * 2026-05-27 cleanup came back.
 *
 * These tests pin the guard to the write boundary, so canonicalisation no
 * longer depends on every caller remembering to do it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/** Records every table handed to insert()/update() and the values written. */
const writes: Array<{ op: "insert" | "update"; values: Record<string, unknown> }> = [];
const selectCalls: unknown[] = [];

vi.mock("@/db", () => {
  // Awaitable at any point in the chain: the pipeline's later phases
  // (generateScrapeDiff, initFilmCache) await the builder directly without a
  // .limit(), and used to blow up on "not iterable" before the assertion.
  const thenableEmpty: Record<string, unknown> = {
    from: () => thenableEmpty,
    where: () => thenableEmpty,
    orderBy: () => thenableEmpty,
    limit: async () => [],
    then: (resolve: (v: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
  };
  return {
    db: {
      select: (...args: unknown[]) => {
        selectCalls.push(args);
        return thenableEmpty;
      },
      insert: () => ({
        values: async (values: Record<string, unknown>) => {
          writes.push({ op: "insert", values });
        },
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            writes.push({ op: "update", values });
          },
        }),
      }),
    },
    withDbTimeout: <T>(p: Promise<T>) => p,
    isDatabaseAvailable: true,
  };
});

import { ensureCinemaExists, processScreenings } from "./pipeline";

beforeEach(() => {
  writes.length = 0;
  selectCalls.length = 0;
});

const venue = (id: string) => ({
  id,
  name: "The Nickel",
  shortName: "Nickel",
  website: "https://thenickel.co.uk",
  address: { street: "", area: "", postcode: "" },
  features: [],
});

describe("ensureCinemaExists", () => {
  it("rejects an ID the registry does not know, before touching the database", async () => {
    await expect(ensureCinemaExists(venue("totally-made-up"))).rejects.toThrow(
      /not in the cinema registry/i,
    );
    expect(selectCalls).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });

  it("creates the venue under its canonical ID when handed a legacy alias", async () => {
    await ensureCinemaExists(venue("nickel"));

    expect(writes).toHaveLength(1);
    expect(writes[0].op).toBe("insert");
    expect(writes[0].values.id).toBe("the-nickel");
  });
});

describe("processScreenings", () => {
  it("rejects an ID the registry does not know, before touching the database", async () => {
    await expect(processScreenings("totally-made-up", [])).rejects.toThrow(
      /not in the cinema registry/i,
    );
    expect(selectCalls).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });

  it("processes a legacy alias under its canonical ID", async () => {
    // The success path for the function that produced the original 56-row
    // split. An empty batch still reaches the lastScrapedAt UPDATE, which is
    // keyed on the resolved ID, so it shows which venue the run was attributed
    // to without needing a full screening fixture.
    const result = await processScreenings("nickel", []);

    expect(result.cinemaId).toBe("the-nickel");
  });
});
