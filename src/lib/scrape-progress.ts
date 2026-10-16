/**
 * Live progress snapshot for /scrape — written atomically to a local JSON
 * file so we can answer "what's running RIGHT NOW" without grepping stdout.
 *
 * Writes to `<cwd>/tmp/scrape-progress.json` by default. The path is local
 * to the Mac running /scrape — no network, no DB, no external service. See
 * the local-only-no-off-mac auto-memory rule.
 *
 * Usage:
 *   import { stampProgress } from "@/lib/scrape-progress";
 *   await stampProgress({ wave: "Chains", cinemaId: "curzon-soho", phase: "diff" });
 *
 *   // From a separate terminal:
 *   tail -f tmp/scrape-progress.json | jq
 */
import { join } from "node:path";
import { atomicWrite } from "@/lib/scrape-run-summary";

export interface ProgressSnapshot {
  /** Wave currently in flight: "Chains" | "Playwright" | "Cheerio" | "Vision" | "Phase 0" | "Phase 2" | "Phase 3" | "Phase 4" */
  wave?: string;
  /** Cinema id being processed when the stamp was written */
  cinemaId?: string;
  /** Free-text phase label, e.g. "diff", "init-film-cache", "extract-titles", "film-loop", "cleanup", "scrape-fetch" */
  phase: string;
  /** ISO timestamp when this phase began */
  startedAt: string;
  /** ISO timestamp of this stamp (always now) */
  lastHeartbeatAt: string;
  /** Optional duration in ms — set on phase completion stamps */
  durationMs?: number;
  /** Optional error message — set on phase failure stamps */
  error?: string;
  /** Free-form fields the caller wants to attach (counts, ids, etc.) */
  meta?: Record<string, unknown>;
}

const DEFAULT_PATH = join(process.cwd(), "tmp", "scrape-progress.json");
const PROGRESS_PATH = process.env.SCRAPE_PROGRESS_FILE ?? DEFAULT_PATH;

/**
 * Atomically write the snapshot to `tmp/scrape-progress.json`. Failures are
 * logged once and otherwise swallowed — a broken progress stamp must never
 * fail the scrape itself.
 *
 * The temp filename is unique per write (pid + counter). Scrape waves run
 * 3-4 venues in parallel and each stamps progress concurrently; with a
 * single shared `.tmp` path, writer B's `rename` raced writer A's (A renames
 * the shared temp file away, B's rename then throws ENOENT) — observed as
 * "write failed: rename ... ENOENT" on every concurrent run on 2026-06-11.
 */
export async function stampProgress(input: Omit<ProgressSnapshot, "lastHeartbeatAt"> & { lastHeartbeatAt?: string }): Promise<void> {
  const now = new Date().toISOString();
  const snapshot: ProgressSnapshot = {
    lastHeartbeatAt: now,
    ...input,
  };
  try {
    await atomicWrite(PROGRESS_PATH, JSON.stringify(snapshot, null, 2) + "\n");
  } catch (err) {
    // Surface once at warn level; don't spam.
    console.warn(`[scrape-progress] write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Wrap an async phase with start/done logs, a duration measurement, and a
 * progress-file stamp at every boundary. Errors are re-thrown so existing
 * try/catch behavior is preserved.
 */
export async function runPhase<T>(
  cinemaId: string | undefined,
  phase: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const tag = cinemaId ? `${cinemaId} > ${phase}` : phase;
  console.log(`[Pipeline] ${tag} start`);
  await stampProgress({ cinemaId, phase, startedAt, meta });
  try {
    const result = await fn();
    const durationMs = Date.now() - t0;
    console.log(`[Pipeline] ${tag} done ${durationMs}ms`);
    await stampProgress({ cinemaId, phase: `${phase}:done`, startedAt, durationMs, meta });
    return result;
  } catch (err) {
    const durationMs = Date.now() - t0;
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] ${tag} threw after ${durationMs}ms: ${error}`);
    await stampProgress({ cinemaId, phase: `${phase}:error`, startedAt, durationMs, error, meta });
    throw err;
  }
}
