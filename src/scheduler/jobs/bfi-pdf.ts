/**
 * Bree worker — weekly BFI programme PDF + changes import (Sunday 06:00 UTC).
 *
 * runProgrammeChangesImport accepts an ImportContext { triggeredBy?: string }.
 */

import { runProgrammeChangesImport } from "@/scrapers/bfi-pdf";
import { sendTelegramAlert } from "@/lib/telegram";

async function main(): Promise<void> {
  console.log("[scheduler:bfi-pdf] Starting");
  try {
    const result = await runProgrammeChangesImport({ triggeredBy: "scheduler:bfi-pdf" });
    console.log(
      `[scheduler:bfi-pdf] Done — status=${result.status}, ` +
        `added=${result.savedScreenings.added}, updated=${result.savedScreenings.updated}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scheduler:bfi-pdf] Fatal error:", err);
    await sendTelegramAlert({
      title: "Scheduler: bfi-pdf FAILED",
      message: `Job threw before completion: ${message}`,
      level: "error",
    }).catch(() => undefined);
    process.exitCode = 1;
  }
}

main().then(() => process.exit(process.exitCode ?? 0));
