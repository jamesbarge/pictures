/**
 * Persisted run summary for /scrape — one machine-readable JSON artifact per
 * unified pipeline run, so the slash command (and any post-run tooling) can
 * report on the run without re-querying the database.
 *
 * Writes to `<cwd>/tmp/scrape-run-summary.json` (latest run) and appends a
 * dated copy under `<cwd>/tmp/scrape-runs/`, pruned to the most recent
 * HISTORY_LIMIT files. Paths are local to the Mac running /scrape — no
 * network, no DB, no external service. See the local-only-no-off-mac
 * auto-memory rule.
 *
 * Atomic-write pattern (unique temp name + rename, swallow-and-warn on
 * failure) copied from scrape-progress.ts — see the 2026-06-11 rename-race
 * incident documented there.
 */
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import type {
  QuarantinedCinema,
  FlakyCinema,
  YieldDropCinema,
  YieldDelta,
  StaleCinema,
  DqsSnapshot,
} from "@/lib/scrape-quarantine";

/** Stable machine-readable phase ids — checkpoint/resume keys off these. */
export type PhaseId =
  | "preflight"
  | "scrape"
  | "lcut"
  | "cleanup"
  | "audit"
  | "rematch"
  | "health"
  | "yield-delta";

export interface SummaryPhase {
  id: PhaseId;
  label: string;
  ok: boolean;
  /** Phase succeeded but surfaced something actionable (zero-counts, anomalies, detector hits). */
  warn?: boolean;
  durationMin: number;
  detail?: string;
}

export interface RunSummaryArgs {
  skipScrape: boolean;
  skipEnrich: boolean;
  skipLcut: boolean;
}

/** StaleCinema, made JSON-safe: the in-memory type uses Infinity as the
 * "never scraped" sentinel, which JSON.stringify silently turns into null.
 * The persisted shape makes that explicit — null MEANS never scraped. */
export type PersistedStaleCinema = Omit<StaleCinema, "hoursSinceLastRun"> & {
  hoursSinceLastRun: number | null;
};

/** Map the in-memory sentinel to the explicit persisted shape. */
export function toPersistedStale(stale: StaleCinema[]): PersistedStaleCinema[] {
  return stale.map((s) => ({
    ...s,
    hoursSinceLastRun: Number.isFinite(s.hoursSinceLastRun) ? s.hoursSinceLastRun : null,
  }));
}

export interface RunHealth {
  silentBreakers: QuarantinedCinema[];
  flaky: FlakyCinema[];
  yieldDrops: YieldDropCinema[];
  yieldDeltas: YieldDelta[];
  stale: PersistedStaleCinema[];
  dqs: DqsSnapshot | null;
}

export type RunStatus = "ok" | "ok-with-warnings" | "failed" | "crashed";

export interface RunSummary {
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMin: number;
  args: RunSummaryArgs;
  status: RunStatus;
  phases: SummaryPhase[];
  /** Upcoming-screenings table count at run start/end; null if the query failed. */
  screeningsBefore: number | null;
  screeningsAfter: number | null;
  health: RunHealth;
}

const DEFAULT_PATH = join(process.cwd(), "tmp", "scrape-run-summary.json");
const SUMMARY_PATH = process.env.SCRAPE_SUMMARY_FILE ?? DEFAULT_PATH;
const HISTORY_DIR = join(dirname(SUMMARY_PATH), "scrape-runs");
const HISTORY_LIMIT = 20;

/** Monotonic counter so concurrent writers in one process never share a temp file. */
let writeSeq = 0;

async function atomicWrite(path: string, content: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${writeSeq++}.tmp`;
  await fs.mkdir(dirname(path), { recursive: true });
  try {
    await fs.writeFile(tmp, content);
    await fs.rename(tmp, path);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

/** ISO timestamp → filesystem-safe history filename. */
function historyFilename(startedAt: string): string {
  return `${startedAt.replace(/[:.]/g, "-")}.json`;
}

/**
 * Persist the run summary: latest-run file plus a dated history copy, pruning
 * history to the most recent HISTORY_LIMIT runs. Failures are logged and
 * swallowed — a broken summary write must never change the pipeline exit code.
 */
export async function writeRunSummary(summary: RunSummary): Promise<void> {
  const content = JSON.stringify(summary, null, 2) + "\n";
  try {
    await atomicWrite(SUMMARY_PATH, content);
    await atomicWrite(join(HISTORY_DIR, historyFilename(summary.startedAt)), content);
    await pruneHistory();
  } catch (err) {
    console.warn(
      `[scrape-run-summary] write failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function pruneHistory(): Promise<void> {
  const files = (await fs.readdir(HISTORY_DIR)).filter((f) => f.endsWith(".json")).sort();
  // ISO-derived names sort chronologically; drop the oldest beyond the cap.
  const excess = files.slice(0, Math.max(0, files.length - HISTORY_LIMIT));
  for (const f of excess) {
    await fs.unlink(join(HISTORY_DIR, f)).catch(() => {});
  }
}

/** Read the most recent run summary, or null if no run has written one yet. */
export async function readRunSummary(): Promise<RunSummary | null> {
  try {
    const raw = await fs.readFile(SUMMARY_PATH, "utf8");
    return JSON.parse(raw) as RunSummary;
  } catch {
    return null;
  }
}

/** Derive the run-level status from phase results (crash handled by caller). */
export function computeRunStatus(phases: SummaryPhase[]): Exclude<RunStatus, "crashed"> {
  if (phases.some((p) => !p.ok)) return "failed";
  if (phases.some((p) => p.warn)) return "ok-with-warnings";
  return "ok";
}
