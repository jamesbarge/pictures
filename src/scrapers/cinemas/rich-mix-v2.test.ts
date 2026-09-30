/**
 * Rich Mix — offline replay of the venue's real Spektrix v3 responses.
 *
 * WHY THESE FIXTURES EXIST. The 2026-09-08 baseline parsed ONE screening for
 * Rich Mix, and one parsed screening proves nothing on its own about which layer
 * is responsible. A bounded read-only capture on 2026-09-09 recorded what the
 * source held THAT DAY: 12 future instances in total, exactly one on a
 * FILM-programme event, against 262 FILM events in the catalogue. Six sampled
 * FILM events each returned zero future instances, the newest film instance in
 * the sample being 2026-08-27. See __fixtures__/rich-mix/PROVENANCE.json.
 *
 * SCOPE LIMIT. These fixtures are a 2026-09-09 observation. They do NOT
 * establish what the source held on 2026-09-08, so they cannot show the baseline
 * run's extraction was correct or incorrect; that day's payload was never
 * captured. What they do establish is the parser's behaviour on a known input.
 *
 * These tests replay through the production `parsePages`, never a copy of it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../festivals/festival-detector", () => ({
  FestivalDetector: { preload: vi.fn().mockResolvedValue(undefined), detect: () => ({}) },
}));

import { RichMixScraperV2 } from "./rich-mix-v2";

const DIR = join(__dirname, "__fixtures__", "rich-mix");
const EVENTS = readFileSync(join(DIR, "events.subset.json"), "utf8");
const INSTANCES = readFileSync(join(DIR, "instances.json"), "utf8");

/** Reach the production protected method without reimplementing it. */
function parse(scraper: RichMixScraperV2, pages: string[]) {
  return (scraper as unknown as {
    parsePages(p: string[]): Promise<Awaited<ReturnType<RichMixScraperV2["scrape"]>>>;
  }).parsePages(pages);
}

type ConsoleSpy = { mock: { calls: unknown[][] } } & ReturnType<typeof vi.fn>;
let warn: ConsoleSpy;
let log: ConsoleSpy;
beforeEach(() => {
  // Capture-time was 2026-09-09T19:42Z; freeze earlier so the single FILM
  // instance (18:00Z that day) is still in the future and must be emitted.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-09T09:00:00.000Z"));
  log = vi.spyOn(console, "log").mockImplementation(() => {}) as unknown as ConsoleSpy;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {}) as unknown as ConsoleSpy;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Rich Mix replay of the real 2026-09-09 capture", () => {
  it("extracts the venue's only future FILM instance, exactly", async () => {
    const out = await parse(new RichMixScraperV2(), [EVENTS, INSTANCES]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      filmTitle: "Premiere: We Set the House on Fire",
      sourceId: "richmix-1915402ALCNNDVVPMRTTDNMTDDRPLHJPK",
      bookingUrl: "https://richmix.org.uk/book/instance/1915402",
      timeSource: "iso",
    });
    expect(out[0].datetime.toISOString()).toBe("2026-09-09T18:00:00.000Z");
  });

  it("excludes the 11 non-FILM instances the venue also publishes", async () => {
    // 9 LIVE + 2 CE in the same response. A regression that dropped the
    // programme filter would emit 12.
    const out = await parse(new RichMixScraperV2(), [EVENTS, INSTANCES]);
    expect(out).toHaveLength(1);
  });

  it("drops instances already past at run time", async () => {
    vi.setSystemTime(new Date("2026-09-09T19:00:00.000Z")); // after the 18:00Z show
    const out = await parse(new RichMixScraperV2(), [EVENTS, INSTANCES]);
    expect(out).toHaveLength(0);
  });

  it("appends the omitted Z rather than reading startUtc as local time", async () => {
    const out = await parse(new RichMixScraperV2(), [EVENTS, INSTANCES]);
    // Fixture startUtc is "2026-09-09T18:00:00" with no Z.
    expect(INSTANCES).toContain('"startUtc": "2026-09-09T18:00:00"');
    expect(out[0].datetime.toISOString()).toBe("2026-09-09T18:00:00.000Z");
  });

  it("reports stage counts so the funnel is legible without re-deriving it", async () => {
    await parse(new RichMixScraperV2(), [EVENTS, INSTANCES]);
    const lines: string[] = log.mock.calls.map((c: unknown[]) => String(c[0]));
    const line = lines.find((l: string) => l.includes("film events"));
    expect(line).toBeDefined();
    // Counts only. The scraper must not editorialise about a cause it cannot see.
    expect(warn).not.toHaveBeenCalled();
    expect(line).toContain("40 events (31 film)");
    expect(line).toContain("12 future instances (1 on film events)");
  });
});

describe("Rich Mix malformed and empty responses", () => {
  it("returns nothing for empty arrays rather than throwing", async () => {
    await expect(parse(new RichMixScraperV2(), ["[]", "[]"])).resolves.toEqual([]);
  });

  it("throws on a non-JSON body so a provider error page cannot look like an empty programme", async () => {
    await expect(parse(new RichMixScraperV2(), ["<html>502</html>", "[]"])).rejects.toThrow();
  });

  it("skips instances whose event is absent from the events response", async () => {
    const orphan = JSON.stringify([
      { id: "999X", startUtc: "2026-09-20T18:00:00", event: { id: "not-in-events" } },
    ]);
    await expect(parse(new RichMixScraperV2(), [EVENTS, orphan])).resolves.toEqual([]);
  });

  it("skips cancelled instances", async () => {
    const events = JSON.parse(EVENTS);
    const film = events.find((e: { attribute_COGEventProgramme?: string }) =>
      e.attribute_COGEventProgramme === "FILM");
    const cancelled = JSON.stringify([
      { id: "1234ABC", startUtc: "2026-09-20T18:00:00", cancelled: true, event: { id: film.id } },
    ]);
    await expect(parse(new RichMixScraperV2(), [EVENTS, cancelled])).resolves.toEqual([]);
  });
});
