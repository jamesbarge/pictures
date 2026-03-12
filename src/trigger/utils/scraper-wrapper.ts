import { runScraper, type ScraperRunnerConfig, type RunnerOptions, type RunnerResult } from "@/scrapers/runner-factory";

import { verifyScraperOutput } from "../verification";
import { sendVerificationAlert } from "../verification-alerts";

/** 4s spacing between Gemini calls to stay within 15 RPM */
const VERIFICATION_PACING_MS = 4_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run a scraper then sequentially verify each successful venue.
 * Verification is best-effort (logged but non-blocking on failure).
 * Verification is best-effort — alerts are sent but DB persistence is skipped.
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

  // Sequentially verify each successful venue with pacing
  const successfulVenues = result.venueResults.filter((vr) => vr.success);
  for (let i = 0; i < successfulVenues.length; i++) {
    const vr = successfulVenues[i];
    try {
      const verification = await verifyScraperOutput({
        cinemaId: vr.venueId,
        cinemaName: venueNameMap.get(vr.venueId) ?? vr.venueName,
      });
      await sendVerificationAlert(verification);
    } catch (err) {
      console.warn(`[scraper-wrapper] verification failed for ${vr.venueId}:`, err);
    }

    // Pace between verification calls (skip after the last one)
    if (i < successfulVenues.length - 1) {
      await sleep(VERIFICATION_PACING_MS);
    }
  }

  return result;
}
