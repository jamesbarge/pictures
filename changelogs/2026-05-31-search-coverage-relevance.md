# Search — remove 30-day coverage cap + exact-match relevance boost

**PR**: TBD
**Date**: 2026-05-31

## Changes
- `src/app/api/films/search/route.ts` — films query:
  - Removed the `AND ns.next_dt < now() + interval '30 days'` upper bound. The
    query now returns every film with **any** future screening (still requires
    `ns.next_dt IS NOT NULL`, so only films a user can actually go and see).
  - Added a `CROSS JOIN params p` (params is a one-row CTE) to bring the bound
    query string into the final score, plus two boost terms:
    - `0.20 * (lower(f.title) = lower(p.q))::int` — exact title match. Dominates
      the RRF ceiling (~0.03 for a dual-list #1), guaranteeing exact-title #1.
    - `0.08 * (f.title ILIKE p.q || '%')::int` — prefix title match.
  - Recency (1-week half-life) and popularity boosts unchanged.
- `scripts/verify-search-coverage.ts` (new) — read-only verification that
  censuses far-out films, then proves OLD-cap search returns 0 while NEW search
  returns them at rank #1.

## Verification
- Census (prod DB): 1,082 upcoming films; **256 (24%) earliest screening >30d out**.
- `D.E.B.S.` / `Possession` / `Ghatak Was Here`: NEW found rank #1; OLD found=false.
- `tsc --noEmit`: no errors in changed files. Code-reviewed: clean, no blockers.
- Response contract `{ results, cinemas, screenings, festivals, seasons }` unchanged;
  palette + `/search` consumers verified intact. `nextScreeningAt` is server-side
  ranking only (not rendered), so far-future values have no UI impact.

## Impact
- Anyone searching for a repertory title, retrospective, or festival film
  screening more than 30 days out — previously zero results, now found.
- Exact-title queries are deterministically ranked first.
- Performance neutral: candidate set still bounded by the two `LIMIT 200` CTEs;
  the per-candidate LATERAL was already computed before the removed filter.
