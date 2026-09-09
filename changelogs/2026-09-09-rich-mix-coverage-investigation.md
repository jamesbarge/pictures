# Rich Mix: what the source held on 2026-09-09, and stage counts to read it by

**PR**: (pending)
**Date**: 2026-09-09

## The question

The 2026-09-08 baseline parsed **one** screening for Rich Mix and the venue held
two upcoming rows. The audit flagged it "critical / investigate" while stating
that one parsed screening proves neither that the site had one nor that a
particular layer was broken.

## What was observed

Bounded read-only capture of the venue's public Spektrix v3 API, 2026-09-09
19:42Z, no credentials. Full provenance (URLs, status, bytes, sha256) in
`src/scrapers/cinemas/__fixtures__/rich-mix/PROVENANCE.json`.

| Observation | Result |
|---|---|
| `/events` | 200, 354 events, **262 tagged FILM** |
| `/instances?startFrom=2026-09-09` | 200, **12 future instances total** |
| …of those, on a FILM event | **1** (9 LIVE, 2 CE) |
| `&startTo=+60d` added | identical 12 |
| Pagination | none — no `Link`/`Content-Range`, `content-length` = body |
| Re-check 11 minutes later | **byte-identical** (same sha256) |
| 6 sampled FILM events via `/events/{id}/instances` | **zero** future instances each |
| Newest film instance in that sample | **2026-08-27** |

## What this does and does not establish

**Establishes:** the source state on 2026-09-09, and the parser's behaviour on
that exact input (now pinned by fixtures and tests).

**Does not establish:**

- **Anything about the 2026-09-08 baseline run.** That day's payload was never
  captured, so this cannot show the baseline extraction was correct or incorrect.
  An earlier draft of this entry claimed it was correct; that conclusion was
  unsupported and is withdrawn.
- **A cause for the low denominator.** An unpublished calendar, a changed
  publishing route, or a discovery fault reachable another way would all look
  identical from this vantage point. **Why film instances stop at 2026-08-27 is
  unresolved.**

**No extraction fault was demonstrated, so none was fixed.** An earlier draft
added a `LOW FILM COVERAGE` warning with 10/5/25% thresholds. That was invented
policy dressed as a finding — thresholds nobody had justified, endorsing a cause
nobody had verified — and it has been removed rather than defended.

## What changed

`src/scrapers/cinemas/rich-mix-v2.ts`, stage counts only. **No change to which
screenings are emitted, and no new heuristic.**

`parsePages` previously logged `N events (M film), P future instances`. It now
also reports the overlap that actually becomes screenings:
`P future instances (Q on film events)`. Three numbers, three stages —
catalogue, calendar, overlap — so the next reader can see where the funnel
narrows without re-deriving it. They assert no cause.

## Tests

New `src/scrapers/cinemas/rich-mix-v2.test.ts`, 9 cases replaying the real
captured responses through the **production** `parsePages` (not a copy):

- exact tuple for the one screening: title, `sourceId`
  `richmix-1915402ALCNNDVVPMRTTDNMTDDRPLHJPK`, booking URL
  `/book/instance/1915402`, `2026-09-09T18:00:00.000Z`, `timeSource: "iso"`
- the 11 non-FILM instances stay excluded
- past instances dropped at run time (clock frozen either side of the 18:00Z show)
- the omitted `Z` on `startUtc` is appended, not read as local time
- stage counts are logged, and `console.warn` is asserted **unused** — the
  scraper must not editorialise about a cause it cannot see
- empty arrays, non-JSON body, orphan instance, cancelled instance

The stage-count test was verified to **fail on the pre-change scraper** and pass
after.

## Limitations

- The venue's `/cinema/` page is client-rendered through Spektrix web components
  and server-returns no showtimes, so it could not independently corroborate the
  denominator without a browser.
- Six FILM events were sampled, not all 262.
- The committed events fixture is reduced to 40 of 354 (31 FILM) to keep the
  387 KB response out of the repo; the sha256 of the full body is recorded.
