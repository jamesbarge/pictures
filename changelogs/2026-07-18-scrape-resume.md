# /scrape crash-resume — checkpoint + --resume flag (/scrape improvements, PR 2)

**PR**: #732
**Date**: 2026-07-18

## Changes
- New `src/lib/scrape-checkpoint.ts`: atomic-write checkpoint at `tmp/scrape-checkpoint.json` (env override `SCRAPE_CHECKPOINT_FILE`) recording `completedPhases` (stable phase ids from PR 1 / #731) and `completedScrapeEntries` (normalized scraper taskIds that finished OK inside Phase 1).
  - `readCheckpoint(args)` returns null when the file is absent, malformed, older than 24h, or written by a run with different CLI args — the three guards against the stale-checkpoint failure mode (silently skipping phases on fresh data).
  - `honoredPhasePrefix(sequence, completed)`: checkpointed completions are honored only as a **prefix of the run's phase dependency chain** (scrape → lcut → cleanup → audit → rematch). Without this, a run where scrape failed but cleanup succeeded would checkpoint cleanup, and the resume would re-scrape fresh data then skip its enrichment (caught by the code-reviewer agent). The carried-over checkpoint is truncated the same way so stale completions can't survive into later resumes.
  - Unit test `src/lib/scrape-checkpoint.test.ts` (round-trip, idempotent marks, age/args/malformed rejection, resume carry-over, clear semantics).
- `src/scripts/run-scrape-and-enrich.ts`:
  - New `--resume` flag. Resume is **never automatic**. With a valid checkpoint, phases in `completedPhases` are skipped and rendered in the summary as `✓ … skipped (resume)`; otherwise it warns and runs fully.
  - Only expensive/write phases are checkpointable (`scrape`, `lcut`, `cleanup`, `audit`, `rematch`). Read-only detector phases (preflight/health/yield-delta) always re-run — they cost seconds and feed the run summary's health section, which would otherwise persist empty on a resumed run.
  - Checkpoint cleared on clean exit (exit 0); **kept on failure**, so `--resume` doubles as "retry only the failed phase(s)". Failure output now suggests the resume command.
- `src/lib/jobs/scrape-all.ts`:
  - `runScrapeAll(options?: { skipTaskIds, onEntryComplete })`. Per-cinema resume: entries whose normalized taskId is in `skipTaskIds` are not re-run but counted as pre-succeeded in the wave summary (labeled "skipped (resume)") so the Telegram digest math stays honest. `onEntryComplete` fires after each successful entry (errors caught, never propagated) — the orchestrator wires it to the checkpoint writer.
- `/scrape` skill (local `.claude/commands/scrape.md`, gitignored): new `resume` arg + updated resume documentation.

## Impact
- A crash or failure partway through the 30-60 min weekly pipeline no longer costs a full re-run: completed phases and completed cinemas are skipped, including inside the expensive scrape phase.
- Failed runs get a one-command retry path that redoes only unfinished work.

## Verification
- Live: `--resume` with no checkpoint → warning + full run; crafted checkpoint (`cleanup`+`audit` complete, matching args) → both phases skipped, rendered as "skipped (resume)" in summary, checkpoint cleared on clean exit.
- `npx tsc --noEmit` clean.
- Vitest suite (checkpoint module) runs in CI.
