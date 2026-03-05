import { schedules } from "@trigger.dev/sdk/v3";

export const festivalReverseTag = schedules.task({
  id: "enrichment-festival-reverse-tag",
  cron: "0 9 * * 1", // Weekly Monday 9am UTC
  retry: { maxAttempts: 1 },
  run: async () => {
    const { reverseTagFestivals } = await import("@/scrapers/festivals/reverse-tagger");
    return reverseTagFestivals();
  },
});
