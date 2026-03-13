/**
 * AutoScrape Trigger.dev Tasks
 *
 * Two exports following the QA orchestrator pattern:
 *   1. autoScrapeRun — Regular task (API-triggerable, 60 min budget)
 *   2. autoScrapeSchedule — Cron wrapper (1am UTC nightly, skips Mondays)
 *
 * The cron wrapper delegates to autoScrapeRun so that both scheduled
 * and on-demand triggers use the same task type.
 *
 * Note: Trigger.dev cloud has ephemeral filesystem. Overlay fixes and
 * snapshots written during a run don't persist across runs. Each run
 * explores independently and reports via Telegram + DB.
 */

import { schedules, task, tasks } from "@trigger.dev/sdk/v3";
import { sendTelegramAlert } from "../utils/telegram";

// ── Regular task: the actual pipeline (API-triggerable) ──────────────
export const autoScrapeRun = task({
  id: "autoscrape-run",
  maxDuration: 3600, // 60 min
  retry: { maxAttempts: 0 },
  run: async (payload: { triggeredBy?: string }) => {
    console.log(`[autoscrape] Starting, triggeredBy=${payload.triggeredBy ?? "manual"}`);

    const { getScraperFactories } = await import(
      "@/autoresearch/autoscrape/scraper-registry"
    );
    const { runAutoScrapeOvernight } = await import(
      "@/autoresearch/autoscrape/harness"
    );

    return await runAutoScrapeOvernight(getScraperFactories());
  },
});

// ── Cron wrapper: nightly at 1am UTC ─────────────────────────────────
export const autoScrapeSchedule = schedules.task({
  id: "autoscrape-nightly",
  cron: "0 1 * * *", // 1am UTC nightly
  maxDuration: 3600,
  retry: { maxAttempts: 0 },
  run: async () => {
    // Monday overlap guard — scrape-all runs Mon 3am UTC
    const now = new Date();
    if (now.getUTCDay() === 1 && now.getUTCHours() < 5) {
      console.log("[autoscrape] Skipping — Monday overlap guard (scrape-all runs Mon 3am UTC)");
      return { skipped: true, reason: "monday_overlap_guard" };
    }

    const handle = await tasks.triggerAndWait<typeof autoScrapeRun>(
      "autoscrape-run",
      { triggeredBy: "cron" }
    );

    if (!handle.ok) {
      // Trigger.dev serializes errors as plain objects, not Error instances
      const errMsg = handle.error instanceof Error
        ? handle.error.message
        : String(handle.error ?? "unknown");
      await sendTelegramAlert({
        title: "AutoScrape Failed",
        message: errMsg,
        level: "error",
      });
      throw new Error(`AutoScrape failed: ${errMsg}`);
    }

    return handle.output;
  },
});
