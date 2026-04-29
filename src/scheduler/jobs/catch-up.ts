/**
 * Bree worker — on-demand catch-up scrape for a single registry entry.
 *
 * Triggered by the scheduler's startup catch-up scan (see src/scheduler/catch-up.ts)
 * via `bree.run('catch-up')`. The worker reads the target task ID from the
 * `SCHEDULER_CATCHUP_TASK_ID` env var and runs that scraper exactly once.
 *
 * Cap on concurrent catch-up runs is enforced by the launcher, not Bree itself.
 */

import { getScraperByTaskId } from "@/scrapers/registry";
import { runScraper } from "@/scrapers/runner-factory";
import { sendTelegramAlert } from "@/lib/telegram";

async function main(): Promise<void> {
  const taskId = process.env.SCHEDULER_CATCHUP_TASK_ID;
  if (!taskId) {
    console.error("[scheduler:catch-up] SCHEDULER_CATCHUP_TASK_ID env not set");
    process.exitCode = 1;
    return;
  }

  const entry = getScraperByTaskId(taskId);
  if (!entry) {
    console.error(`[scheduler:catch-up] Unknown taskId "${taskId}"`);
    process.exitCode = 1;
    return;
  }

  console.log(`[scheduler:catch-up] Running ${taskId}`);
  try {
    const config = entry.buildConfig();
    const result = await runScraper(config, { useValidation: true });
    console.log(
      `[scheduler:catch-up] ${taskId} finished — success=${result.success}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[scheduler:catch-up] ${taskId} threw:`, err);
    await sendTelegramAlert({
      title: "Scheduler: catch-up FAILED",
      message: `${taskId} threw: ${message}`,
      level: "error",
    }).catch(() => undefined);
    process.exitCode = 1;
  }
}

main().then(() => process.exit(process.exitCode ?? 0));
