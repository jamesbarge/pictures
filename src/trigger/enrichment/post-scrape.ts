/**
 * Post-Scrape Enrichment — Trigger.dev task wrapper.
 *
 * @deprecated Thin shim around `runPostScrapeEnrichment` in @/lib/jobs/post-scrape.
 * This file will be deleted when src/trigger/ is removed in the
 * local-scraping-rebuild migration.
 */

import { task } from "@trigger.dev/sdk/v3";
import { runPostScrapeEnrichment } from "@/lib/jobs/post-scrape";

export const postScrapeEnrichment = task({
  id: "enrichment-post-scrape",
  retry: { maxAttempts: 2 },
  run: (payload: { cinemaId: string; cinemaName: string }) => runPostScrapeEnrichment(payload),
});
