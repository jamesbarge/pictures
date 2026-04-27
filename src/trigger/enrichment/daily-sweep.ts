/**
 * Daily Enrichment Sweep — Trigger.dev cron wrapper.
 *
 * @deprecated Thin shim around `runDailySweep` in @/lib/jobs/daily-sweep.
 * This file will be deleted when src/trigger/ is removed in the
 * local-scraping-rebuild migration.
 */

import { schedules } from "@trigger.dev/sdk/v3";
import { runDailySweep } from "@/lib/jobs/daily-sweep";

export const dailyEnrichmentSweep = schedules.task({
  id: "enrichment-daily-sweep",
  cron: "30 4 * * *", // 4:30am UTC daily
  retry: { maxAttempts: 1 },
  run: () => runDailySweep(),
});
