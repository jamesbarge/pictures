import { schedules } from "@trigger.dev/sdk/v3";

export const bfiCleanup = schedules.task({
  id: "enrichment-bfi-cleanup",
  cron: "0 8 * * 5", // Friday 8am UTC (after Sun PDF + Wed changes)
  retry: { maxAttempts: 1 },
  run: async () => {
    const { runBFICleanup } = await import("@/scrapers/bfi-pdf");
    return runBFICleanup({ triggeredBy: "trigger.dev:bfi-cleanup" });
  },
});
