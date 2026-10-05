import { describe, it, expect } from "vitest";
import { FESTIVAL_CONFIGS } from "./festival-config";

describe("FESTIVAL_CONFIGS", () => {
  it("should have configs for all currently supported London festivals", () => {
    expect(Object.keys(FESTIVAL_CONFIGS)).toEqual([
      "frightfest",
      "liff",
      "bfi-flare",
      "raindance",
      "lsff",
      "lkff",
      "open-city",
      "ukjff",
      "liaf",
      "docnroll",
      "bfi-lff",
    ]);
  });

  it("should have valid slugBase for each config", () => {
    for (const [key, config] of Object.entries(FESTIVAL_CONFIGS)) {
      expect(config.slugBase).toBe(key);
      expect(config.venues.length).toBeGreaterThan(0);
      expect(config.typicalMonths.length).toBeGreaterThan(0);
    }
  });

  it("should have titleKeywords for TITLE-strategy festivals", () => {
    for (const config of Object.values(FESTIVAL_CONFIGS)) {
      if (config.confidence === "TITLE") {
        expect(config.titleKeywords).toBeDefined();
        expect(config.titleKeywords!.length).toBeGreaterThan(0);
      }
    }
  });

  it("should have only AUTO or TITLE confidence strategies", () => {
    for (const config of Object.values(FESTIVAL_CONFIGS)) {
      expect(["AUTO", "TITLE"]).toContain(config.confidence);
    }
  });

  it("should have 2 AUTO-confidence festivals (FrightFest, LIFF)", () => {
    const autoFestivals = Object.entries(FESTIVAL_CONFIGS)
      .filter(([, c]) => c.confidence === "AUTO")
      .map(([key]) => key);
    expect(autoFestivals).toEqual(["frightfest", "liff"]);
  });

  it("should have valid month ranges (0-11)", () => {
    for (const config of Object.values(FESTIVAL_CONFIGS)) {
      for (const month of config.typicalMonths) {
        expect(month).toBeGreaterThanOrEqual(0);
        expect(month).toBeLessThanOrEqual(11);
      }
    }
  });
});
