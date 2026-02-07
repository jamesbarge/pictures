# Lessons Learned

Running log of mistakes, patterns, and insights. Each entry follows the
Reflect → Abstract → Generalise pattern.

## Index
<!-- Newest first. Link to section anchors. -->
- [2026-02-06: Blocked scrapes report as success](#2026-02-06-blocked-scrapes-report-as-success)
- [2026-02-06: No fetch timeouts anywhere](#2026-02-06-no-fetch-timeouts-anywhere)
- [2026-02-06: BFI cancellations silently skipped](#2026-02-06-bfi-cancellations-silently-skipped)

---

## 2026-02-06: Blocked scrapes report as success

**What happened**: Pipeline `processScreenings()` returns `failed: N` when
a scrape is blocked by diff check, but the runner treats this as
`success: true` because no exception was thrown.

**Pattern**: Return values that silently encode failure states. The caller
doesn't distinguish "nothing to do" from "blocked."

**Rule**: Any pipeline/processing function that can *reject* input must
return an explicit status flag (e.g., `blocked: true`), not just zero
counts. Callers must check the flag.

**Applied to CLAUDE.md**: No (add if pattern recurs)

---

## 2026-02-06: No fetch timeouts anywhere

**What happened**: Zero `fetch()` calls in the entire scraper codebase have
timeouts. A hanging request blocks the scraper indefinitely, consuming
Vercel/Inngest execution time.

**Pattern**: Omitting defensive defaults on I/O boundaries. The language
doesn't enforce timeouts, so they get forgotten.

**Rule**: Every `fetch()` call must use `AbortSignal.timeout()`. HTML pages:
30s. PDF downloads: 60s. Health checks: 10s. Create a shared `safeFetch()`
utility to enforce this.

**Applied to CLAUDE.md**: No (planned for Session 2)

---

## 2026-02-06: BFI cancellations silently skipped

**What happened**: `convertChangesToRawScreenings()` in programme-changes-parser
explicitly skips cancellations (`if (change.changeType === "cancellation") continue`).
The merge logic only adds/overwrites, never removes. Cancelled BFI screenings
stay live indefinitely.

**Pattern**: Additive-only data pipelines that can't express deletions. The
system handles "add" and "update" but has no concept of "remove."

**Rule**: When a data source can express cancellations/removals, the pipeline
must handle them — either by marking records as cancelled or by deleting them.
Skipping them silently is a data integrity bug.

**Applied to CLAUDE.md**: No (planned for Session 3)
