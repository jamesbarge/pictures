/**
 * Festival Scraper System — Public Exports
 *
 * Three layers:
 * 1. Reverse-tagger (batch) — tags existing screenings in the DB
 * 2. Festival detector (inline) — tags new screenings as they're scraped
 * 3. Programme watchdog — monitors festival websites for programme availability
 */

export { reverseTagFestivals, reverseTagFestival } from "./reverse-tagger";
export { FestivalDetector } from "./festival-detector";
export { checkProgrammeAvailability } from "./watchdog";
export {
  FESTIVAL_CONFIGS,
  getAllFestivalConfigs,
  getFestivalConfigsForVenue,
  WATCHDOG_PROBES,
} from "./festival-config";
export type {
  FestivalTaggingConfig,
  TaggingResult,
  FestivalMatch,
  ConfidenceStrategy,
  WatchdogProbe,
} from "./types";
