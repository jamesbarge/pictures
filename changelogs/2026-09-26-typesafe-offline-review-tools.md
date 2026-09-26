# Offline TypeSafe review tools (draft, policy decision pending)

**PR**: #756
**Date**: 2026-09-26

## Changes
- Adds `scripts/typesafe-experiments/`, the 2026-09-21 title-quality and discovery benchmark harness with its `REPORT.md` and `README.md`. Runs stay in the gitignored `runs/` directory. It has its own `tsconfig.json` and Vitest config because `discovery.ts` imports the frontend palette, so the root `tsconfig.json` and `vitest.config.ts` exclude only the four files that reach the frontend (`discovery.ts`, `discovery.test.ts`, `run.ts`, `summarize.ts`). The client, evaluation and quality tests run in root CI. All 58 harness tests run with `node node_modules/vitest/vitest.mjs run --config scripts/typesafe-experiments/vitest.config.mts` once frontend deps are installed.
- Adds `scripts/dedup-judgement/`, a read-only harness that replays candidate duplicate-film pairs through the current `film-similarity` rules and a TypeSafe judgement, then reports disagreements. Bands: `undecidable` (identical titles the year window rejects or cannot judge), `automerge` (trigram at or above 0.85) and `wide`.
- The dedup harness uses the experiment harness's `TypeSafeClient`: pinned `jev-1.13.0`, response validation, a persistent budget ledger capped at $5, bounded retries and timeouts, a request cache, and `--replay` for cache-only reports with no key.
- Pairs are frozen to a gitignored snapshot per band and limit, so replays and repeat live runs reuse the same cache keys as screening counts move. `--refresh` re-pulls, and `--replay` never opens a DB connection.
- The merge decision now needs the `same_underlying_work` check to agree with a "same film" Score; a disagreement goes to review. The question was asked but never read before.

## Impact
- Nothing runs in production. Neither tool writes to the database, and neither adds a dependency.
- A live call requires `TYPESAFE_API_KEY`. Without it both tools run in preview mode. Preview on 2026-09-26 found 49 undecidable pairs (about 68k input tokens, roughly $0.003 live) and 114 automerge-band pairs (about 154k tokens, roughly $0.007).
- `CLAUDE.md` currently bans hosted-model analysis. Merging this PR needs an explicit carve-out for offline, read-only, reviewer-assisted tools, or the PR should stay a draft.
