/**
 * Scrape-All Orchestrator — Trigger.dev schedule wrapper.
 *
 * @deprecated Thin shim around `runScrapeAll` in @/lib/jobs/scrape-all.
 * This file will be deleted when src/trigger/ is removed in the
 * local-scraping-rebuild migration.
 */

import { schedules } from "@trigger.dev/sdk/v3";
import { runScrapeAll } from "@/lib/jobs/scrape-all";

export const scrapeAll = schedules.task({
  id: "scrape-all-orchestrator",
  cron: "0 3 * * *", // Daily 3am UTC
  maxDuration: 5400, // 90 min — sequential waves + chunking overhead
  retry: { maxAttempts: 0 },
  run: () => runScrapeAll(),
});
