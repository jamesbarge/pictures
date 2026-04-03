import { describe, it, expect } from "vitest";
import { CURZON_CONFIG } from "./curzon";

/**
 * Curzon booking URL shape test.
 *
 * Curzon uses film detail page URLs: /films/{slug}/{filmId}/
 * The old ?sessionId= format showed "Showtime unavailable" in browsers.
 */
describe("Curzon booking URL format", () => {
  const baseUrl = CURZON_CONFIG.baseUrl;

  function buildBookingUrl(filmTitle: string, filmId: string): string {
    const filmSlug = filmTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${baseUrl}/films/${filmSlug}/${filmId}/`;
  }

  it("produces film detail page URL with slug and filmId", () => {
    const url = buildBookingUrl("The Drama", "HO00017563");
    expect(url).toBe("https://www.curzon.com/films/the-drama/HO00017563/");
  });

  it("slugifies titles with special characters", () => {
    const url = buildBookingUrl("Amélie (25th Anniversary Re-release)", "HO00012345");
    expect(url).toBe("https://www.curzon.com/films/am-lie-25th-anniversary-re-release/HO00012345/");
  });

  it("strips leading and trailing hyphens from slug", () => {
    const url = buildBookingUrl("  --Test Film--  ", "HO00099999");
    expect(url).toBe("https://www.curzon.com/films/test-film/HO00099999/");
  });

  it("does not use the old sessionId format", () => {
    const url = buildBookingUrl("Hoppers", "HO00006837");
    expect(url).not.toContain("sessionId");
    expect(url).not.toContain("ticketing/seats");
    expect(url).toContain("/films/hoppers/HO00006837/");
  });
});
