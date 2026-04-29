/**
 * Sanity tests for src/scrapers/registry.ts.
 *
 * The registry is the single source of truth for which cinemas the local
 * scheduler scrapes. These tests guard against three classes of regression:
 *   1. Adding a scraper but forgetting to register it (or vice versa)
 *   2. Duplicate task IDs across waves
 *   3. buildConfig that throws unexpectedly at fan-out time
 */

import { describe, expect, it } from "vitest";
import {
  SCRAPER_REGISTRY,
  getScraperByTaskId,
  getScrapersByWave,
  type ScraperWave,
} from "./registry";

describe("SCRAPER_REGISTRY", () => {
  it("has at least one entry per wave", () => {
    const waves: ScraperWave[] = ["chain", "playwright", "cheerio", "enrichment"];
    for (const wave of waves) {
      expect(SCRAPER_REGISTRY.filter((e) => e.wave === wave).length).toBeGreaterThan(0);
    }
  });

  it("task IDs are unique across the whole registry", () => {
    const ids = SCRAPER_REGISTRY.map((e) => e.taskId);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it("every task ID starts with the conventional 'scraper-' or 'enrichment-' prefix", () => {
    for (const entry of SCRAPER_REGISTRY) {
      expect(
        entry.taskId.startsWith("scraper-") || entry.taskId.startsWith("enrichment-"),
        `taskId '${entry.taskId}' should start with scraper- or enrichment-`,
      ).toBe(true);
    }
  });

  it("type matches wave: chain entries have type='chain'", () => {
    for (const entry of SCRAPER_REGISTRY.filter((e) => e.wave === "chain")) {
      expect(entry.type).toBe("chain");
    }
  });

  it("Playwright + Cheerio waves have only single/multi types", () => {
    for (const entry of SCRAPER_REGISTRY.filter(
      (e) => e.wave === "playwright" || e.wave === "cheerio",
    )) {
      expect(["single", "multi"]).toContain(entry.type);
    }
  });

  it("getScraperByTaskId returns the matching entry for every taskId", () => {
    for (const entry of SCRAPER_REGISTRY) {
      const looked = getScraperByTaskId(entry.taskId);
      expect(looked).toBe(entry);
    }
  });

  it("getScraperByTaskId returns undefined for unknown IDs", () => {
    expect(getScraperByTaskId("scraper-does-not-exist")).toBeUndefined();
    expect(getScraperByTaskId("")).toBeUndefined();
  });

  it("getScrapersByWave partitions the registry without overlap", () => {
    const waves: ScraperWave[] = ["chain", "playwright", "cheerio", "enrichment"];
    const total = waves.flatMap((w) => getScrapersByWave(w));
    expect(total).toHaveLength(SCRAPER_REGISTRY.length);
    const ids = new Set(total.map((e) => e.taskId));
    expect(ids.size).toBe(total.length);
  });

  it("buildConfig is lazy — calling it succeeds without throwing for every non-enrichment entry", () => {
    // The enrichment entry is documented to throw (the orchestrator special-cases
    // the enrichment wave); skip it. All other entries should resolve to a valid
    // config object with the expected shape.
    for (const entry of SCRAPER_REGISTRY.filter((e) => e.wave !== "enrichment")) {
      expect(() => {
        const config = entry.buildConfig();
        expect(config.type).toBe(entry.type);
        if (config.type === "single") {
          expect(config.venue).toBeDefined();
          expect(config.venue.id).toBeTruthy();
          expect(typeof config.createScraper).toBe("function");
        } else if (config.type === "multi") {
          expect(config.venues.length).toBeGreaterThan(0);
          expect(typeof config.createScraper).toBe("function");
        } else if (config.type === "chain") {
          expect(config.chainName).toBeTruthy();
          expect(config.venues.length).toBeGreaterThan(0);
          expect(typeof config.createScraper).toBe("function");
        }
      }, `buildConfig threw for ${entry.taskId}`).not.toThrow();
    }
  });
});
