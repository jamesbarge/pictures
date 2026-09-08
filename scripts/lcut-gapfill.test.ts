import { beforeEach, describe, expect, it, vi } from "vitest";

// The script imports the pipeline (which pulls in the DB client); mock the
// heavy modules so the pure helpers can be tested without a connection.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ films: {}, screenings: {} }));
vi.mock("@/scrapers/pipeline", () => ({
  processScreenings: vi.fn(),
  normalizeTitle: (t: string) =>
    t
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/^the\s+/i, "")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim(),
}));

import {
  normalizeVenueName,
  titlesMatch,
  isCovered,
  classifyLcutTargets,
  detectLcutRegressions,
  runLcutGapfill,
  getLcutTargetCinemaIds,
  summarizeLcutPhase,
  type LcutFilm,
  type LcutGapfillReport,
  VENUE_MAP,
  type RegressionSignal,
} from "./lcut-gapfill";
import { processScreenings } from "@/scrapers/pipeline";
import { getScrapedCinemaIds } from "@/scrapers/registry";
import { getCinemaById } from "@/config/cinema-registry";
import {
  CINEMA_REGISTRY,
  getCinemasSeedData,
  resolveCinemaId,
} from "@/config/cinema-registry";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeRunStatus, type PhaseId, type SummaryPhase } from "@/lib/scrape-run-summary";
import { honoredPhasePrefix } from "@/lib/scrape-checkpoint";

describe("normalizeVenueName", () => {
  it("strips the pride flag emoji from The Arzner", () => {
    expect(normalizeVenueName("The Arzner 🏳️‍🌈")).toBe("the arzner");
  });

  it("strips diacritics from Ciné Lumière", () => {
    expect(normalizeVenueName("Ciné Lumière")).toBe("cine lumiere");
  });

  it("keeps hyphenated names intact", () => {
    expect(normalizeVenueName("Close-Up Film Centre")).toBe("close-up film centre");
  });
});

describe("titlesMatch", () => {
  it("matches identical normalized titles", () => {
    expect(titlesMatch("apocalypse now", "apocalypse now")).toBe(true);
  });

  it("matches containment for longer titles (version suffixes)", () => {
    expect(titlesMatch("apocalypse now", "apocalypse now final cut")).toBe(true);
  });

  it("does not match short-title containment (It vs It Follows)", () => {
    expect(titlesMatch("it", "it follows")).toBe(false);
  });

  it("does not match unrelated titles", () => {
    expect(titlesMatch("the birds", "the birds placebo")).toBe(true); // containment is intentional here
    expect(titlesMatch("vertigo", "psycho")).toBe(false);
  });
});

describe("isCovered", () => {
  const base = new Date("2026-07-16T18:00:00.000Z");
  const probe = {
    normTitle: "vive le punk",
    gentleTitle: "vive le punk",
    datetime: base,
    sourceId: "lcut-abc123",
  };

  it("covered when an existing screening matches title within ±20 min", () => {
    const existing = [
      {
        datetime: new Date(base.getTime() + 15 * 60 * 1000),
        normTitle: "vive le punk",
        normOriginalTitle: null,
        gentleTitle: "vive le punk",
        sourceId: "horse-hospital-1",
      },
    ];
    expect(isCovered(probe, existing)).toBe(true);
  });

  it("not covered when the time gap exceeds 20 minutes", () => {
    const existing = [
      {
        datetime: new Date(base.getTime() + 45 * 60 * 1000),
        normTitle: "vive le punk",
        normOriginalTitle: null,
        gentleTitle: "vive le punk",
        sourceId: "horse-hospital-1",
      },
    ];
    expect(isCovered(probe, existing)).toBe(false);
  });

  it("not covered when only the time matches but titles differ", () => {
    const existing = [
      { datetime: base, normTitle: "stalker",
        normOriginalTitle: null,
        gentleTitle: "stalker", sourceId: "x-1" },
    ];
    expect(isCovered(probe, existing)).toBe(false);
  });

  it("covered when the lcut sourceId already exists (prior gap-fill run)", () => {
    const existing = [
      {
        datetime: new Date(base.getTime() + 6 * 60 * 60 * 1000),
        normTitle: "something else entirely",
        normOriginalTitle: null,
        gentleTitle: "something else entirely",
        sourceId: "lcut-abc123",
      },
    ];
    expect(isCovered(probe, existing)).toBe(true);
  });

  it("not covered when there are no existing screenings", () => {
    expect(isCovered(probe, [])).toBe(false);
  });
});

describe("bigramSimilarity via titlesMatch", () => {
  it("matches British/American spelling variants", () => {
    expect(titlesMatch("colour of pomegranates", "color of pomegranates")).toBe(true);
  });

  it("does not match genuinely different titles", () => {
    expect(titlesMatch("the ascent", "nirvanna the band the show the movie")).toBe(false);
  });
});

describe("gentle-normalization fallback (colon titles)", () => {
  it("covers 'Kingdom of Heaven: Director's Cut' against stored 'Kingdom of Heaven'", () => {
    // pipeline normalizeTitle mangles the probe to "directors cut"; the
    // gentle form "kingdom of heaven directors cut" ⊇ "kingdom of heaven"
    const probe = {
      normTitle: "directors cut",
      gentleTitle: "kingdom of heaven directors cut",
      datetime: new Date("2026-08-05T13:00:00.000Z"),
      sourceId: "lcut-x",
    };
    const existing = [
      {
        datetime: new Date("2026-08-05T13:00:00.000Z"),
        normTitle: "kingdom of heaven",
        gentleTitle: "kingdom of heaven",
        normOriginalTitle: null,
        sourceId: "31627223",
      },
    ];
    expect(isCovered(probe, existing)).toBe(true);
  });
});

describe("classifyLcutTargets", () => {
  it("splits targets into source-only vs scraped by the registry set", () => {
    // Everything we scrape ourselves EXCEPT the eight source-only venues.
    const scrapedIds = new Set([
      "prince-charles",
      "bfi-southbank",
      "bfi-imax",
      "ica",
      "garden",
      "barbican",
      "lexi",
      "castle",
      "rio-dalston",
      "the-nickel",
      "phoenix-east-finchley",
      "cine-lumiere",
      "close-up-cinema",
      "cinema-museum",
    ]);
    const { sourceOnly, scraped } = classifyLcutTargets(scrapedIds);
    expect([...sourceOnly].sort()).toEqual([
      "deptford-cinema",
      "good-shepherd-studios",
      "horse-hospital",
      "ibraaz",
      "metroland-studios",
      "project-loop",
      "set-social-peckham",
      "the-arzner",
    ]);
    // Venues with a first-party scraper are report-only, not source-only.
    expect(scraped.has("ica")).toBe(true);
    expect(scraped.has("rio-dalston")).toBe(true);
    expect(sourceOnly.has("ica")).toBe(false);
  });

  it("reclassifies a venue as scraped once it gains a scraper (Phase 2b Arzner)", () => {
    const withArznerScraper = new Set(["the-arzner"]);
    const { sourceOnly, scraped } = classifyLcutTargets(withArznerScraper);
    expect(scraped.has("the-arzner")).toBe(true);
    expect(sourceOnly.has("the-arzner")).toBe(false);
  });
});

describe("registry ↔ VENUE_MAP integration (guards cinema-id drift)", () => {
  // The whole auto-insert path is safe only while registry cinema IDs match
  // VENUE_MAP target IDs. A registry rename (e.g. rio-dalston → rio) would
  // silently reclassify a scraped venue as source-only — auto-inserting L-CUT
  // rows into a venue we already scrape AND dropping its regression signal.
  // These tests run the REAL registry so that drift becomes a red build.
  it("real registry yields exactly the 8 known source-only venues", () => {
    const { sourceOnly } = classifyLcutTargets(getScrapedCinemaIds());
    expect([...sourceOnly].sort()).toEqual([
      "deptford-cinema",
      "good-shepherd-studios",
      "horse-hospital",
      "ibraaz",
      "metroland-studios",
      "project-loop",
      "set-social-peckham",
      "the-arzner",
    ]);
  });

  // Every source-only target must exist in the registry, or processScreenings
  // fails the cinema_id FK at insert time and the gap-fill silently loses the
  // venue's rows. Cheap guard for the VENUE_MAP-without-registry-entry mistake.
  it("every source-only target resolves to a registry cinema", () => {
    const { sourceOnly } = classifyLcutTargets(getScrapedCinemaIds());
    for (const id of sourceOnly) {
      const cinema = getCinemaById(id);
      expect(cinema, `no registry entry for source-only target: ${id}`).toBeDefined();
      expect(cinema?.active, `source-only target is inactive: ${id}`).toBe(true);
    }
  });

  it("every VENUE_MAP target is classified (none falls through)", () => {
    const scraped = getScrapedCinemaIds();
    const classified = classifyLcutTargets(scraped);
    expect(classified.sourceOnly.size + classified.scraped.size).toBe(
      getLcutTargetCinemaIds().length,
    );
  });
});

describe("detectLcutRegressions", () => {
  const report = {
    venues: [
      { venue: "ica", total: 10, covered: 2, missing: 8, missingRows: [], inserted: 0, failed: 0, blocked: false },
      { venue: "rio-dalston", total: 6, covered: 5, missing: 1, missingRows: [], inserted: 0, failed: 0, blocked: false },
      { venue: "the-arzner", total: 9, covered: 0, missing: 9, missingRows: [], inserted: 9, failed: 0, blocked: false },
      { venue: "barbican", total: 20, covered: 14, missing: 6, missingRows: [], inserted: 0, failed: 0, blocked: false },
    ],
  } as unknown as LcutGapfillReport;
  const scrapedIds = new Set(["ica", "rio-dalston", "barbican"]);

  it("flags only scraped venues over the threshold, sorted by missing desc", () => {
    const regressions = detectLcutRegressions(report, scrapedIds, 5);
    expect(regressions.map((r) => r.venue)).toEqual(["ica", "barbican"]);
    expect(regressions[0].missing).toBe(8);
  });

  it("ignores source-only venues no matter how many are missing", () => {
    // the-arzner has 9 missing but is source-only (not in scrapedIds).
    const regressions = detectLcutRegressions(report, scrapedIds, 5);
    expect(regressions.some((r) => r.venue === "the-arzner")).toBe(false);
  });

  it("returns nothing when every scraped venue is at or below threshold", () => {
    expect(detectLcutRegressions(report, scrapedIds, 8)).toEqual([]);
  });
});

describe("runLcutGapfill (executeTargets filtering)", () => {
  // Each case sets its own processScreenings implementation; reset between them
  // so an appended case can never inherit a previous one's failing pipeline.
  beforeEach(() => {
    vi.mocked(processScreenings).mockReset();
  });

  const DAY = 86_400_000;
  function future(daysOut: number, hourZ = 15): string {
    const d = new Date(Date.now() + daysOut * DAY);
    d.setUTCHours(hourZ, 0, 0, 0);
    return d.toISOString();
  }
  function mkFilm(id: string, cinema: string, title: string, daysOut: number): LcutFilm {
    return {
      id,
      title,
      director: null,
      year: null,
      runtime: null,
      imageUrl: null,
      cinema,
      timestamp: future(daysOut),
      url: `https://lcutlondon.com/f/${id}`,
      date: "",
      showtime: "",
    };
  }

  it("inserts only source-only targets but reports parity for every venue", async () => {
    const listings: LcutFilm[] = [
      // source-only venue (the-arzner) — 2 missing, should be inserted
      mkFilm("a1", "The Arzner 🏳️‍🌈", "Paris Is Burning", 3),
      mkFilm("a2", "The Arzner 🏳️‍🌈", "Tangerine", 4),
      // scraped venue (ica) — 8 missing, report-only (regression candidate)
      ...Array.from({ length: 8 }, (_, i) =>
        mkFilm(`i${i}`, "Institute of Contemporary Arts", `ICA Film ${i}`, 5 + i),
      ),
      // scraped venue (rio) — 1 missing, report-only, below threshold
      mkFilm("r1", "The Rio Cinema", "Stalker", 6),
    ];

    vi.mocked(processScreenings).mockImplementation(
      async (cinemaId: string, rows: unknown[]) => ({
        cinemaId,
        added: rows.length,
        updated: 0,
        failed: 0,
        rejected: 0,
        blocked: false,
        scrapedAt: new Date(),
      }),
    );

    const report = await runLcutGapfill({
      execute: true,
      executeTargets: new Set(["the-arzner"]),
      fetchListings: async () => listings,
      loadExisting: async () => new Map(), // nothing in DB → all missing
      log: () => {},
      warn: () => {},
    });

    const byVenue = Object.fromEntries(report.venues.map((v) => [v.venue, v]));
    // Parity computed for all three venues.
    expect(byVenue["the-arzner"].missing).toBe(2);
    expect(byVenue["ica"].missing).toBe(8);
    expect(byVenue["rio-dalston"].missing).toBe(1);
    // Only the source-only target was inserted.
    expect(byVenue["the-arzner"].inserted).toBe(2);
    expect(byVenue["ica"].inserted).toBe(0);
    expect(byVenue["rio-dalston"].inserted).toBe(0);
    expect(report.totalInserted).toBe(2);
    // processScreenings called exactly once, for the-arzner, as a partial batch.
    expect(processScreenings).toHaveBeenCalledTimes(1);
    expect(processScreenings).toHaveBeenCalledWith(
      "the-arzner",
      expect.any(Array),
      { skipSupersededCleanup: true },
    );
  });

  // Wiring guard: a pipeline write error must reach report.totalFailed, which
  // is what summarizeLcutPhase gates the phase on. The 2026-09-08 shape: most
  // venues fine, two single-screening venues losing their write to a
  // foreign-key violation because no cinema row exists.
  it("carries per-venue write failures through to totalFailed and fails the phase", async () => {
    const listings: LcutFilm[] = [
      mkFilm("a1", "The Arzner 🏳️‍🌈", "Paris Is Burning", 3),
      mkFilm("m1", "Metroland Studios", "Day Shall Dawn", 6),
      mkFilm("d1", "Deptford Cinema", "Daisies", 19),
    ];
    const BROKEN = new Set(["metroland-studios", "deptford-cinema"]);

    vi.mocked(processScreenings).mockImplementation(
      async (cinemaId: string, rows: unknown[]) => ({
        cinemaId,
        added: BROKEN.has(cinemaId) ? 0 : rows.length,
        updated: 0,
        failed: BROKEN.has(cinemaId) ? rows.length : 0,
        rejected: 0,
        blocked: false,
        scrapedAt: new Date(),
      }),
    );

    const report = await runLcutGapfill({
      execute: true,
      executeTargets: new Set(["the-arzner", "metroland-studios", "deptford-cinema"]),
      fetchListings: async () => listings,
      loadExisting: async () => new Map(),
      log: () => {},
      warn: () => {},
    });

    expect(report.totalInserted).toBe(1);
    expect(report.totalFailed).toBe(2);
    const out = summarizeLcutPhase(report, [], 5);
    expect(out.ok).toBe(false);
    expect(out.detail).toContain("2 failed/rejected");
  });

  // A diff-check block also fails the phase, because the pipeline's blocked
  // branch returns `failed: rawScreenings.length` (pipeline.ts) and
  // runLcutGapfill never calls it with an empty batch. So `blocked` needs no
  // separate gate in summarizeLcutPhase. The behaviour is incidental to that
  // return shape, so pin it here.
  it("fails the phase when a venue's batch was blocked by the diff check", async () => {
    vi.mocked(processScreenings).mockImplementation(
      async (cinemaId: string, rows: unknown[]) => ({
        cinemaId,
        added: 0,
        updated: 0,
        failed: rows.length,
        rejected: 0,
        blocked: true,
        scrapedAt: new Date(),
      }),
    );

    const report = await runLcutGapfill({
      execute: true,
      executeTargets: new Set(["the-arzner"]),
      fetchListings: async () => [mkFilm("a1", "The Arzner 🏳️‍🌈", "Paris Is Burning", 3)],
      loadExisting: async () => new Map(),
      log: () => {},
      warn: () => {},
    });

    expect(report.venues[0].blocked).toBe(true);
    expect(report.totalInserted).toBe(0);
    expect(report.totalFailed).toBe(1);
    expect(summarizeLcutPhase(report, [], 5).ok).toBe(false);
  });
});

describe("summarizeLcutPhase", () => {
  const report = (over: Partial<LcutGapfillReport> = {}): LcutGapfillReport => ({
    days: 35,
    executed: true,
    listingCount: 0,
    unmapped: [],
    venues: [],
    totalMissing: 0,
    totalInserted: 0,
    totalFailed: 0,
    ...over,
  });
  const regression = (venue: string, missing: number): RegressionSignal => ({
    venue,
    missing,
    total: missing,
    covered: 0,
  });

  it("succeeds when every write landed", () => {
    const out = summarizeLcutPhase(report({ totalInserted: 98 }), [], 5);
    expect(out.ok).toBe(true);
    expect(out.warn).toBe(false);
  });

  it("says added/updated, never inserted", () => {
    const out = summarizeLcutPhase(report({ totalInserted: 98 }), [], 5);
    expect(out.detail).toContain("98 added/updated");
    expect(out.detail).not.toContain("inserted");
  });

  it("fails the phase on the baseline mix of 98 writes and 2 failures", () => {
    const out = summarizeLcutPhase(report({ totalInserted: 98, totalFailed: 2 }), [], 5);
    expect(out.ok).toBe(false);
    expect(out.detail).toContain("98 added/updated");
    expect(out.detail).toContain("2 failed/rejected");
  });

  it("fails the phase when nothing landed at all", () => {
    const out = summarizeLcutPhase(report({ totalInserted: 0, totalFailed: 2 }), [], 5);
    expect(out.ok).toBe(false);
    expect(out.detail).toContain("0 added/updated");
    expect(out.detail).toContain("2 failed/rejected");
  });

  it("succeeds quietly when there was no gap to fill", () => {
    const out = summarizeLcutPhase(report(), [], 5);
    expect(out.ok).toBe(true);
    expect(out.warn).toBe(false);
    expect(out.detail).not.toContain("failed/rejected");
  });

  it("keeps coverage regressions and unmapped venues as warnings, not failures", () => {
    const out = summarizeLcutPhase(
      report({ totalInserted: 98, unmapped: [{ name: "Some New Venue", count: 38 }] }),
      [regression("ica", 8), regression("rio-dalston", 6)],
      5,
    );
    expect(out.ok).toBe(true);
    expect(out.warn).toBe(true);
    expect(out.detail).toContain("2 scraped venue(s) >5 missing");
    expect(out.detail).toContain("1 unmapped");
  });

  it("reports a write failure alongside coverage warnings", () => {
    const out = summarizeLcutPhase(
      report({ totalInserted: 98, totalFailed: 2, unmapped: [{ name: "X", count: 1 }] }),
      [regression("ica", 8)],
      5,
    );
    expect(out.ok).toBe(false);
    expect(out.warn).toBe(true);
    expect(out.detail).toContain("2 failed/rejected");
    expect(out.detail).toContain("1 scraped venue(s) >5 missing");
  });
});

describe("L-CUT write failures propagate to the run outcome", () => {
  const phase = (id: PhaseId, ok: boolean, warn?: boolean): SummaryPhase => ({
    id,
    label: id,
    ok,
    warn,
    durationMin: 1,
  });

  it("marks the whole run failed when the L-CUT phase failed", () => {
    const out = summarizeLcutPhase(
      {
        days: 35,
        executed: true,
        listingCount: 0,
        unmapped: [],
        venues: [],
        totalMissing: 0,
        totalInserted: 98,
        totalFailed: 2,
      },
      [],
      5,
    );
    // Later independent phases still run and still record their own success.
    const phases = [
      phase("preflight", true),
      phase("scrape", true),
      phase("lcut", out.ok, out.warn),
      phase("cleanup", true),
      phase("audit", true),
    ];
    expect(computeRunStatus(phases)).toBe("failed");
  });

  it("does not treat later phases as resumable when lcut was never checkpointed", () => {
    // markPhaseComplete is gated on result.ok, so a failed lcut is absent from
    // the checkpoint, so the phases after it must re-run.
    const sequence: PhaseId[] = ["scrape", "lcut", "cleanup", "audit"];
    expect(honoredPhasePrefix(sequence, ["scrape", "cleanup", "audit"])).toEqual(["scrape"]);
  });

  it("still resumes past lcut when it succeeded", () => {
    const sequence: PhaseId[] = ["scrape", "lcut", "cleanup", "audit"];
    expect(honoredPhasePrefix(sequence, ["scrape", "lcut", "cleanup"])).toEqual([
      "scrape",
      "lcut",
      "cleanup",
    ]);
  });
});

/**
 * VENUE_MAP is hand-maintained here rather than derived from the cinema
 * registry, and its first ID per entry is the insert target passed straight to
 * `processScreenings` with no canonicalisation of its own. A legacy or
 * misspelled ID here would write screenings onto the wrong venue identity.
 */
describe("VENUE_MAP", () => {
  it("maps every L-CUT venue name to canonical registry IDs", () => {
    const canonicalIds = new Set(CINEMA_REGISTRY.map((c) => c.id));

    for (const [venueName, ids] of Object.entries(VENUE_MAP)) {
      expect(ids.length, `"${venueName}" maps to no cinema ID`).toBeGreaterThan(0);
      for (const id of ids) {
        expect(
          canonicalIds.has(id),
          `L-CUT venue "${venueName}" maps to "${id}", which is not a canonical ` +
            `ID in src/config/cinema-registry.ts.`,
        ).toBe(true);
      }
    }
  });

  it("uses each insert-target cinema ID for at most one L-CUT venue name", () => {
    const targets = Object.values(VENUE_MAP).map((ids) => ids[0]);
    expect(targets.length).toBe(new Set(targets).size);
  });
});

/**
 * Source-only venues need a `cinemas` row before L-CUT can insert anything.
 *
 * The 2026-09-08 baseline showed failed screening writes for
 * `metroland-studios` and `deptford-cinema`. Both are canonical registry IDs,
 * so this is NOT an identity problem and the canonicalisation added at the
 * pipeline write boundary does nothing for it: `screenings.cinema_id` is a
 * foreign key to `cinemas.id`, and the L-CUT gap-fill calls
 * `processScreenings` directly without ever calling `ensureCinemaExists`.
 *
 * The parent row is a precondition, satisfied by `npm run db:seed:cinemas`.
 * These tests pin both halves of that statement.
 */
describe("source-only venues need a cinemas row first", () => {
  const SOURCE_ONLY = [
    "metroland-studios",
    "deptford-cinema",
    "ibraaz",
    "set-social-peckham",
  ];

  it("treats these as valid canonical IDs, so a failed write is a missing row", () => {
    for (const id of SOURCE_ONLY) {
      expect(resolveCinemaId(id), `${id} should resolve to itself`).toBe(id);
    }
  });

  it("includes them in the cinema seed data, so db:seed:cinemas creates them", () => {
    const seededIds = new Set(getCinemasSeedData().map((c) => c.id));
    for (const id of SOURCE_ONLY) {
      expect(
        seededIds.has(id),
        `${id} is missing from getCinemasSeedData(), so npm run db:seed:cinemas ` +
          `would not create its cinemas row and L-CUT inserts would keep failing ` +
          `the screenings.cinema_id foreign key.`,
      ).toBe(true);
    }
  });

  it("does not create the parent row itself — the L-CUT path never calls ensureCinemaExists", () => {
    const source = readFileSync(
      join(__dirname, "lcut-gapfill.ts"),
      "utf-8",
    );
    // Documents the precondition rather than asserting it should change:
    // making the gap-fill self-sufficient is a separate decision, because
    // ensureCinemaExists also re-asserts isActive: true on every call.
    expect(source).toContain("processScreenings(");
    expect(source).not.toContain("ensureCinemaExists");
  });
});
