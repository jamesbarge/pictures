import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: vi.fn() }));
vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({
    where: async () => [{ name: "Test Cinema" }],
    innerJoin: () => ({ where: mocks.rows }),
  }) }) },
  withDbTimeout: <T,>(result: Promise<T>) => result,
}));

import { generateScrapeDiff, printDiffReport, shouldBlockScrape } from "./scrape-diff";

const datetime = new Date("2026-09-11T17:00:00Z");
const incoming = { filmTitle: "Practical Magic 2", datetime, bookingUrl: "https://example.com/book" };
const existing = { id: "screening-1", filmTitle: "Practical Magic", datetime,
  scrapedAt: new Date("2026-09-10T06:00:00Z") };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
  mocks.rows.mockResolvedValue([existing]);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("scrape diff evidence wording", () => {
  it("describes last refresh, not insertion or confirmed deletion", async () => {
    const report = await generateScrapeDiff("test", [incoming]);
    expect(report.warnings).toContain(
      'RECENTLY_REFRESHED_NOT_MATCHED: "Practical Magic" was last refreshed 0 days ago and has no title/time match in this scrape'
    );
    expect(report.warnings.join(" ")).not.toMatch(/was added|now gone|THEN_REMOVED/);
  });

  it("does not invent a recent refresh when scrapedAt is unknown", async () => {
    mocks.rows.mockResolvedValue([{ ...existing, scrapedAt: null }]);
    const report = await generateScrapeDiff("test", [incoming]);
    expect(report.removed[0].daysSinceScraped).toBeNull();
    expect(report.warnings.some((warning) => warning.startsWith("RECENTLY_"))).toBe(false);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printDiffReport(report);
    expect(log.mock.calls.flat().join("\n")).not.toContain("[RECENT REFRESH]");
  });

  it("labels the comparison scope and unmatched rows without claiming writes", async () => {
    const report = await generateScrapeDiff("test", [incoming]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printDiffReport(report);
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("title + UTC instant, next 30 days; not a write/deletion audit");
    expect(output).toContain("Unmatched incoming: 1 | Unmatched existing: 1 | Matched: 0");
    expect(output).toContain("Title normalization or incorrect film matching can also produce differences.");
    expect(output).not.toContain("REMOVED:");
  });

  it("does not call a future-dated refresh recent", async () => {
    mocks.rows.mockResolvedValue([{ ...existing, scrapedAt: new Date("2026-09-12T06:00:00Z") }]);
    const report = await generateScrapeDiff("test", [incoming]);
    expect(report.warnings.some((warning) => warning.startsWith("RECENTLY_"))).toBe(false);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printDiffReport(report);
    expect(log.mock.calls.flat().join("\n")).not.toContain("[RECENT REFRESH]");
  });

  it("preserves the blocking signal for an empty capture without predicting deletion", async () => {
    const report = await generateScrapeDiff("test", []);
    expect(shouldBlockScrape(report)).toBe(true);
    expect(report.warnings).toContain("SCRAPER_BROKEN: No incoming screenings in the comparison window against 1 existing screenings - scraper may have failed");
  });

  it("does not hide sequel title conflicts or one-hour changes", async () => {
    const titleConflict = await generateScrapeDiff("test", [incoming]);
    expect(titleConflict).toMatchObject({ addedCount: 1, removedCount: 1, unchangedCount: 0 });
    const timeConflict = await generateScrapeDiff("test", [{ ...incoming,
      filmTitle: existing.filmTitle, datetime: new Date("2026-09-11T16:00:00Z") }]);
    expect(timeConflict).toMatchObject({ addedCount: 1, removedCount: 1, unchangedCount: 0 });
  });

  it("still matches identical title/time keys", async () => {
    const report = await generateScrapeDiff("test", [{ ...incoming, filmTitle: " practical MAGIC " }]);
    expect(report).toMatchObject({ addedCount: 0, removedCount: 0, unchangedCount: 1, warnings: [] });
    expect(shouldBlockScrape(report)).toBe(false);
  });
});
