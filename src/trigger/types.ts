import type { RunnerResult } from "@/scrapers/runner-factory";

/** Payload for a Trigger.dev scraper task invocation */
export interface ScraperTaskPayload {
  cinemaId?: string;
  triggeredBy?: string;
}

/** Output type for scraper tasks, aliased from the runner factory */
export type ScraperTaskOutput = RunnerResult;
