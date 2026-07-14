import { describe, expect, it, vi } from "vitest";

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
  type LcutFilm,
  type LcutGapfillReport,
} from "./lcut-gapfill";
import { processScreenings } from "@/scrapers/pipeline";
import { getScrapedCinemaIds } from "@/scrapers/registry";

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
    // Everything we scrape ourselves EXCEPT the four source-only venues.
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
      "good-shepherd-studios",
      "horse-hospital",
      "project-loop",
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
  it("real registry yields exactly the 4 known source-only venues", () => {
    const { sourceOnly } = classifyLcutTargets(getScrapedCinemaIds());
    expect([...sourceOnly].sort()).toEqual([
      "good-shepherd-studios",
      "horse-hospital",
      "project-loop",
      "the-arzner",
    ]);
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
});
