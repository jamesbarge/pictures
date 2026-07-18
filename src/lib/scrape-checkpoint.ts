/**
 * Crash-resume checkpoint for /scrape — records which pipeline phases (and
 * which individual scrapers inside the Scrape phase) completed, so
 * `npm run scrape:unified -- --resume` can skip finished work instead of
 * re-running a 30-60 min pipeline from scratch.
 *
 * Written atomically to `<cwd>/tmp/scrape-checkpoint.json` (env override
 * `SCRAPE_CHECKPOINT_FILE`). Local-only, same rules as scrape-progress.ts.
 *
 * Safety properties:
 * - Resume is NEVER automatic — the orchestrator only reads this when the
 *   operator passes `--resume` (a stale checkpoint silently skipping phases
 *   on fresh data is the failure mode to avoid).
 * - A checkpoint older than MAX_AGE_MS (24h) is invalid.
 * - A checkpoint whose CLI args differ from the current run is invalid —
 *   `completedPhases` from a `--skip-enrich` run must not skip phases in a
 *   full run.
 */
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import type { PhaseId, RunSummaryArgs } from "@/lib/scrape-run-summary";

export interface ScrapeCheckpoint {
  runId: string;
  startedAt: string;
  args: RunSummaryArgs;
  completedPhases: PhaseId[];
  /** Normalized scraper taskIds (no `scraper-` prefix) that finished OK inside the Scrape phase. */
  completedScrapeEntries: string[];
}

const DEFAULT_PATH = join(process.cwd(), "tmp", "scrape-checkpoint.json");
const CHECKPOINT_PATH = process.env.SCRAPE_CHECKPOINT_FILE ?? DEFAULT_PATH;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** In-memory state for the current run; persisted on every mutation. */
let current: ScrapeCheckpoint | null = null;

/** Monotonic counter so concurrent writers in one process never share a temp file. */
let writeSeq = 0;

/** Atomic write, swallow-and-warn — checkpointing must never fail the run. */
async function persist(): Promise<void> {
  if (!current) return;
  const tmp = `${CHECKPOINT_PATH}.${process.pid}.${writeSeq++}.tmp`;
  try {
    await fs.mkdir(dirname(CHECKPOINT_PATH), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(current, null, 2) + "\n");
    await fs.rename(tmp, CHECKPOINT_PATH);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    console.warn(
      `[scrape-checkpoint] write failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function argsMatch(a: RunSummaryArgs, b: RunSummaryArgs): boolean {
  return (
    a.skipScrape === b.skipScrape && a.skipEnrich === b.skipEnrich && a.skipLcut === b.skipLcut
  );
}

/**
 * Read a checkpoint valid for a run with the given args, or null if absent,
 * malformed, older than 24h, or written by a run with different args.
 */
export async function readCheckpoint(args: RunSummaryArgs): Promise<ScrapeCheckpoint | null> {
  try {
    const raw = await fs.readFile(CHECKPOINT_PATH, "utf8");
    const cp = JSON.parse(raw) as ScrapeCheckpoint;
    if (!Array.isArray(cp.completedPhases) || !Array.isArray(cp.completedScrapeEntries)) {
      return null;
    }
    if (Date.now() - Date.parse(cp.startedAt) > MAX_AGE_MS) return null;
    if (!argsMatch(cp.args, args)) return null;
    return cp;
  } catch {
    return null;
  }
}

/**
 * Start checkpointing for this run. When resuming, pass the prior checkpoint
 * so its completed lists carry over (under the new runId).
 */
export async function initCheckpoint(
  runId: string,
  args: RunSummaryArgs,
  resumeFrom?: ScrapeCheckpoint | null,
): Promise<void> {
  current = {
    runId,
    startedAt: new Date().toISOString(),
    args,
    completedPhases: resumeFrom ? [...resumeFrom.completedPhases] : [],
    completedScrapeEntries: resumeFrom ? [...resumeFrom.completedScrapeEntries] : [],
  };
  await persist();
}

/** Record a pipeline phase as complete (idempotent). */
export async function markPhaseComplete(id: PhaseId): Promise<void> {
  if (!current) return;
  if (!current.completedPhases.includes(id)) current.completedPhases.push(id);
  await persist();
}

/** Record a scraper entry (normalized taskId) as complete (idempotent). */
export async function markScrapeEntryComplete(taskId: string): Promise<void> {
  if (!current) return;
  if (!current.completedScrapeEntries.includes(taskId)) {
    current.completedScrapeEntries.push(taskId);
  }
  await persist();
}

/** Remove the checkpoint (clean run end — nothing left to resume). */
export async function clearCheckpoint(): Promise<void> {
  current = null;
  await fs.unlink(CHECKPOINT_PATH).catch(() => {});
}

/**
 * The pipeline's checkpointable phases form a dependency chain (scrape →
 * lcut → cleanup → audit → rematch): each consumes the output of the ones
 * before it. A checkpoint may therefore only be honored as a PREFIX of the
 * run's phase sequence — if scrape didn't finish, a "completed" cleanup from
 * the prior run enriched pre-rescrape data and must re-run after the scrape
 * is redone. Returns the longest honored prefix.
 */
export function honoredPhasePrefix(sequence: PhaseId[], completed: PhaseId[]): PhaseId[] {
  const done = new Set(completed);
  const prefix: PhaseId[] = [];
  for (const id of sequence) {
    if (!done.has(id)) break;
    prefix.push(id);
  }
  return prefix;
}
