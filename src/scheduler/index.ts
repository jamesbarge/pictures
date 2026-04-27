/**
 * Scheduler entry point — Bree-based local cron supervisor.
 *
 * Phase 1 + Phase 5 of the local-scraping rebuild:
 *   - Phase 1: Replace Trigger.dev cron schedules with locally-supervised Bree
 *     workers, each invoking the corresponding pure-Node job in src/lib/jobs/.
 *   - Phase 5: On startup, scan scraper_runs for cinemas whose most recent
 *     successful run is older than 24h and enqueue an immediate catch-up
 *     scrape for each.
 *
 * Run via:
 *   - dev:   npm run scheduler:dev
 *   - prod:  npm run scheduler:start (PM2)
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import Bree from "bree";

// Load .env.local before importing any module that reads from process.env at
// import time (db client, telegram, etc.).
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

import { sendTelegramAlert } from "@/lib/telegram";
import { runCatchUpScan } from "./catch-up";

// Resolve the jobs directory relative to this file rather than CWD, so the
// scheduler works regardless of how it's invoked. Works in both CJS (tsx) and
// ESM bundling — tsx polyfills `import.meta.url` for both worlds.
const SCHEDULER_DIR = path.dirname(fileURLToPath(import.meta.url));
const JOBS_DIR = path.join(SCHEDULER_DIR, "jobs");

const CATCHUP_GRACE_MS = 90_000; // 90s — give the scheduler time to settle

interface JobDefinition {
  name: string;
  cron?: string; // omit for on-demand-only jobs (catch-up)
  description: string;
}

/**
 * Cron schedules (UTC). Times intentionally staggered so two heavy jobs don't
 * collide on the same minute.
 *
 *   scrape-all          03:00 daily     — orchestrates all 27 cinema scrapers
 *   daily-sweep         04:30 daily     — TMDB / poster / Letterboxd enrichment
 *   letterboxd-ratings  08:00 Mondays   — refresh ratings for matched films
 *   bfi-pdf             06:00 Sundays   — full BFI programme PDF + changes
 *   bfi-changes         10:00 Wednesdays — mid-week BFI changes refresh
 *   bfi-cleanup         08:00 Fridays   — ghost-film cleanup
 *   eventive            11:00 Mondays   — festival tagging
 *   catch-up            on-demand        — invoked from runCatchUpScan()
 */
const JOBS: JobDefinition[] = [
  { name: "scrape-all", cron: "0 3 * * *", description: "Daily scrape of all 27 cinemas" },
  { name: "daily-sweep", cron: "30 4 * * *", description: "Daily enrichment sweep" },
  { name: "letterboxd-ratings", cron: "0 8 * * 1", description: "Weekly Letterboxd rating refresh" },
  { name: "bfi-pdf", cron: "0 6 * * 0", description: "Weekly BFI programme PDF import" },
  { name: "bfi-changes", cron: "0 10 * * 3", description: "Mid-week BFI programme changes" },
  { name: "bfi-cleanup", cron: "0 8 * * 5", description: "Weekly BFI ghost-film cleanup" },
  { name: "eventive", cron: "0 11 * * 1", description: "Weekly Eventive festival tagging" },
  { name: "catch-up", description: "On-demand catch-up scrape (one-off)" },
];

function buildBree(): Bree {
  // Bree spawns each job in a worker thread via Node's worker_threads. To run
  // .ts source files directly in those workers, we register tsx as a Node
  // module loader using --import. tsconfig-paths is also re-registered so the
  // `@/` alias resolves inside the worker. Both packages have to be installed
  // (they already are — tsx is a devDep, tsconfig-paths a devDep too).
  const workerExecArgv = ["--import", "tsx", "--require", "tsconfig-paths/register"];

  return new Bree({
    root: JOBS_DIR,
    logger: console,
    // Job filenames live alongside this file as `.ts`; Bree won't look them
    // up unless `.ts` is on the accepted list.
    defaultExtension: "ts",
    acceptedExtensions: [".ts", ".js", ".mjs"],
    worker: {
      execArgv: workerExecArgv,
    },
    jobs: JOBS.map((job) => ({
      name: job.name,
      ...(job.cron ? { cron: job.cron } : {}),
      // Time zone defaults to UTC — explicit for clarity.
      timezone: "UTC",
    })),
  });
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const bree = buildBree();

  bree.on("worker created", (name) => {
    console.log(`[scheduler] worker started: ${name}`);
  });
  bree.on("worker deleted", (name) => {
    console.log(`[scheduler] worker finished: ${name}`);
  });

  await bree.start();

  const cronList = JOBS.filter((j) => j.cron)
    .map((j) => `  - ${j.name}: ${j.cron}  (${j.description})`)
    .join("\n");

  console.log(
    `[scheduler] Bree started at ${startedAt.toISOString()}\n` +
      `Active cron jobs:\n${cronList}\n` +
      `Catch-up scan scheduled in ${CATCHUP_GRACE_MS / 1000}s.`,
  );

  await sendTelegramAlert({
    title: "Scheduler started",
    message:
      `Pictures local scheduler online at ${startedAt.toISOString()}.\n` +
      `Cron jobs:\n${cronList}\n` +
      `Catch-up scan in ${CATCHUP_GRACE_MS / 1000}s.`,
    level: "info",
  }).catch((err) => {
    console.warn("[scheduler] Telegram startup alert failed:", err);
  });

  // Catch-up scan — fire after a grace period so the scheduler is fully up
  // before we start dispatching workers.
  setTimeout(() => {
    runCatchUpScan(bree)
      .then((report) => {
        console.log(
          `[scheduler] Catch-up scan complete — ` +
            `${report.totalDue} due, ${report.dispatched.length} dispatched`,
        );
      })
      .catch((err) => {
        console.error("[scheduler] Catch-up scan failed:", err);
        sendTelegramAlert({
          title: "Scheduler: catch-up scan FAILED",
          message: `Scan threw: ${err instanceof Error ? err.message : String(err)}`,
          level: "error",
        }).catch(() => undefined);
      });
  }, CATCHUP_GRACE_MS).unref();

  // Keep the process alive — Bree's internal cron timers do this, but we make
  // it explicit so PM2's autorestart works as expected if Bree ever exits.
}

main().catch(async (err) => {
  console.error("[scheduler] Fatal startup error:", err);
  await sendTelegramAlert({
    title: "Scheduler startup FAILED",
    message: `Boot error: ${err instanceof Error ? err.message : String(err)}`,
    level: "error",
  }).catch(() => undefined);
  process.exit(1);
});
