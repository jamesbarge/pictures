# Parallelize DQS verifier loop by cinema

**PR**: TBD
**Date**: 2026-05-17

## Context

`verifyCinemaScreenings()` in `scripts/data-check.ts` runs HTTP probes against each cinema's booking page to confirm scraped films appear there. The original implementation was strictly sequential with a 500 ms sleep between EVERY verifier call — which is overly conservative because each verifier targets a **different host** (Rio, ICA, Barbican, Close-Up, Genesis, Rich Mix, Curzon chain, Picturehouse chain, Everyman chain). The 500 ms rate-limit only needs to be enforced **per host**, not globally.

## Changes

### `scripts/data-check.ts` — `verifyCinemaScreenings()`

- Group eligible screenings by `cinema_id` (a `Map<string, ScreeningToVerify[]>`).
- Spawn one worker per cinema; each worker iterates its bucket sequentially, preserving the 500 ms rate-limit between calls to the same host.
- Different cinemas' workers run in parallel via `Promise.all`.
- Per-cinema cap = `ceil(CINEMA_VERIFICATION_CAP / cinemaCount)` so a single busy host can't crowd out coverage of the others. Final result still capped at the overall `CINEMA_VERIFICATION_CAP` for budget parity.
- 3-min hard deadline preserved.
- Error handling unchanged: a thrown verifier produces `fetch_error` for the screening.

## Impact

- **Wall-clock**: ~10 s → ~2 s for a typical 6-cinema queue (5× speedup). Frees budget within the 3-min phase deadline.
- **Politeness contract**: unchanged — each cinema host still sees ≤ 1 request per 500 ms.
- **Coverage**: per-cinema cap distributes verifications more evenly; previously, an early-arriving Rio screening could consume the entire cap.

## Verification

- `npm run test:run` — 990 / 990 pass
- `npx tsc --noEmit` — clean
- `npx eslint` — clean (one pre-existing warning at line 1696, unrelated)

## Follow-ups

- Live measurement after the next `/data-check` run to confirm the wall-clock improvement is real
- If the wall-clock saved is significant, consider lowering the 3-min phase deadline or raising `CINEMA_VERIFICATION_CAP` (currently 10) for more coverage per run
