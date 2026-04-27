/**
 * Bree worker — weekly Letterboxd rating refresh.
 *
 * Calls enrichLetterboxdRatings(100, true) directly (no shared lib/jobs wrapper
 * exists for this — daily-sweep also calls it inline). Runs Mondays at 08:00 UTC.
 */

import { sendTelegramAlert } from "@/lib/telegram";

async function main(): Promise<void> {
  console.log("[scheduler:letterboxd-ratings] Starting");
  try {
    const { enrichLetterboxdRatings } = await import("@/db/enrich-letterboxd");
    const result = await enrichLetterboxdRatings(100, true);
    console.log(
      `[scheduler:letterboxd-ratings] Done — ${result?.enriched ?? 0} enriched`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scheduler:letterboxd-ratings] Fatal error:", err);
    await sendTelegramAlert({
      title: "Scheduler: letterboxd-ratings FAILED",
      message: `Job threw before completion: ${message}`,
      level: "error",
    }).catch(() => undefined);
    process.exitCode = 1;
  }
}

main().then(() => process.exit(process.exitCode ?? 0));
