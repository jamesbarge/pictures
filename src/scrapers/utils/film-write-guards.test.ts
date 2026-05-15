import { describe, it, expect, vi, beforeEach } from "vitest";
import { sanitizeDirectors, sanitizeYear } from "./film-write-guards";

describe("sanitizeYear", () => {
  it("returns null for empty / zero / negative", () => {
    expect(sanitizeYear(null)).toBeNull();
    expect(sanitizeYear(undefined)).toBeNull();
    expect(sanitizeYear(0)).toBeNull();
    expect(sanitizeYear(-1)).toBeNull();
    expect(sanitizeYear(NaN)).toBeNull();
  });

  it("returns null for the Number('') = 0 case (the year=0 patrol bug)", () => {
    expect(sanitizeYear("")).toBeNull();
  });

  it("returns null for years < 1900 (cinema didn't exist)", () => {
    expect(sanitizeYear(1888)).toBeNull();
    expect(sanitizeYear(1700)).toBeNull();
  });

  it("returns null for years > current+5 (scraper noise)", () => {
    const current = new Date().getUTCFullYear();
    expect(sanitizeYear(current + 10)).toBeNull();
  });

  it("accepts normal years", () => {
    expect(sanitizeYear(1972)).toBe(1972);
    expect(sanitizeYear(2026)).toBe(2026);
    expect(sanitizeYear("1972")).toBe(1972); // coerces string ints
  });
});

describe("sanitizeDirectors", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns [] for non-arrays", () => {
    expect(sanitizeDirectors(null)).toEqual([]);
    expect(sanitizeDirectors("Stanley Kubrick")).toEqual([]);
  });

  it("strips empty / whitespace entries", () => {
    expect(sanitizeDirectors(["", "  ", "Akira Kurosawa"])).toEqual(["Akira Kurosawa"]);
  });

  it("drops only the tainted entries when the array also has valid ones", () => {
    // Patrol bug: scrapers concatenate the cast string with " Starring " as
    // separator. We salvage the valid entries instead of nuking the whole row.
    expect(
      sanitizeDirectors(["Bryan Singer Starring Ian McKellen", "Tom Hooper"])
    ).toEqual(["Tom Hooper"]);
  });

  it("returns [] when EVERY entry is tainted", () => {
    expect(
      sanitizeDirectors(["John Woo Starring Chow Yun-fat", "Akira Kurosawa Starring Toshiro Mifune"])
    ).toEqual([]);
  });

  it("warns when rejecting any Starring-tainted entries", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sanitizeDirectors(["John Woo Starring Chow Yun-fat"], "test");
    expect(warn).toHaveBeenCalled();
  });

  it("preserves multiple legitimate directors", () => {
    expect(sanitizeDirectors(["Joel Coen", "Ethan Coen"])).toEqual(["Joel Coen", "Ethan Coen"]);
  });
});
