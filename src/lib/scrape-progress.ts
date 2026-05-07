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
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

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

let ensuredDir = false;

async function ensureDir(): Promise<void> {
  if (ensuredDir) return;
  await fs.mkdir(dirname(PROGRESS_PATH), { recursive: true });
  ensuredDir = true;
}

/**
 * Atomically write the snapshot to `tmp/scrape-progress.json`. Failures are
 * logged once and otherwise swallowed — a broken progress stamp must never
 * fail the scrape itself.
 */
export async function stampProgress(input: Omit<ProgressSnapshot, "lastHeartbeatAt"> & { lastHeartbeatAt?: string }): Promise<void> {
  const now = new Date().toISOString();
  const snapshot: ProgressSnapshot = {
    lastHeartbeatAt: now,
    ...input,
  };
  try {
    await ensureDir();
    const tmp = `${PROGRESS_PATH}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2) + "\n");
    await fs.rename(tmp, PROGRESS_PATH);
  } catch (err) {
    // Surface once at warn level; don't spam.
    console.warn(`[scrape-progress] write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Read the most recent snapshot, or null if no run has stamped yet. */
export async function readProgress(): Promise<ProgressSnapshot | null> {
  try {
    const raw = await fs.readFile(PROGRESS_PATH, "utf8");
    return JSON.parse(raw) as ProgressSnapshot;
  } catch {
    return null;
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
