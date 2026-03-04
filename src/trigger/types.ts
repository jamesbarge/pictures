import type { RunnerResult } from "@/scrapers/runner-factory";

export interface ScraperTaskPayload {
  cinemaId?: string;
  triggeredBy?: string;
}

export type ScraperTaskOutput = RunnerResult;
