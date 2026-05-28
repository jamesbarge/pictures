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
import { describe, expect, it } from "vitest";

import { RichMixScraper } from "./rich-mix";
import { RichMixScraperV2 } from "./rich-mix-v2";
import { BFIScraper } from "./bfi";

type PrivDate = { parseDateTime: (s: string) => Date | null };
type PrivBFI = { parseBFIDateTime: (s: string) => Date | null };

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

describe("BST regression: Rich Mix v2 parseDateTime", () => {
  const scraper = new RichMixScraperV2() as unknown as PrivDate;

  it("BST: 2026-05-26 18:10:00 UK local → 17:10 UTC", () => {
    expect(scraper.parseDateTime("2026-05-26 18:10:00")?.toISOString())
      .toBe("2026-05-26T17:10:00.000Z");
  });

  it("GMT: 2026-01-15 18:10:00 UK local → 18:10 UTC (no offset)", () => {
    expect(scraper.parseDateTime("2026-01-15 18:10:00")?.toISOString())
      .toBe("2026-01-15T18:10:00.000Z");
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
