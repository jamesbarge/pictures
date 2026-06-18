import { describe, it, expect } from "vitest";
import { parseFilmMetadata, sanitizeRuntime } from "./metadata-parser";

describe("parseFilmMetadata — director validation", () => {
  it("accepts valid director names", () => {
    expect(parseFilmMetadata("Christopher Nolan, USA, 2023, 180m").director).toBe("Christopher Nolan");
  });

  it("accepts ALL CAPS director with 2-3 words", () => {
    expect(parseFilmMetadata("JEAN-LUC GODARD, France, 1965, 87m").director).toBe("JEAN-LUC GODARD");
  });

  it("rejects Screen NFT venue names", () => {
    expect(parseFilmMetadata("Screen NFT1, 2024, 90 mins").director).toBeUndefined();
  });

  it("rejects IMAX screen identifiers", () => {
    expect(parseFilmMetadata("IMAX Screen 2, 2024, 120 mins").director).toBeUndefined();
  });

  it("rejects EDUCATION LEARNING SPACES", () => {
    expect(parseFilmMetadata("EDUCATION LEARNING SPACES ROOM, 2024, 90 mins").director).toBeUndefined();
  });

  it("rejects ALL CAPS with 4+ words (venue names)", () => {
    expect(parseFilmMetadata("BLUE ROOM STUDIO SPACE ONE, 2024, 90 mins").director).toBeUndefined();
  });

  it("rejects strings with day-of-week (schedule text)", () => {
    expect(parseFilmMetadata("Monday 28 April 2026, 90 mins").director).toBeUndefined();
  });

  it("rejects strings with time patterns (schedule text)", () => {
    expect(parseFilmMetadata("Film + intro 20:45, 2024, 90 mins").director).toBeUndefined();
  });

  it("still extracts director from 'dir.' pattern", () => {
    expect(parseFilmMetadata("dir. Frank Capra, USA, 1946, 117 mins.").director).toBe("Frank Capra");
  });

  it("still extracts director from 'directed by' pattern", () => {
    expect(parseFilmMetadata("directed by Denis Villeneuve, 2024, 166 mins").director).toBe("Denis Villeneuve");
  });
});

describe("sanitizeRuntime — 1-600 minute band guard (plan 006)", () => {
  it("accepts a typical feature runtime", () => {
    expect(sanitizeRuntime(97)).toBe(97);
  });

  it("accepts the band edges", () => {
    expect(sanitizeRuntime(1)).toBe(1);
    expect(sanitizeRuntime(600)).toBe(600);
  });

  it("coerces numeric strings (some venue JSON serializes runtime as string)", () => {
    expect(sanitizeRuntime("135")).toBe(135);
    expect(sanitizeRuntime("95 mins")).toBe(95); // parseInt stops at non-digits
  });

  it("truncates fractional minutes", () => {
    expect(sanitizeRuntime(97.5)).toBe(97);
  });

  it("rejects zero and negative values (missing-field sentinels)", () => {
    expect(sanitizeRuntime(0)).toBeUndefined();
    expect(sanitizeRuntime(-90)).toBeUndefined();
  });

  it("rejects values above 600 minutes (parser noise)", () => {
    expect(sanitizeRuntime(601)).toBeUndefined();
    expect(sanitizeRuntime(5400)).toBeUndefined();
  });

  it("rejects null, undefined, and non-numeric inputs", () => {
    expect(sanitizeRuntime(null)).toBeUndefined();
    expect(sanitizeRuntime(undefined)).toBeUndefined();
    expect(sanitizeRuntime("ninety")).toBeUndefined();
    expect(sanitizeRuntime("")).toBeUndefined();
    expect(sanitizeRuntime(NaN)).toBeUndefined();
    expect(sanitizeRuntime({})).toBeUndefined();
  });
});
