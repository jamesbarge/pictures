/**
 * Catch-up scan — startup-only helper.
 *
 * On scheduler boot, identifies any cinema-scrapers whose most recent
 * `scraper_runs.completed_at` is older than 24 hours (or that have never
 * successfully run) and enqueues a one-off scrape via Bree's manual `.run()`.
 *
 * Bree's worker model spawns one OS-level worker per `.run()` call, so we cap
 * concurrency manually (5) by awaiting in batches before issuing the next.
 *
 * NOTE: this file is NOT a Bree worker — it's invoked from src/scheduler/index.ts
 * after `bree.start()`. The single Bree worker we DO use for the actual scrape
 * is `src/scheduler/jobs/catch-up.ts`, which reads its target task ID from
 * `process.env.SCHEDULER_CATCHUP_TASK_ID`.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { scraperRuns } from "@/db/schema/admin";
import {
  SCRAPER_REGISTRY,
  type ScraperRegistryEntry,
} from "@/scrapers/registry";
import { getCinemaById } from "@/config/cinema-registry";

import type Bree from "bree";

const STALE_THRESHOLD_HOURS = 24;
const MAX_CONCURRENCY = 5;

/**
 * Map a registry entry to the cinema IDs it covers. Multi-venue scrapers (BFI,
 * Electric) write a separate scraper_runs row per venue, so we collect all of
 * them. Chain entries cover N cinemas; we look up by chain via the registry's
 * chainName via runtime introspection of the config.
 */
function cinemaIdsForEntry(entry: ScraperRegistryEntry): string[] {
  const config = entry.buildConfig();
  if (config.type === "single") return [config.venue.id];
  if (config.type === "multi") return config.venues.map((v) => v.id);
  if (config.type === "chain") return config.venues.map((v) => v.id);
  return [];
}

interface LastRunRow {
  cinemaId: string;
  lastCompletedAt: Date | null;
}

/**
 * One DB hit returns latest `completed_at` per cinema, including `null` rows
 * for cinemas that have never produced a successful run.
 */
async function fetchLastRunPerCinema(): Promise<Map<string, Date | null>> {
  const result = await db.execute(sql`
    SELECT
      cinema_id AS "cinemaId",
      MAX(completed_at) FILTER (WHERE status = 'success') AS "lastCompletedAt"
    FROM ${scraperRuns}
    GROUP BY cinema_id
  `);

  // Drizzle's `db.execute` returns the postgres-js result wrapper; runtime
  // shape is `Array<row>`. Cast through unknown to align with the per-row
  // shape we projected in the SELECT above.
  const rows = result as unknown as LastRunRow[];

  const map = new Map<string, Date | null>();
  for (const row of rows) {
    const completedAt =
      row.lastCompletedAt == null
        ? null
        : row.lastCompletedAt instanceof Date
          ? row.lastCompletedAt
          : new Date(row.lastCompletedAt as unknown as string);
    map.set(row.cinemaId, completedAt);
  }
  return map;
}

/**
 * Identify scrapers due for catch-up. A registry entry is "due" if ANY of its
 * cinemas has either no successful run on record or a most-recent successful
 * run older than 24 hours.
 */
async function findDueEntries(): Promise<ScraperRegistryEntry[]> {
  const lastRunMap = await fetchLastRunPerCinema();
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000);

  const due: ScraperRegistryEntry[] = [];
  for (const entry of SCRAPER_REGISTRY) {
    if (entry.wave === "enrichment") continue;

    let cinemaIds: string[];
    try {
      cinemaIds = cinemaIdsForEntry(entry);
    } catch (err) {
      console.warn(
        `[catch-up] Skipping ${entry.taskId} — buildConfig threw: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      continue;
    }

    const isStale = cinemaIds.some((id) => {
      const last = lastRunMap.get(id);
      if (!last) return true;
      return last.getTime() < cutoff.getTime();
    });

    if (isStale) due.push(entry);
  }

  return due;
}

/**
 * Wait for the worker for `jobName` to exit. Bree stores the live Worker on
 * `bree.workers`. Resolves once the worker emits `exit`, or immediately if
 * there is no worker registered (already finished).
 */
function waitForWorkerExit(bree: Bree, jobName: string): Promise<void> {
  const worker = bree.workers.get(jobName);
  if (!worker) return Promise.resolve();
  return new Promise<void>((resolve) => {
    worker.once("exit", () => resolve());
  });
}

/**
 * Run catch-up dispatches sequentially. Bree only allows one instance of a
 * given job (`catch-up`) at a time, and the worker reads its target task ID
 * from `process.env.SCHEDULER_CATCHUP_TASK_ID`. We wait for each worker to
 * exit before starting the next so env-var dispatch is deterministic.
 *
 * MAX_CONCURRENCY is intentionally a no-op today — kept as a documented knob
 * so a future change (per-worker workerData) can lift the env-var coupling.
 */
async function dispatchSequentially(
  bree: Bree,
  entries: ScraperRegistryEntry[],
): Promise<void> {
  void MAX_CONCURRENCY; // reserved for future per-worker dispatch
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    process.env.SCHEDULER_CATCHUP_TASK_ID = entry.taskId;
    console.log(`[catch-up] Dispatching ${entry.taskId} (${i + 1}/${entries.length})`);
    try {
      await bree.run("catch-up");
      await waitForWorkerExit(bree, "catch-up");
    } catch (err) {
      console.warn(
        `[catch-up] Dispatch failed for ${entry.taskId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

export interface CatchUpReport {
  totalDue: number;
  dispatched: string[];
}

/**
 * Public entry point — run the catch-up scan and dispatch workers. Returns a
 * lightweight report for logging by the scheduler index.
 */
export async function runCatchUpScan(bree: Bree): Promise<CatchUpReport> {
  console.log("[catch-up] Starting scan");
  const due = await findDueEntries();
  if (due.length === 0) {
    console.log("[catch-up] All scrapers up to date — no catch-up needed");
    return { totalDue: 0, dispatched: [] };
  }

  console.log(
    `[catch-up] ${due.length} scrapers due:` +
      `\n  ${due
        .map((e) => `${e.taskId} (${cinemaIdsForEntry(e).map((id) => getCinemaById(id)?.name ?? id).join(", ")})`)
        .join("\n  ")}`,
  );

  await dispatchSequentially(bree, due);
  return { totalDue: due.length, dispatched: due.map((e) => e.taskId) };
}
