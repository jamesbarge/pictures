import { schedules } from "@trigger.dev/sdk/v3";

export const festivalWatchdog = schedules.task({
  id: "enrichment-festival-watchdog",
  cron: "0 6 * * 4", // Weekly Thursday 6am UTC
  retry: { maxAttempts: 1 },
  run: async () => {
    const { checkProgrammeAvailability } = await import("@/scrapers/festivals/watchdog");
    const results = await checkProgrammeAvailability();
    const detected = results.filter((r: { detected: boolean }) => r.detected).length;

    // If new programmes detected, trigger reverse-tagging
    if (detected > 0) {
      const { reverseTagFestivals } = await import("@/scrapers/festivals/reverse-tagger");
      await reverseTagFestivals();
    }

    return { checked: results.length, detected, results };
  },
});
