import { describe, expect, it } from "vitest";
import { parseChangesPage } from "./programme-changes-parser";

describe("parseChangesPage — film text isolation", () => {
  it("does NOT propagate one film's screening times to sibling films in the same paragraph", () => {
    // Reproduces the production bug observed 2026-05-15: six unrelated films
    // (Rose of Nevada, Surviving Earth, The Christophers, ...) all stored at
    // 2026-05-15 11:50:00+00 because `getFollowingText` previously grabbed the
    // entire parent's text via `$el.parent().text()`.
    //
    // Fixture: two films share the same <p>. Only the FIRST has a screening
    // time. The SECOND should produce zero screenings.
    const futureYear = new Date().getFullYear() + 1;
    const html = `
      <html><body><main>
        <p>
          <b>Rose of Nevada</b> A short description. Fri 9 Aug 11:50 NFT4 p10 — extra screening added.
          <b>Surviving Earth</b> A different film with no times listed yet.
        </p>
      </main></body></html>
    `.replace(/Aug/g, monthAbbrev(futureYear - new Date().getFullYear() > 0 ? 8 : new Date().getMonth() + 1));

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

// August is BST in the UK. The fixture year is the next August relative to
// "today" so screenings aren't filtered as past by `parseScreeningsFromText`.
function monthAbbrev(monthNum1Based: number): string {
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return m[monthNum1Based - 1];
}
