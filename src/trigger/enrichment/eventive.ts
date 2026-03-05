import { schedules } from "@trigger.dev/sdk/v3";

export const eventiveScrape = schedules.task({
  id: "enrichment-eventive",
  cron: "0 11 * * 1", // Weekly Monday 11am UTC
  retry: { maxAttempts: 2 },
  run: async () => {
    const { scrapeActiveEventiveFestivals } = await import("@/scrapers/festivals/eventive-scraper");
    return scrapeActiveEventiveFestivals();
  },
});
