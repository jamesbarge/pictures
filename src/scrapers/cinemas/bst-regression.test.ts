/**
 * Regression test for the BST timezone bug surfaced by customer feedback on
 * 2026-05-26: scrapers using `new Date(y, m, d, h, mi)` (local-TZ constructor)
 * were storing BST clock-face times as UTC on the UTC server (Vercel), causing
 * the frontend's UTC→Europe/London conversion to render times 1 hour ahead of
 * reality.
 *
 * Each scraper's `parseDateTime` must:
 *   - return a Date that is exactly 1 hour BEFORE the clock-face hour for BST
 *     input dates (last Sun of March → last Sun of October, 01:00 UTC).
 *   - return a Date matching the clock-face hour exactly for GMT input dates.
 *
 * Methods under test are `private`; we reach in via `as unknown as { ... }`
 * rather than changing visibility just for tests.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// Rich Mix v2's parsePages preloads the festival cache (DB hit) — mock it so
// the Spektrix parsing test below runs without a database.
vi.mock("../festivals/festival-detector", () => ({
  FestivalDetector: {
    preload: vi.fn().mockResolvedValue(undefined),
    detect: vi.fn().mockReturnValue({}),
  },
}));

import { RichMixScraper } from "./rich-mix";
import { RichMixScraperV2 } from "./rich-mix-v2";
import { BFIScraper } from "./bfi";
import { PhoenixScraper } from "./phoenix";
import { OlympicScraper } from "./olympic";
import { DavidLeanScraper } from "./david-lean";
import { GenesisScraper } from "./genesis";
import { CloseUpCinemaScraper } from "./close-up";

type PrivDate = { parseDateTime: (s: string) => Date | null };
type PrivBFI = { parseBFIDateTime: (s: string) => Date | null };
type PrivPhoenix = {
  parseShowtime: (date: string, time: string, year: number, now: Date) => Date | null;
};
type PrivOlympic = { parsePages: (pages: string[]) => Promise<Array<{ datetime: Date }>> };
type PrivDavidLean = {
  parseDateTime: (day: string, month: string, time: string, year: number) => Date | null;
};
type PrivGenesis = { parseDateTime: (date: string, time: string) => Date | null };
type PrivCloseUp = {
  extractPageDate: (html: string) => Date | null;
  combineDateAndTime: (date: Date, hour: string, minute: string, ampm: string) => Date;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("BST regression: Rich Mix parseDateTime", () => {
  const scraper = new RichMixScraper() as unknown as PrivDate;

  it("BST: 2026-05-26 18:10:00 UK local → 17:10 UTC", () => {
    expect(scraper.parseDateTime("2026-05-26 18:10:00")?.toISOString())
      .toBe("2026-05-26T17:10:00.000Z");
  });

  it("GMT: 2026-01-15 18:10:00 UK local → 18:10 UTC (no offset)", () => {
    expect(scraper.parseDateTime("2026-01-15 18:10:00")?.toISOString())
      .toBe("2026-01-15T18:10:00.000Z");
  });
});

describe("BST regression: Rich Mix v2 (Spektrix startUtc)", () => {
  // The 2026-07-13 Spektrix rewrite removed local-time parsing entirely —
  // instances carry startUtc, so no BST conversion happens in the scraper.
  // Pin the Z-append behaviour instead (Spektrix omits the trailing Z):
  // a BST-season UTC timestamp must be stored verbatim, not shifted.
  const scraper = new RichMixScraperV2() as unknown as {
    parsePages(pages: string[]): Promise<Array<{ datetime: Date; filmTitle: string }>>;
  };

  it("parses Spektrix startUtc (no trailing Z) as UTC, not local time", async () => {
    const events = JSON.stringify([
      {
        id: "ev1",
        name: "Test Film (15)",
        duration: 100,
        isOnSale: true,
        attribute_COGEventProgramme: "FILM",
      },
    ]);
    const instances = JSON.stringify([
      {
        id: "in1",
        startUtc: "2027-05-26T17:10:00", // BST-season date; must stay 17:10 UTC
        cancelled: false,
        event: { id: "ev1" },
      },
    ]);
    const screenings = await scraper.parsePages([events, instances]);
    expect(screenings).toHaveLength(1);
    expect(screenings[0].datetime.toISOString()).toBe("2027-05-26T17:10:00.000Z");
    expect(screenings[0].filmTitle).toBe("Test Film");
  });
});

describe("BST regression: BFI parseBFIDateTime", () => {
  const scraper = new BFIScraper() as unknown as PrivBFI;

  it("BST: 'Tuesday 26 May 2026 18:10' → 17:10 UTC", () => {
    expect(scraper.parseBFIDateTime("Tuesday 26 May 2026 18:10")?.toISOString())
      .toBe("2026-05-26T17:10:00.000Z");
  });

  it("GMT: 'Thursday 15 January 2026 18:10' → 18:10 UTC (no offset)", () => {
    expect(scraper.parseBFIDateTime("Thursday 15 January 2026 18:10")?.toISOString())
      .toBe("2026-01-15T18:10:00.000Z");
  });
});

describe("BST regression: Phoenix parseShowtime", () => {
  const scraper = new PhoenixScraper() as unknown as PrivPhoenix;

  it("keeps the screening date and converts the UK-local time to UTC", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    expect(scraper.parseShowtime("Tue 14 Jul", "18:10", 2026, now)?.toISOString())
      .toBe("2026-07-14T17:10:00.000Z");
  });
});

describe("BST regression: Olympic parsePages", () => {
  const scraper = new OlympicScraper() as unknown as PrivOlympic;

  it("keeps the screening date and converts the UK-local time to UTC", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));

    const [screening] = await scraper.parsePages([`
      <h3 class="date-day">Tuesday July 14</h3>
      <div class="row">
        <div class="col-md-12">
          <a class="text-decoration-none text-black">Example Film</a>
          <a class="btn" href="https://empire.mycloudcinema.com/book/123">
            <span class="btn-times-fs">18:10</span>
          </a>
        </div>
      </div>
    `]);

    expect(screening.datetime.toISOString()).toBe("2026-07-14T17:10:00.000Z");
  });
});

describe("BST regression: David Lean parseDateTime", () => {
  const scraper = new DavidLeanScraper() as unknown as PrivDavidLean;

  it("keeps the screening date and converts the UK-local time to UTC", () => {
    expect(scraper.parseDateTime("14", "Jul", "6.10pm", 2026)?.toISOString())
      .toBe("2026-07-14T17:10:00.000Z");
  });

  it("rejects invalid times instead of fabricating midnight", () => {
    expect(scraper.parseDateTime("14", "Jul", "not-a-time", 2026)).toBeNull();
  });
});

describe("BST regression: Genesis parseDateTime", () => {
  const scraper = new GenesisScraper() as unknown as PrivGenesis;

  it("applies the shared PM assumption to ambiguous 1-9 hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00.000Z"));

    expect(scraper.parseDateTime("14 Jul 2026", "7:30")?.toISOString())
      .toBe("2026-07-14T18:30:00.000Z");
  });
});

describe("BST regression: Close-Up search-page dates", () => {
  const scraper = new CloseUpCinemaScraper() as unknown as PrivCloseUp;

  it("builds page dates in UTC and combines them as UK-local screening times", () => {
    const pageDate = scraper.extractPageDate("date=14-07-2026");
    expect(pageDate?.toISOString()).toBe("2026-07-14T00:00:00.000Z");
    expect(scraper.combineDateAndTime(pageDate!, "6", "10", "pm").toISOString())
      .toBe("2026-07-14T17:10:00.000Z");
  });
});
