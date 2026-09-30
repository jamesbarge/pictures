import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseChangesPage } from "./programme-changes-parser";

/**
 * Fixed "today" for every fixture below.
 *
 * These fixtures carry bare dates with no year ("Fri 9 Aug 11:50"), so
 * `parseChangesPage` infers the year from the wall clock and
 * `parseScreeningsFromText` drops anything already past. That made the suite a
 * date bomb: on 2026-08-11 the "9 Aug" and "10 Aug" fixtures had gone past and
 * two tests failed, while the third ("30/31 Aug") was still passing and would
 * have failed on 1 September. Worse, the guard that was supposed to prevent
 * this — `.replace(/Aug/g, monthAbbrev(futureYear - new Date().getFullYear() > 0
 * ? 8 : ...))` — could never fire, because that subtraction is always 1, so it
 * substituted "Aug" for "Aug".
 *
 * Pinning the clock makes all three deterministic regardless of when CI runs.
 * The date is inside August so the BST assertions (14:00 BST = 13:00 UTC) hold,
 * and early enough in the month that every fixture date is still in the future.
 */
const FIXED_NOW = new Date("2026-08-01T09:00:00Z");

describe("parseChangesPage — film text isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does NOT propagate one film's screening times to sibling films in the same paragraph", () => {
    // Reproduces the production bug observed 2026-05-15: six unrelated films
    // (Rose of Nevada, Surviving Earth, The Christophers, ...) all stored at
    // 2026-05-15 11:50:00+00 because `getFollowingText` previously grabbed the
    // entire parent's text via `$el.parent().text()`.
    //
    // Fixture: two films share the same <p>. Only the FIRST has a screening
    // time. The SECOND should produce zero screenings.
    const html = `
      <html><body><main>
        <p>
          <b>Rose of Nevada</b> A short description. Fri 9 Aug 11:50 NFT4 p10 — extra screening added.
          <b>Surviving Earth</b> A different film with no times listed yet.
        </p>
      </main></body></html>
    `;

    const result = parseChangesPage(html);
    const titles = result.changes.map((c) => c.filmTitle);
    expect(titles).toContain("Rose of Nevada");

    // Lock-in invariant: total emitted screenings across the page is exactly 1
    // (Rose of Nevada's 11:50). Pre-fix, this was 2 — Surviving Earth had also
    // inherited the same time via shared parent text. Under the new
    // `getFollowingText`, Surviving Earth has zero screenings and is filtered
    // out by `parseChangesPage` (no screenings → not added to `changes`).
    expect(result.screenings.length).toBe(1);
    expect(titles).not.toContain("Surviving Earth");
  });

  it("keeps multiple times for a single film when each has a day-name prefix", () => {
    // The regex requires a day-name prefix on every match — pre-existing parser
    // limitation. Lock in current behaviour: each "Day DD Mon HH:MM Venue"
    // tuple becomes a screening; bare "and HH:MM Venue" continuations on the
    // same line do NOT (known gap, tracked separately). The walker fix must
    // not regress past the regex coverage.
    const html = `
      <html><body><main>
        <p><b>Cabaret</b> Fri 9 Aug 11:50 NFT4 p10; Sat 10 Aug 20:30 NFT4 p10</p>
      </main></body></html>
    `;
    const result = parseChangesPage(html);
    const cabaret = result.changes.find((c) => c.filmTitle === "Cabaret");
    expect(cabaret).toBeDefined();
    expect(cabaret?.screenings.length).toBe(2);
  });

  it("isolates films across separate paragraphs", () => {
    const html = `
      <html><body><main>
        <p><b>Film A</b> Sat 30 Aug 14:00 NFT2 p20</p>
        <p><b>Film B</b> Sun 31 Aug 18:30 NFT3 p21</p>
      </main></body></html>
    `;

    const result = parseChangesPage(html);
    const filmA = result.changes.find((c) => c.filmTitle === "Film A");
    const filmB = result.changes.find((c) => c.filmTitle === "Film B");

    // Each film keeps only its own screening — A at 14:00, B at 18:30.
    const aTimes = (filmA?.screenings ?? []).map((s) => s.datetime.getUTCHours());
    const bTimes = (filmB?.screenings ?? []).map((s) => s.datetime.getUTCHours());
    expect(aTimes.length).toBe(1);
    expect(bTimes.length).toBe(1);
    // 14:00 BST = 13:00 UTC; 18:30 BST = 17:30 UTC (August is BST).
    expect(aTimes[0]).toBe(13);
    expect(bTimes[0]).toBe(17);
  });
});

// `monthAbbrev` was removed with the clock pin above: it existed only to shift
// the fixture month relative to "today", which the FIXED_NOW system time now
// makes unnecessary (and which never actually worked — see the note on FIXED_NOW).
