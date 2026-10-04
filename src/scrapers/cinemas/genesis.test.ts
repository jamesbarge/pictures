/**
 * Regression tests for the Genesis Cinema scraper.
 *
 * Both cases come from the 2026-10-03 run and a live fetch on 2026-10-04:
 *   - genesiscinema.co.uk sends Windows-1252 bytes under
 *     "content-type: text/html; charset=ISO-8859-1" (the page's own <meta>
 *     claims UTF-8). Decoding as UTF-8 stored "I�m Not You (UK Premiere) - LIFF"
 *     and eight other Genesis titles with U+FFFD in place of ’ and £.
 *   - Panel ids carry the year (panel_20261003), yet a showing earlier the same
 *     day was rolled forward to 2027 and rejected by the validator as
 *     too_far_future ("Digger ... 364 days in future").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../festivals/festival-detector", () => ({
  FestivalDetector: {
    preload: vi.fn().mockResolvedValue(undefined),
    detect: vi.fn().mockReturnValue({}),
  },
}));

import { GenesisScraper, decodeBody } from "./genesis";

type PrivGenesis = {
  parseDateTime: (date: string, time: string) => Date | null;
  delay: () => Promise<void>;
};

/** Encode a string as Windows-1252 bytes, the way Genesis serves its pages. */
function cp1252(text: string): ArrayBuffer {
  const special: Record<string, number> = { "’": 0x92, "–": 0x96, "£": 0xa3 };
  const bytes = Array.from(text, (ch) => special[ch] ?? ch.charCodeAt(0));
  return new Uint8Array(bytes).buffer;
}

const LATIN1_HEADER = "text/html; charset=ISO-8859-1";

// Trimmed from the live pages: the hidden search list on /whats-on/ and one
// event page's dated panel with a single showtime button.
const WHATS_ON = `<ul><li><a class="p-3 block" href="/event/113863">I’m Not You (UK Premiere) - LIFF</a></li></ul>`;
const EVENT_PAGE = `
  <h1><a class="!text-2xl" href="https://genesis.admit-one.co.uk/details/?eventCode=113863">I’m Not You (UK Premiere) - LIFF</a></h1>
  <div id="panel_20261007" class="whatson_panel">
    <a class="perfButton" href="https://genesis.admit-one.co.uk/seats/?perfCode=13253"><span>21:00</span></a>
  </div>`;

describe("decodeBody", () => {
  it("decodes an ISO-8859-1 header as Windows-1252, recovering ’ and £", () => {
    const body = cp1252("I’m Not You – SLASHERAMA - £21");
    expect(decodeBody(body, LATIN1_HEADER)).toBe("I’m Not You – SLASHERAMA - £21");
  });

  it("falls back to UTF-8 when the header names no charset", () => {
    const body = new TextEncoder().encode("I’m Not You").buffer;
    expect(decodeBody(body, "text/html")).toBe("I’m Not You");
    expect(decodeBody(body, null)).toBe("I’m Not You");
  });

  it("falls back to UTF-8 when the header names a charset TextDecoder rejects", () => {
    const body = new TextEncoder().encode("Verity").buffer;
    expect(decodeBody(body, "text/html; charset=x-not-a-charset")).toBe("Verity");
  });
});

describe("GenesisScraper.scrape on Windows-1252 pages", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-04T09:00:00.000Z"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const html = url.endsWith("/whats-on/") ? WHATS_ON : EVENT_PAGE;
        return new Response(cp1252(html), {
          status: 200,
          headers: { "content-type": LATIN1_HEADER },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the curly apostrophe in the film title", async () => {
    const scraper = new GenesisScraper();
    vi.spyOn(scraper as unknown as PrivGenesis, "delay").mockResolvedValue();

    const screenings = await scraper.scrape();

    expect(screenings).toHaveLength(1);
    expect(screenings[0].filmTitle).toBe("I’m Not You (UK Premiere) - LIFF");
    expect(screenings[0].filmTitle).not.toContain("�");
    // 21:00 London (BST) → 20:00 UTC
    expect(screenings[0].datetime.toISOString()).toBe("2026-10-07T20:00:00.000Z");
    expect(screenings[0].sourceId).toBe("genesis-13253");
  });
});

describe("GenesisScraper.parseDateTime year handling", () => {
  const scraper = new GenesisScraper() as unknown as PrivGenesis;

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not roll an earlier showing on a dated panel into next year", () => {
    // 18:03 BST on 3 Oct; the 14:30 showing that day is already past.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T17:03:00.000Z"));

    expect(scraper.parseDateTime("3 Oct 2026", "14:30")?.toISOString())
      .toBe("2026-10-03T13:30:00.000Z");
  });

  it("still rolls a past yearless date into next year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T17:03:00.000Z"));

    expect(scraper.parseDateTime("13 Jan", "19:00")?.toISOString())
      .toBe("2027-01-13T19:00:00.000Z");
  });
});
