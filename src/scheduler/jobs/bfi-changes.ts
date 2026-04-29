/**
 * Bree worker — mid-week BFI programme-changes refresh (Wednesday 10:00 UTC).
 */

import { runProgrammeChangesImport } from "@/scrapers/bfi-pdf";
import { sendTelegramAlert } from "@/lib/telegram";

async function main(): Promise<void> {
  console.log("[scheduler:bfi-changes] Starting");
  try {
    const result = await runProgrammeChangesImport({ triggeredBy: "scheduler:bfi-changes" });
    console.log(
      `[scheduler:bfi-changes] Done — status=${result.status}, ` +
        `added=${result.savedScreenings.added}, updated=${result.savedScreenings.updated}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scheduler:bfi-changes] Fatal error:", err);
    await sendTelegramAlert({
      title: "Scheduler: bfi-changes FAILED",
      message: `Job threw before completion: ${message}`,
      level: "error",
    }).catch(() => undefined);
    process.exitCode = 1;
  }
}

main().then(() => process.exit(process.exitCode ?? 0));
