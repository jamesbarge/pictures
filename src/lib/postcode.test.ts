/**
 * Postcode Utility Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isValidPostcodeFormat,
  formatPostcode,
  isWithinLondon,
  getLocationName,
  lookupPostcode,
  autocompletePostcode,
  type PostcodeResult,
} from "./postcode";

// =============================================================================
// isValidPostcodeFormat Tests
// =============================================================================

describe("isValidPostcodeFormat", () => {
  describe("valid postcodes", () => {
    const validPostcodes = [
      // Standard formats
      "SW1A 1AA", // Westminster
      "EC1A 1BB", // City of London
      "W1A 0AX", // BBC Broadcasting House
      "M1 1AE", // Manchester
      "B33 8TH", // Birmingham
      "CR2 6XH", // Croydon
      "DN55 1PT", // Doncaster
      "GIR 0AA", // Girobank (special postcode)
      // Without spaces
      "SW1A1AA",
      "EC1A1BB",
      "W1A0AX",
      // Lowercase
      "sw1a 1aa",
      "ec1a1bb",
      // Mixed case
      "Sw1A 1aA",
    ];

    it.each(validPostcodes)("should accept valid postcode: %s", (postcode) => {
      expect(isValidPostcodeFormat(postcode)).toBe(true);
    });
  });

  describe("invalid postcodes", () => {
    const invalidPostcodes = [
      "", // Empty
      "   ", // Whitespace only
      "12345", // Numbers only
      "ABCDE", // Letters only
      "SW1", // Incomplete
      "SW1A", // Missing inward code
      "SW1A 1", // Incomplete inward code
      "SW1A 1A", // Only one letter in inward code
      "1AA 1AA", // Starting with number
      "AAA 1AA", // Three letters in area
      "SW1A1AAA", // Too long
      "SWIA IAA", // Letter I instead of 1
      "SW1A-1AA", // Hyphen instead of space
    ];

    it.each(invalidPostcodes)(
      "should reject invalid postcode: %s",
      (postcode) => {
        expect(isValidPostcodeFormat(postcode)).toBe(false);
      }
    );
  });

  it("should handle whitespace padding", () => {
    expect(isValidPostcodeFormat("  SW1A 1AA  ")).toBe(true);
    expect(isValidPostcodeFormat("\tEC1A 1BB\n")).toBe(true);
  });
});

// =============================================================================
// formatPostcode Tests
// =============================================================================

describe("formatPostcode", () => {
  describe("adds proper spacing", () => {
    const testCases = [
      { input: "SW1A1AA", expected: "SW1A 1AA" },
      { input: "EC1A1BB", expected: "EC1A 1BB" },
      { input: "W1A0AX", expected: "W1A 0AX" },
      { input: "M11AE", expected: "M1 1AE" },
      { input: "B338TH", expected: "B33 8TH" },
      { input: "GIR0AA", expected: "GIR 0AA" },
    ];

    it.each(testCases)(
      "formats $input as $expected",
      ({ input, expected }) => {
        expect(formatPostcode(input)).toBe(expected);
      }
    );
  });

  describe("normalizes existing spacing", () => {
    it("removes extra spaces", () => {
      expect(formatPostcode("SW1A  1AA")).toBe("SW1A 1AA");
      expect(formatPostcode("SW1A   1AA")).toBe("SW1A 1AA");
    });

    it("handles leading/trailing whitespace", () => {
      expect(formatPostcode("  SW1A1AA  ")).toBe("SW1A 1AA");
    });
  });

  describe("handles uppercase conversion", () => {
    it("converts to uppercase", () => {
      expect(formatPostcode("sw1a1aa")).toBe("SW1A 1AA");
      expect(formatPostcode("Sw1a 1Aa")).toBe("SW1A 1AA");
    });
  });

  describe("edge cases", () => {
    it("returns short strings unchanged", () => {
      expect(formatPostcode("SW1")).toBe("SW1");
      expect(formatPostcode("SW1A")).toBe("SW1A");
    });

    it("handles empty string", () => {
      expect(formatPostcode("")).toBe("");
    });

    it("handles minimum valid length (5 chars)", () => {
      expect(formatPostcode("M11AE")).toBe("M1 1AE");
    });
  });
});

// =============================================================================
// isWithinLondon Tests
// =============================================================================

describe("isWithinLondon", () => {
  describe("locations within London", () => {
    const londonLocations = [
      { name: "Central London (Trafalgar Square)", lat: 51.508, lng: -0.128 },
      { name: "East London (Stratford)", lat: 51.543, lng: -0.003 },
      { name: "South London (Brixton)", lat: 51.461, lng: -0.116 },
      { name: "West London (Hammersmith)", lat: 51.493, lng: -0.223 },
      { name: "North London (Highgate)", lat: 51.571, lng: -0.146 },
      { name: "BFI Southbank", lat: 51.506, lng: -0.115 },
    ];

    it.each(londonLocations)(
      "should return true for $name",
      ({ lat, lng }) => {
        expect(isWithinLondon(lat, lng)).toBe(true);
      }
    );
  });

  describe("locations outside London", () => {
    const outsideLocations = [
      { name: "Brighton", lat: 50.827, lng: -0.152 },
      { name: "Cambridge", lat: 52.205, lng: 0.119 },
      { name: "Oxford", lat: 51.752, lng: -1.258 },
      { name: "Reading", lat: 51.455, lng: -0.978 },
      { name: "Southend", lat: 51.538, lng: 0.714 },
    ];

    it.each(outsideLocations)(
      "should return false for $name",
      ({ lat, lng }) => {
        expect(isWithinLondon(lat, lng)).toBe(false);
      }
    );
  });

  describe("boundary conditions", () => {
    it("should handle exact boundary values", () => {
      // North boundary: 51.7
      expect(isWithinLondon(51.7, -0.1)).toBe(true);
      expect(isWithinLondon(51.701, -0.1)).toBe(false);

      // South boundary: 51.3
      expect(isWithinLondon(51.3, -0.1)).toBe(true);
      expect(isWithinLondon(51.299, -0.1)).toBe(false);

      // East boundary: 0.2
      expect(isWithinLondon(51.5, 0.2)).toBe(true);
      expect(isWithinLondon(51.5, 0.201)).toBe(false);

      // West boundary: -0.5
      expect(isWithinLondon(51.5, -0.5)).toBe(true);
      expect(isWithinLondon(51.5, -0.501)).toBe(false);
    });
  });
});

// =============================================================================
// getLocationName Tests
// =============================================================================

describe("getLocationName", () => {
  it("should return admin_district when available", () => {
    const result: PostcodeResult = {
      postcode: "E1 6AN",
      latitude: 51.517,
      longitude: -0.073,
      admin_district: "Tower Hamlets",
      parish: null,
      region: "London",
    };

    expect(getLocationName(result)).toBe("Tower Hamlets");
  });

  it("should return formatted postcode when admin_district is null", () => {
    const result: PostcodeResult = {
      postcode: "SW1A1AA",
      latitude: 51.501,
      longitude: -0.141,
      admin_district: null,
      parish: null,
      region: null,
    };

    expect(getLocationName(result)).toBe("SW1A 1AA");
  });

  it("should return formatted postcode when admin_district is empty string", () => {
    const result: PostcodeResult = {
      postcode: "EC1A1BB",
      latitude: 51.518,
      longitude: -0.107,
      admin_district: "",
      parish: null,
      region: "London",
    };

    // Empty string is falsy, so should fall back to postcode
    expect(getLocationName(result)).toBe("EC1A 1BB");
  });

  it("should handle various London boroughs", () => {
    const boroughs = [
      "Camden",
      "Westminster",
      "Hackney",
      "Islington",
      "Lambeth",
      "Southwark",
    ];

    boroughs.forEach((borough) => {
      const result: PostcodeResult = {
        postcode: "TEST 1AA",
        latitude: 51.5,
        longitude: -0.1,
        admin_district: borough,
        parish: null,
        region: "London",
      };

      expect(getLocationName(result)).toBe(borough);
    });
  });
});

// =============================================================================
// lookupPostcode Tests (with mocked fetch)
// =============================================================================

describe("lookupPostcode", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return postcode result on successful lookup", async () => {
    const mockResult: PostcodeResult = {
      postcode: "SW1A 1AA",
      latitude: 51.501009,
      longitude: -0.141588,
      admin_district: "Westminster",
      parish: null,
      region: "London",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 200, result: mockResult }),
    });

    const result = await lookupPostcode("SW1A 1AA");

    expect(result).toEqual(mockResult);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.postcodes.io/postcodes/SW1A1AA"
    );
  });

  it("should normalize postcode before lookup", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          status: 200,
          result: { postcode: "SW1A 1AA", latitude: 51.5, longitude: -0.1, admin_district: null, parish: null, region: null },
        }),
    });

    await lookupPostcode("  sw1a  1aa  ");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.postcodes.io/postcodes/SW1A1AA"
    );
  });

  it("should return null for postcodes that are too short", async () => {
    const result = await lookupPostcode("SW1");

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return null for empty postcode", async () => {
    const result = await lookupPostcode("");

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return null on 404 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await lookupPostcode("ZZ99 9ZZ");

    expect(result).toBeNull();
  });

  it("should return null on API error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 404, result: null }),
    });

    const result = await lookupPostcode("SW1A 1AA");

    expect(result).toBeNull();
  });

  it("should return null and log error on fetch failure", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await lookupPostcode("SW1A 1AA");

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("should throw on non-404 HTTP errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    // The function catches errors and returns null
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await lookupPostcode("SW1A 1AA");

    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });
});

// =============================================================================
// autocompletePostcode Tests (with mocked fetch)
// =============================================================================

describe("autocompletePostcode", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return formatted autocomplete suggestions", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 200,
          result: ["SW1A1AA", "SW1A2AA", "SW1A2AB"],
        }),
    });

    const results = await autocompletePostcode("SW1A");

    expect(results).toEqual(["SW1A 1AA", "SW1A 2AA", "SW1A 2AB"]);
  });

  it("should normalize input before sending request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 200, result: [] }),
    });

    await autocompletePostcode("  sw1a  ");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.postcodes.io/postcodes/SW1A/autocomplete"
    );
  });

  it("should return empty array for input less than 2 characters", async () => {
    const result1 = await autocompletePostcode("");
    const result2 = await autocompletePostcode("S");

    expect(result1).toEqual([]);
    expect(result2).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should return empty array on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const results = await autocompletePostcode("SW1A");

    expect(results).toEqual([]);
  });

  it("should return empty array on fetch failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const results = await autocompletePostcode("SW1A");

    expect(results).toEqual([]);
  });

  it("should return empty array when API returns null result", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 200, result: null }),
    });

    const results = await autocompletePostcode("ZZ99");

    expect(results).toEqual([]);
  });
});
