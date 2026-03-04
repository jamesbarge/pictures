import { schedules } from "@trigger.dev/sdk/v3";

export const letterboxdEnrichment = schedules.task({
  id: "enrichment-letterboxd",
  cron: "0 8 * * *", // Daily 8am UTC
  retry: { maxAttempts: 1 },
  run: async () => {
    const { enrichLetterboxdRatings } = await import("@/db/enrich-letterboxd");
    return enrichLetterboxdRatings(100, true);
  },
});
