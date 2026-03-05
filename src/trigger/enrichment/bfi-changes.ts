import { schedules } from "@trigger.dev/sdk/v3";

export const bfiChangesImport = schedules.task({
  id: "enrichment-bfi-changes",
  cron: "0 10 * * 3", // Weekly Wednesday 10am UTC
  retry: { maxAttempts: 2 },
  run: async () => {
    const { runProgrammeChangesImport } = await import("@/scrapers/bfi-pdf");
    return runProgrammeChangesImport({ triggeredBy: "trigger.dev:bfi-changes" });
  },
});
