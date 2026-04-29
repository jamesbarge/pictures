/**
 * Bree worker — weekly Eventive festival tagging (Monday 11:00 UTC).
 */

import { scrapeActiveEventiveFestivals } from "@/scrapers/festivals/eventive-scraper";
import { sendTelegramAlert } from "@/lib/telegram";

async function main(): Promise<void> {
  console.log("[scheduler:eventive] Starting");
  try {
    const results = await scrapeActiveEventiveFestivals();
    const total = Array.isArray(results) ? results.length : 0;
    console.log(`[scheduler:eventive] Done — ${total} festival results`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scheduler:eventive] Fatal error:", err);
    await sendTelegramAlert({
      title: "Scheduler: eventive FAILED",
      message: `Job threw before completion: ${message}`,
      level: "error",
    }).catch(() => undefined);
    process.exitCode = 1;
  }
}

main().then(() => process.exit(process.exitCode ?? 0));
