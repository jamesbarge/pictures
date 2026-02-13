/**
 * Festival Config ↔ Seed Alignment Test
 * Validates that festival-config.ts and seed-festivals.ts stay in sync.
 */

import { describe, it, expect } from "vitest";
import { FESTIVAL_CONFIGS, WATCHDOG_PROBES } from "./festival-config";
import { londonFestivals } from "@/db/seed-festivals";
import { CINEMA_REGISTRY } from "@/config/cinema-registry";

const registryIds = new Set(CINEMA_REGISTRY.map((c) => c.id));

describe("Festival config ↔ seed alignment", () => {
  it("every config slugBase should have a matching seed entry", () => {
    for (const slugBase of Object.keys(FESTIVAL_CONFIGS)) {
      const matchingSeed = londonFestivals.find((f) =>
        f.slug.startsWith(`${slugBase}-`)
      );
      expect(
        matchingSeed,
        `Config "${slugBase}" has no matching seed entry (expected slug like "${slugBase}-2026")`
      ).toBeDefined();
    }
  });

  it("every seed festival should have a matching config", () => {
    for (const festival of londonFestivals) {
      // Extract slugBase by removing the year suffix
      const slugBase = festival.slug.replace(/-\d{4}$/, "");
      expect(
        FESTIVAL_CONFIGS[slugBase],
        `Seed "${festival.slug}" has no matching config (expected key "${slugBase}")`
      ).toBeDefined();
    }
  });

  it("all config venue IDs should exist in the cinema registry", () => {
    for (const [key, config] of Object.entries(FESTIVAL_CONFIGS)) {
      for (const venueId of config.venues) {
        expect(
          registryIds.has(venueId),
          `Config "${key}" references venue "${venueId}" which doesn't exist in cinema registry`
        ).toBe(true);
      }
    }
  });

  it("all scraped seed venue IDs should match canonical registry IDs", () => {
    for (const festival of londonFestivals) {
      for (const venueId of festival.venues) {
        // Non-scraped venues (vue, odeon, jw3) won't be in registry — that's OK
        // But any venue that IS in config should use canonical IDs
        const slugBase = festival.slug.replace(/-\d{4}$/, "");
        const config = FESTIVAL_CONFIGS[slugBase];
        if (config && config.venues.includes(venueId)) {
          expect(
            registryIds.has(venueId),
            `Seed "${festival.slug}" venue "${venueId}" doesn't match canonical registry ID`
          ).toBe(true);
        }
      }
    }
  });

  it("every config should have a matching watchdog probe", () => {
    for (const slugBase of Object.keys(FESTIVAL_CONFIGS)) {
      const probe = WATCHDOG_PROBES.find((p) => p.slugBase === slugBase);
      expect(
        probe,
        `Config "${slugBase}" has no watchdog probe`
      ).toBeDefined();
    }
  });
});
