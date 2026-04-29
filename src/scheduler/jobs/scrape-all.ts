/**
 * Bree worker — daily scrape-all orchestrator.
 *
 * Runs as a worker thread spawned by Bree at the configured cron time. Calls
 * the pure-Node runScrapeAll() job module and exits cleanly on success or
 * failure (after posting a Telegram alert on error).
 */

import { runScrapeAll } from "@/lib/jobs/scrape-all";
import { sendTelegramAlert } from "@/lib/telegram";

async function main(): Promise<void> {
  console.log("[scheduler:scrape-all] Starting");
  try {
    const result = await runScrapeAll();
    console.log(
      `[scheduler:scrape-all] Done — ${result.totalSucceeded} succeeded, ` +
        `${result.totalFailed} failed in ${result.durationMin}min`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scheduler:scrape-all] Fatal error:", err);
    await sendTelegramAlert({
      title: "Scheduler: scrape-all FAILED",
      message: `Job threw before completion: ${message}`,
      level: "error",
    }).catch(() => undefined);
    process.exitCode = 1;
  }
}

main().then(() => process.exit(process.exitCode ?? 0));
