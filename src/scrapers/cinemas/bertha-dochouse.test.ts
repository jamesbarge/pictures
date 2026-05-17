import { describe, expect, it } from "vitest";
import { BerthaDochouseScraper } from "./bertha-dochouse";

/**
 * Fixture mimics the relevant slice of a real Bertha DocHouse detail page
 * as of 2026-05-15. Verified by WebFetch against https://dochouse.org/event/our-land/
 *
 * Keep this minimal — only the elements the parser reads (h1 + the
 * /ticketing/seats/ anchors). Real pages have a lot of unrelated chrome.
 */
const DETAIL_FIXTURE = `<!doctype html>
<html>
  <body>
    <main>
      <h1>Our Land</h1>
      <section>
        <h2>Screening times and booking</h2>
        <ul>
          <li><a href="https://www.curzon.com/ticketing/seats/BLO1-110048">Fri 15th May 16:30</a></li>
          <li><a href="https://www.curzon.com/ticketing/seats/BLO1-110049">Sat 16th May 18:45</a></li>
          <li><a href="https://www.curzon.com/ticketing/seats/BLO1-110050">Sun 17th May 14:00</a></li>
        </ul>
      </section>
    </main>
  </body>
</html>`;

// Use start-of-day so parseScreeningDate keeps today's date in the current year.
// (parsePages does this normalisation in production code.)
const FIXTURE_NOW = new Date("2026-05-14T00:00:00Z");

describe("BerthaDochouseScraper.parseDetailPage", () => {
  const scraper = new BerthaDochouseScraper();

  it("extracts 3 screenings from the fixture", () => {
    const screenings = scraper.parseDetailPage(DETAIL_FIXTURE, FIXTURE_NOW);
    expect(screenings).toHaveLength(3);
  });

  it("uses the page H1 as the film title for every screening", () => {
    const screenings = scraper.parseDetailPage(DETAIL_FIXTURE, FIXTURE_NOW);
    for (const s of screenings) {
      expect(s.filmTitle).toBe("Our Land");
    }
  });

  it("derives sourceId from the Curzon ticket ID", () => {
    const screenings = scraper.parseDetailPage(DETAIL_FIXTURE, FIXTURE_NOW);
    expect(screenings.map((s) => s.sourceId)).toEqual([
      "bertha-BLO1-110048",
      "bertha-BLO1-110049",
      "bertha-BLO1-110050",
    ]);
  });

  it("preserves the Curzon booking URL", () => {
    const screenings = scraper.parseDetailPage(DETAIL_FIXTURE, FIXTURE_NOW);
    expect(screenings[0].bookingUrl).toBe(
      "https://www.curzon.com/ticketing/seats/BLO1-110048",
    );
  });

  it("parses the 'Fri 15th May 16:30' anchor text into a UK-local-to-UTC datetime", () => {
    const screenings = scraper.parseDetailPage(DETAIL_FIXTURE, FIXTURE_NOW);
    const [first] = screenings;
    // 2026-05-15 16:30 UK local (BST) → 15:30 UTC
    expect(first.datetime.toISOString()).toBe("2026-05-15T15:30:00.000Z");
  });

  it("skips anchors that don't match the BLO1-XXXXXX pattern", () => {
    const fixture = `
      <h1>Off-topic Event</h1>
      <a href="https://www.curzon.com/about/">About</a>
      <a href="https://www.curzon.com/ticketing/seats/SOH1-99999">Wed 20th May 19:00</a>
      <a href="https://www.curzon.com/ticketing/seats/BLO1-110099">Wed 20th May 19:00</a>
    `;
    const out = scraper.parseDetailPage(fixture, FIXTURE_NOW);
    expect(out).toHaveLength(1);
    expect(out[0].sourceId).toBe("bertha-BLO1-110099");
  });

  it("returns [] when the page has no h1 (defensive)", () => {
    const fixture = `<a href="https://www.curzon.com/ticketing/seats/BLO1-1">Fri 15th May 16:30</a>`;
    expect(scraper.parseDetailPage(fixture, FIXTURE_NOW)).toEqual([]);
  });

  it("returns [] when an anchor has no parseable time", () => {
    const fixture = `
      <h1>Untitled Doc</h1>
      <a href="https://www.curzon.com/ticketing/seats/BLO1-1">Book Now</a>
    `;
    expect(scraper.parseDetailPage(fixture, FIXTURE_NOW)).toEqual([]);
  });

  it("keeps TODAY's screening in the current year (regression: parseScreeningDate +1y boundary)", () => {
    // Anchor says "Thu 14th May 16:30"; reference is Thu 14th May at 00:00 UTC.
    // Without start-of-day normalisation, parseScreeningDate sees `referenceDate > parsedDate`
    // (because parsedDate is also 00:00 UTC) — actually equal, but `isAfter` is false,
    // so this is fine. The bug fires when `new Date()` (with intraday time) is passed in.
    // This test pins the calling-convention so refactors can't accidentally regress.
    const fixture = `
      <h1>Today Film</h1>
      <a href="https://www.curzon.com/ticketing/seats/BLO1-200">Thu 14th May 16:30</a>
    `;
    const out = scraper.parseDetailPage(fixture, FIXTURE_NOW);
    expect(out).toHaveLength(1);
    expect(out[0].datetime.toISOString()).toBe("2026-05-14T15:30:00.000Z");
  });
});
