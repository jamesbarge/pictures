import { schedules } from "@trigger.dev/sdk/v3";

export const bfiPdfImport = schedules.task({
  id: "enrichment-bfi-pdf",
  cron: "0 6 * * 0", // Weekly Sunday 6am UTC
  retry: { maxAttempts: 2 },
  run: async () => {
    const { runBFIImport } = await import("@/scrapers/bfi-pdf");
    return runBFIImport({ triggeredBy: "trigger.dev:bfi-pdf" });
  },
});
