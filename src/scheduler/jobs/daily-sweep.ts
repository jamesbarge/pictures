/**
 * Bree worker — daily enrichment sweep.
 */

import { runDailySweep } from "@/lib/jobs/daily-sweep";
import { sendTelegramAlert } from "@/lib/telegram";

async function main(): Promise<void> {
  console.log("[scheduler:daily-sweep] Starting");
  try {
    const result = await runDailySweep();
    if (result.skipped) {
      console.log(`[scheduler:daily-sweep] Skipped: ${result.reason}`);
    } else {
      console.log(`[scheduler:daily-sweep] Done in ${result.durationMinutes}min`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scheduler:daily-sweep] Fatal error:", err);
    await sendTelegramAlert({
      title: "Scheduler: daily-sweep FAILED",
      message: `Job threw before completion: ${message}`,
      level: "error",
    }).catch(() => undefined);
    process.exitCode = 1;
  }
}

main().then(() => process.exit(process.exitCode ?? 0));
