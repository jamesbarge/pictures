# Scraper audit integration candidate

**Date:** 2026-09-08
**PR:** Publication pending; not merged or deployed
**Branch:** `fix/scraper-audit-safeguards`
**PR base:** `defc0ae3` (current `origin/main` at preparation)
**Reviewed integration base:** `d5028a1896e5edd7c5d428fad1722b8257064b32`

## Included

1. Strict canonical cinema-ID resolution at `processScreenings` and `ensureCinemaExists`; canonical IDs in admin screening writes and Eventive persistence. Correct the two known standalone alias IDs without changing their venue metadata. Add the three missing task-map entries.
2. Explicit initialization failures in single, multi and chain runners. Chain fetches receive only successfully initialized IDs and are not constructed when none remain. Empty results cannot report success. Failed run records are attempted best-effort, not guaranteed.
3. L-CUT outcome derives from failed/rejected counts rather than hardcoded success. Detail labels the combined added/updated count accurately; failure-only outcomes enter the existing warning path. Existing summary/checkpoint functions receive the outcome. Later-phase continuation and the actual process exit are inspected, not covered by an end-to-end orchestrator test.
4. C1's London-clock helper and validator changes only. Padded-time interpretation changes are excluded. Existing PM assumptions, early-hour acceptance/rejection and horizon policy remain unchanged.
5. The former superseded-screening DELETE is replaced by a read-only COUNT using the same proximity predicate. Nonzero counts are logged and returned on the pipeline result; no delete opt-in exists. Partial/blocked/failed-write batches still skip the diagnostic. Report errors yield an unavailable count and a warning, not a failed screening write. The client-side 10-second ceiling does not cancel an already-issued server query.
6. Offline source excerpts with capture URLs/timestamps and original-response hashes, plus query-contract, pipeline orchestration and time regression tests.

## Why report-only cleanup

Same-film showings at 18:00 and 20:30 can both be legitimate. An incomplete fetch that refreshes only 20:30 is not evidence that 18:00 was cancelled or moved. The old proximity rule could delete the omitted showing. Candidate reporting retains both rows. The tradeoff is that genuinely superseded times may remain visible longer; identifying stable source sessions and confirmed cancellations is separate work. Other cleanup workflows and explicit data-repair scripts are unchanged.

This is a count-only diagnostic, not a durable per-row replacement audit. No SQL was executed against a database in this task; query tests inspect actual production SQL and parameters. Mocked pipeline tests exercise real orchestration and observe writes, final timestamps, canonical IDs and report-error continuation, not PostgreSQL row-selection semantics.

## Deliberately excluded

- C2's wholesale runner metadata consolidation, disputed Castle Sidcup address selection, registry website/booking metadata changes, BFI filter adjustment, seed deletion/changes and festival-reference cleanup. The original branch retains them for separate review. Metadata drift and bypassing entry points are therefore not fully resolved by this candidate.
- C1's change interpreting zero-padded bare times as morning. Its `08:00` source example is Closed for Booking; it proves source representation, not an accepted or persisted production row. Several original trace dates were illustrative. Fixtures do not preserve those as observed screening dates.
- Missing cinema parent rows, existing Nickel duplicates, wrong film matches, historical Peckhamplex row recovery, Close-Up blocking and unknown-writer identification. No production data was queried or repaired.
- L-CUT's combined failed/rejected semantics and blocked-batch double counting remain documented limitations; missing cinema records fail only when eligible writes are attempted.
- No new dependencies, database services, network source capture, full scrape, merge or deployment. Publishing this feature branch and opening its PR are separately authorized.

## Source branches preserved

| Source | Reviewed head | Selection |
|---|---|---|
| C1 time handling | `2ddb88ec` | London helper/validator and matching tests only |
| C2 venue IDs | `802786bb` | Persistence guards, runner failures, admin/Eventive IDs, task mapping; metadata changes withheld |
| C3 L-CUT reporting | `d45afce8` | Runtime changes and relevant tests |
| C3 cleanup tests | `a03d2c1d` | Query-contract coverage adapted to report-only behavior |

The original source-agent worktrees are unchanged. The reviewed integration remains on `fix/scraper-audit-integration`. The publication branch was recreated from current main because unrelated hook PR #747 remains open. Only the scraper candidate and review documentation were applied; a changelog-only conflict was resolved without importing the hook entry. All `src/`, `scripts/`, package and lockfile contents match the tested/reviewed `f40b0088` tree exactly. No hook changes are included in this PR.

## Verification

| Check | Result |
|---|---|
| `TZ=UTC ENABLE_AGENTS=false npm run test:run -- --pool=threads` | 139 files / 2,090 tests passed; 47.02 seconds |
| `npm run lint` | Exit 0; 0 errors / 61 warnings. Warnings are in unchanged code, including existing `module` variable names in the modified admin test file. |
| `./node_modules/.bin/tsc --noEmit` | Exit 0, no diagnostics |
| `TZ=Europe/London ... vitest run` on date-parser, screening-validator and time-source-fixtures tests | 3 files / 86 tests passed |
| `TZ=Pacific/Auckland ... vitest run` on the same three files | 3 files / 86 tests passed |
| Initial combined targeted run | 8 files / 158 tests passed |
| Real pipeline orchestration with mocked external boundaries | 4 tests passed, also included in the full suite |

Both timezone commands used `./node_modules/.bin/vitest run src/scrapers/utils/date-parser.test.ts src/scrapers/utils/screening-validator.test.ts src/scrapers/utils/time-source-fixtures.test.ts --pool=threads`.

Self-review confirmed the parser-policy function is unchanged, registry metadata and seed files are unchanged, and only the known Close-Up/Olympic ID literals changed in standalone runners. Query-contract tests distinguish an aggregate's selected count from the driver's result-row count and distinguish unavailable diagnostics from a successful zero. The pipeline orchestration tests do not reproduce the SQL predicate in JavaScript; they exercise real control flow with external operations mocked.

C1 was rechecked during integration at the user's request: clean at `2ddb88ec`; its latest live-source handoff was still timestamped 2026-09-08 14:23:32 BST. No additional tracked implementation was found.

## Release gates

Independent read-only code review of `d5028a18..f40b0088` completed: no introduced runtime blocker found. The sole P3 finding was the combined-count wording above, now corrected. Review covered caller compatibility, initialization failures, L-CUT status/checkpoint flow, read-only diagnostics, London validation and test evidence. No extra service access or full test rerun was performed for review.

A constructor throwing after an earlier successful venue in a multi-runner can still leave the aggregate successful; this predates the candidate. The initialization/empty-result fixes must not be described as eliminating every false-success path.

This candidate is not deployed. PR publication is authorized; merge/deployment still requires explicit approval. The report-only cleanup retention tradeoff and separate data-repair needs remain. Do not run a broad seed or reconciliation command as part of release.
