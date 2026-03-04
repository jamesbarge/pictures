import { runScraper, type ScraperRunnerConfig, type RunnerOptions, type RunnerResult } from "@/scrapers/runner-factory";
import { verifyScraperOutput } from "../verification";
import { sendVerificationAlert } from "../verification-alerts";

/**
 * Run a scraper then fire-and-forget AI verification for each successful venue.
 * Returns the original RunnerResult — verification never blocks or fails the scrape.
 */
export async function runScraperAndVerify(
  config: ScraperRunnerConfig,
  options?: RunnerOptions,
): Promise<RunnerResult> {
  const result = await runScraper(config, options);

  // Build a lookup for venue names
  const venueNameMap = new Map<string, string>();
  if (config.type === "single") {
    venueNameMap.set(config.venue.id, config.venue.name);
  } else if (config.type === "multi") {
    for (const v of config.venues) venueNameMap.set(v.id, v.name);
  } else if (config.type === "chain") {
    for (const v of config.venues) venueNameMap.set(v.id, v.name);
  }

  // Fire-and-forget verification for each successful venue
  for (const vr of result.venueResults) {
    if (!vr.success) continue;

    verifyScraperOutput({
      cinemaId: vr.venueId,
      cinemaName: venueNameMap.get(vr.venueId) ?? vr.venueName,
    })
      .then((verification) => sendVerificationAlert(verification))
      .catch((err) => {
        console.warn(`[scraper-wrapper] verification failed for ${vr.venueId}:`, err);
      });
  }

  return result;
}
