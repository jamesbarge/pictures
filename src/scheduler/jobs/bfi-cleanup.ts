/**
 * Bree worker — weekly BFI ghost-film cleanup (Friday 08:00 UTC).
 *
 * runBFICleanup accepts CleanupOptions { triggeredBy?: string; dryRun?: boolean }.
 */

import { runBFICleanup } from "@/scrapers/bfi-pdf";
import { sendTelegramAlert } from "@/lib/telegram";

async function main(): Promise<void> {
  console.log("[scheduler:bfi-cleanup] Starting");
  try {
    const result = await runBFICleanup({ triggeredBy: "scheduler:bfi-cleanup" });
    console.log(
      `[scheduler:bfi-cleanup] Done — durationMs=${result?.durationMs ?? 0}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scheduler:bfi-cleanup] Fatal error:", err);
    await sendTelegramAlert({
      title: "Scheduler: bfi-cleanup FAILED",
      message: `Job threw before completion: ${message}`,
      level: "error",
    }).catch(() => undefined);
    process.exitCode = 1;
  }
}

main().then(() => process.exit(process.exitCode ?? 0));
