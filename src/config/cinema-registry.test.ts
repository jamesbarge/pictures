import { describe, expect, it } from "vitest";
import {
  CINEMA_REGISTRY,
  getActiveCinemas,
  getActiveCinemaIds,
  getActiveCinemasByChain,
  getApiCinemas,
  getCanonicalId,
  getChainIds,
  getCheeriocinemas,
  getCinemaById,
  getCinemasByChain,
  getIndependentCinemas,
  getLegacyIdMappings,
  getPlaywrightCinemas,
  isLegacyId,
  resolveCinemaId,
  VENUE_LANGUAGE_PRIORS,
} from "./cinema-registry";

describe("getCinemaById", () => {
  it("returns the cinema for a known canonical ID", () => {
    const cinema = getCinemaById("bfi-southbank");
    expect(cinema).toBeDefined();
    expect(cinema?.name).toBe("BFI Southbank");
  });

  it("returns undefined for an unknown ID", () => {
    expect(getCinemaById("xyzzy-plugh")).toBeUndefined();
  });

  it("resolves legacy IDs to the canonical record", () => {
    // Look for a known legacy mapping in the data; if no mappings exist
    // skip the test gracefully.
    const mappings = getLegacyIdMappings();
    if (mappings.size === 0) {
      // No legacy mappings configured — pin that the lookup short-circuits.
      expect(getCinemaById("any-legacy-id")).toBeUndefined();
      return;
    }
    const [legacyId, canonicalId] = mappings.entries().next().value as [
      string,
      string,
    ];
    expect(getCinemaById(legacyId)?.id).toBe(canonicalId);
  });
});

describe("getCanonicalId", () => {
  it("returns the canonical ID for a legacy ID (if any are configured)", () => {
    const mappings = getLegacyIdMappings();
    if (mappings.size > 0) {
      const [legacyId, canonicalId] = mappings.entries().next().value as [
        string,
        string,
      ];
      expect(getCanonicalId(legacyId)).toBe(canonicalId);
    }
  });

  it("returns the input unchanged when it isn't a legacy ID", () => {
    expect(getCanonicalId("bfi-southbank")).toBe("bfi-southbank");
    expect(getCanonicalId("totally-made-up")).toBe("totally-made-up");
  });
});

describe("isLegacyId", () => {
  it("returns true for known legacy IDs (if any configured)", () => {
    const mappings = getLegacyIdMappings();
    if (mappings.size > 0) {
      const [legacyId] = mappings.entries().next().value as [string, string];
      expect(isLegacyId(legacyId)).toBe(true);
    }
  });

  it("returns false for canonical IDs", () => {
    expect(isLegacyId("bfi-southbank")).toBe(false);
  });

  it("returns false for unknown IDs", () => {
    expect(isLegacyId("xyzzy-plugh")).toBe(false);
  });
});

describe("scraperType getters", () => {
  it("getCheeriocinemas returns only active cheerio cinemas", () => {
    for (const c of getCheeriocinemas()) {
      expect(c.active).toBe(true);
      expect(c.scraperType).toBe("cheerio");
    }
  });

  it("getPlaywrightCinemas returns only active playwright cinemas", () => {
    for (const c of getPlaywrightCinemas()) {
      expect(c.active).toBe(true);
      expect(c.scraperType).toBe("playwright");
    }
  });

  it("getApiCinemas returns only active api cinemas", () => {
    for (const c of getApiCinemas()) {
      expect(c.active).toBe(true);
      expect(c.scraperType).toBe("api");
    }
  });

  it("scraperType getters are disjoint (no cinema appears in multiple type-buckets)", () => {
    const cheerioIds = new Set(getCheeriocinemas().map((c) => c.id));
    const playwrightIds = new Set(getPlaywrightCinemas().map((c) => c.id));
    const apiIds = new Set(getApiCinemas().map((c) => c.id));

    for (const id of cheerioIds) {
      expect(playwrightIds.has(id)).toBe(false);
      expect(apiIds.has(id)).toBe(false);
    }
    for (const id of playwrightIds) expect(apiIds.has(id)).toBe(false);
  });
});

describe("active vs inactive", () => {
  it("getActiveCinemas excludes inactive cinemas", () => {
    for (const c of getActiveCinemas()) {
      expect(c.active).toBe(true);
    }
  });

  it("getActiveCinemaIds matches getActiveCinemas.map(id)", () => {
    expect(getActiveCinemaIds()).toEqual(getActiveCinemas().map((c) => c.id));
  });

  it("returns at least one active cinema (registry is non-empty + healthy)", () => {
    expect(getActiveCinemas().length).toBeGreaterThan(0);
  });
});

describe("chain getters", () => {
  it("getCinemasByChain('CURZON') returns only Curzon cinemas (across active+inactive)", () => {
    for (const c of getCinemasByChain("curzon")) {
      expect(c.chain).toBe("curzon");
    }
  });

  it("getActiveCinemasByChain('CURZON') is a subset of getCinemasByChain('CURZON')", () => {
    const all = new Set(getCinemasByChain("curzon").map((c) => c.id));
    for (const c of getActiveCinemasByChain("curzon")) {
      expect(all.has(c.id)).toBe(true);
      expect(c.active).toBe(true);
    }
  });

  it("getIndependentCinemas returns cinemas with chain === null", () => {
    for (const c of getIndependentCinemas()) {
      expect(c.chain).toBeNull();
    }
  });

  it("getChainIds returns a deduped set of chain IDs from the registry", () => {
    const chainIds = getChainIds();
    expect(new Set(chainIds).size).toBe(chainIds.length); // deduped

    // Every chain id should resolve to at least one cinema.
    for (const chainId of chainIds) {
      expect(getCinemasByChain(chainId).length).toBeGreaterThan(0);
    }
  });

  it("getChainIds + getIndependentCinemas together cover every cinema in CINEMA_REGISTRY", () => {
    // Pinning the partition invariant: every cinema is either in a chain or
    // independent (chain === null). If a third state is ever added, this
    // test will catch it.
    const independentCount = getIndependentCinemas().length;
    const chainedCount = getChainIds().reduce(
      (sum, chainId) => sum + getCinemasByChain(chainId).length,
      0,
    );
    expect(independentCount + chainedCount).toBe(CINEMA_REGISTRY.length);
  });
});

describe("VENUE_LANGUAGE_PRIORS", () => {
  it("only contains venue ids that exist in the registry", () => {
    const registeredIds = new Set(CINEMA_REGISTRY.map((c) => c.id));
    for (const venueId of Object.keys(VENUE_LANGUAGE_PRIORS)) {
      expect(registeredIds.has(venueId), `unknown venue id: ${venueId}`).toBe(true);
    }
  });

  it("uses lowercase ISO 639-1 language codes", () => {
    for (const languages of Object.values(VENUE_LANGUAGE_PRIORS)) {
      for (const lang of languages) {
        expect(lang).toMatch(/^[a-z]{2}$/);
      }
    }
  });
});

describe("resolveCinemaId", () => {
  it("returns a canonical ID unchanged", () => {
    expect(resolveCinemaId("bfi-southbank")).toBe("bfi-southbank");
  });

  it("resolves the Nickel legacy alias that produced 56 duplicate screenings", () => {
    // 2026-09-08 audit: `nickel` and `the-nickel` both held the same 56 rows.
    expect(resolveCinemaId("nickel")).toBe("the-nickel");
  });

  it("resolves every declared legacy ID to its canonical ID", () => {
    for (const [legacyId, canonicalId] of getLegacyIdMappings()) {
      expect(resolveCinemaId(legacyId)).toBe(canonicalId);
    }
  });

  it("throws for an ID that is in neither the canonical nor the legacy set", () => {
    // getCanonicalId() passes unknown IDs straight through, which is how an
    // unregistered ID reached ensureCinemaExists and minted an orphan venue.
    expect(() => resolveCinemaId("totally-made-up")).toThrow(/not in the cinema registry/i);
  });
});
