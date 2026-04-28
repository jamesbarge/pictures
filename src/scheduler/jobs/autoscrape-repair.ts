/**
 * Bree worker — nightly AutoScrape repair pass.
 *
 * Runs at 05:00 UTC, after scrape-all (03:00) and daily-sweep (04:30) have
 * completed. Identifies cinemas with anomalies / zero-count last runs and
 * attempts AI-driven extraction via Stagehand v3 + DeepSeek-V4-Pro. See
 * src/lib/jobs/autoscrape-repair.ts for the full contract.
 */

import { runAutoscrapeRepair } from "@/lib/jobs/autoscrape-repair";
import { sendTelegramAlert } from "@/lib/telegram";

async function main(): Promise<void> {
  console.log("[scheduler:autoscrape-repair] Starting");
  try {
    const results = await runAutoscrapeRepair();
    if (results.length === 0) {
      console.log("[scheduler:autoscrape-repair] Nothing to do (disabled or no problems)");
      return;
    }
    const recovered = results.filter((r) => r.recovered).length;
    console.log(
      `[scheduler:autoscrape-repair] Done — ${recovered}/${results.length} recovered`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scheduler:autoscrape-repair] Fatal error:", err);
    await sendTelegramAlert({
      title: "Scheduler: autoscrape-repair FAILED",
      message: `Job threw before completion: ${message}`,
      level: "error",
    }).catch(() => undefined);
    process.exitCode = 1;
  }
}

main().then(() => process.exit(process.exitCode ?? 0));
