import { describe, it, expect, vi, afterEach } from "vitest";
import { CURZON_CONFIG, createCurzonScraper } from "./curzon";

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

/**
 * Curzon healthCheck contract: Cloudflare blocks HEAD on www.curzon.com, so the
 * scraper probes the Vista API instead. A 401 means Cloudflare let the request
 * through and the API is up (just needs a JWT) → healthy. Only 5xx / network
 * failures mean the service is actually down. (PIC-29)
 */
describe("Curzon healthCheck (401-is-healthy contract)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const fakeResponse = (status: number, ok: boolean) =>
    vi.fn(async () => ({ status, ok }) as unknown as Response);

  it("treats 401 (Cloudflare passed, auth required) as healthy", async () => {
    vi.stubGlobal("fetch", fakeResponse(401, false));
    expect(await createCurzonScraper().healthCheck()).toBe(true);
  });

  it("treats a 2xx response as healthy", async () => {
    vi.stubGlobal("fetch", fakeResponse(200, true));
    expect(await createCurzonScraper().healthCheck()).toBe(true);
  });

  it("treats 5xx as unhealthy", async () => {
    vi.stubGlobal("fetch", fakeResponse(503, false));
    expect(await createCurzonScraper().healthCheck()).toBe(false);
  });

  it("treats a network error / timeout as unhealthy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      })
    );
    expect(await createCurzonScraper().healthCheck()).toBe(false);
  });
});
