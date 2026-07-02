import { describe, it, expect, vi, afterEach } from "vitest";
import { CURZON_CONFIG, CURZON_VENUES, createCurzonScraper } from "./curzon";

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
 * Vista OCAPI payload conversion (plan 006).
 *
 * The showtimes response carries each film's `runtimeInMinutes` in
 * relatedData.films. These tests pin that convertToRawScreenings forwards
 * it onto RawScreening.runtime, guarded to the 1-600 band.
 */
describe("CurzonScraper.convertToRawScreenings — runtime capture", () => {
  const venue = CURZON_VENUES.find((v) => v.id === "curzon-soho")!;

  function makeResponse(film: Record<string, unknown>) {
    return {
      businessDate: "2030-06-20",
      showtimes: [
        {
          id: "ST-001",
          schedule: {
            businessDate: "2030-06-20",
            startsAt: "2030-06-20T18:30:00",
            filmStartsAt: "2030-06-20T18:45:00",
          },
          filmId: "HO00017563",
          siteId: "SOH1",
          screenId: "SCR1",
          isSoldOut: false,
          attributeIds: [],
          eventId: null,
        },
      ],
      relatedData: {
        films: [
          {
            id: "HO00017563",
            title: { text: "The Drama" },
            releaseDate: "2025-11-07",
            ...film,
          },
        ],
      },
    };
  }

  function convert(film: Record<string, unknown>) {
    const scraper = createCurzonScraper();
    const internals = scraper as unknown as {
      convertToRawScreenings: (
        data: ReturnType<typeof makeResponse>,
        v: (typeof CURZON_VENUES)[number]
      ) => Array<{ runtime?: number; filmTitle: string; year?: number; sourceId?: string }>;
    };
    return internals.convertToRawScreenings(makeResponse(film), venue);
  }

  it("forwards runtimeInMinutes from the Vista film payload", () => {
    const screenings = convert({ runtimeInMinutes: 137 });
    expect(screenings).toHaveLength(1);
    expect(screenings[0].runtime).toBe(137);
  });

  it("leaves runtime undefined when the payload omits runtimeInMinutes", () => {
    const screenings = convert({});
    expect(screenings).toHaveLength(1);
    expect(screenings[0].runtime).toBeUndefined();
  });

  it("drops runtimeInMinutes 0 and out-of-band values", () => {
    expect(convert({ runtimeInMinutes: 0 })[0].runtime).toBeUndefined();
    expect(convert({ runtimeInMinutes: 9999 })[0].runtime).toBeUndefined();
  });

  it("still extracts title, year, and sourceId (regression)", () => {
    const screenings = convert({ runtimeInMinutes: 137 });
    expect(screenings[0].filmTitle).toBe("The Drama");
    expect(screenings[0].year).toBe(2025);
    expect(screenings[0].sourceId).toBe("curzon-ST-001");
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
