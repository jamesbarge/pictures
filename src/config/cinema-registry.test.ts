/**
 * Cinema Registry Tests
 *
 * Contract tests to ensure cinema IDs remain consistent across
 * the canonical registry and Inngest's scraper resolution.
 */

import { describe, it, expect } from "vitest";
import {
  getActiveCinemas,
  getInngestCinemaId,
  getCinemaById,
  getCanonicalId,
} from "./cinema-registry";
import { getInngestKnownCinemaIds } from "@/inngest/known-ids";

describe("Cinema Registry - Inngest ID Coverage", () => {
  it("every active cinema resolves to an Inngest-known ID", () => {
    const activeCinemas = getActiveCinemas();
    const inngestKnownIds = getInngestKnownCinemaIds();

    const unmappedCinemas: string[] = [];

    for (const cinema of activeCinemas) {
      const inngestId = getInngestCinemaId(cinema.id);

      if (!inngestKnownIds.has(inngestId)) {
        unmappedCinemas.push(
          `${cinema.id} → ${inngestId} (not in Inngest registry or chain mapping)`
        );
      }
    }

    expect(unmappedCinemas).toEqual([]);
  });

  it("INNGEST_ID_OVERRIDES only maps to valid Inngest IDs", () => {
    // Get all cinemas that have Inngest overrides by checking if canonical != Inngest ID
    const activeCinemas = getActiveCinemas();
    const inngestKnownIds = getInngestKnownCinemaIds();

    const invalidOverrides: string[] = [];

    for (const cinema of activeCinemas) {
      const inngestId = getInngestCinemaId(cinema.id);

      // If there's an override (IDs differ), verify the override target exists in Inngest
      if (inngestId !== cinema.id && !inngestKnownIds.has(inngestId)) {
        invalidOverrides.push(
          `${cinema.id} has override to "${inngestId}" but that ID is not in Inngest`
        );
      }
    }

    expect(invalidOverrides).toEqual([]);
  });
});

describe("Cinema Registry - ID Resolution", () => {
  it("getCinemaById resolves legacy IDs to canonical definitions", () => {
    // Test a known legacy ID mapping
    const nickel = getCinemaById("nickel");
    expect(nickel).toBeDefined();
    expect(nickel?.id).toBe("the-nickel");

    const phoenix = getCinemaById("phoenix");
    expect(phoenix).toBeDefined();
    expect(phoenix?.id).toBe("phoenix-east-finchley");
  });

  it("getCanonicalId returns canonical ID for legacy inputs", () => {
    expect(getCanonicalId("nickel")).toBe("the-nickel");
    expect(getCanonicalId("phoenix")).toBe("phoenix-east-finchley");
    expect(getCanonicalId("hackney-picturehouse")).toBe("picturehouse-hackney");
  });

  it("getCanonicalId returns input unchanged for canonical IDs", () => {
    expect(getCanonicalId("bfi-southbank")).toBe("bfi-southbank");
    expect(getCanonicalId("the-nickel")).toBe("the-nickel");
    expect(getCanonicalId("picturehouse-hackney")).toBe("picturehouse-hackney");
  });
});

describe("Cinema Registry - Data Integrity", () => {
  it("all active cinemas have required fields", () => {
    const activeCinemas = getActiveCinemas();

    for (const cinema of activeCinemas) {
      expect(cinema.id).toBeTruthy();
      expect(cinema.name).toBeTruthy();
      expect(cinema.shortName).toBeTruthy();
      expect(cinema.website).toBeTruthy();
      expect(cinema.scraperType).toMatch(/^(cheerio|playwright|api)$/);
      expect(typeof cinema.active).toBe("boolean");
    }
  });

  it("no duplicate cinema IDs in registry", () => {
    const activeCinemas = getActiveCinemas();
    const ids = activeCinemas.map((c) => c.id);
    const uniqueIds = new Set(ids);

    expect(ids.length).toBe(uniqueIds.size);
  });
});
