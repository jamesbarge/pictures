import { describe, it, expect } from "vitest";
import {
  FESTIVAL_CONFIGS,
  getAllFestivalConfigs,
  getFestivalConfigsForVenue,
  WATCHDOG_PROBES,
} from "./festival-config";

describe("FESTIVAL_CONFIGS", () => {
  it("should have configs for all 11 London festivals", () => {
    expect(Object.keys(FESTIVAL_CONFIGS)).toHaveLength(11);
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

describe("getAllFestivalConfigs", () => {
  it("should return all configs as an array", () => {
    const configs = getAllFestivalConfigs();
    expect(configs).toHaveLength(11);
  });
});

describe("getFestivalConfigsForVenue", () => {
  it("should return configs for BFI Southbank (hosts multiple festivals)", () => {
    const configs = getFestivalConfigsForVenue("bfi-southbank");
    const slugs = configs.map((c) => c.slugBase);
    expect(slugs).toContain("bfi-flare");
    expect(slugs).toContain("bfi-lff");
    expect(slugs).toContain("lsff");
    expect(slugs).toContain("lkff");
    expect(slugs).toContain("docnroll");
  });

  it("should return configs for Prince Charles (exclusive FrightFest venue)", () => {
    const configs = getFestivalConfigsForVenue("prince-charles");
    expect(configs).toHaveLength(1);
    expect(configs[0].slugBase).toBe("frightfest");
  });

  it("should return configs for Genesis (exclusive LIFF venue)", () => {
    const configs = getFestivalConfigsForVenue("genesis");
    expect(configs).toHaveLength(1);
    expect(configs[0].slugBase).toBe("liff");
  });

  it("should return empty for non-festival venues", () => {
    const configs = getFestivalConfigsForVenue("electric-cinema");
    expect(configs).toHaveLength(0);
  });

  it("should return configs for Barbican (hosts UKJFF, LIAF, Doc'n Roll, Open City)", () => {
    const configs = getFestivalConfigsForVenue("barbican");
    const slugs = configs.map((c) => c.slugBase);
    expect(slugs).toContain("ukjff");
    expect(slugs).toContain("liaf");
    expect(slugs).toContain("docnroll");
    expect(slugs).toContain("open-city");
  });
});

describe("WATCHDOG_PROBES", () => {
  it("should have probes for all 11 festivals", () => {
    expect(WATCHDOG_PROBES).toHaveLength(11);
  });

  it("should have valid probeUrls", () => {
    for (const probe of WATCHDOG_PROBES) {
      if (typeof probe.probeUrl === "string") {
        expect(probe.probeUrl).toMatch(/^https?:\/\//);
      } else {
        expect(typeof probe.probeUrl).toBe("function");
        const url = probe.probeUrl(2026);
        expect(url).toMatch(/^https?:\/\//);
      }
    }
  });

  it("should have valid signal types", () => {
    for (const probe of WATCHDOG_PROBES) {
      expect(["content-hash", "page-exists", "element-count"]).toContain(
        probe.signal
      );
    }
  });
});
