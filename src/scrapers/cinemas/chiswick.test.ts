import { describe, expect, it } from "vitest";
import { fetchIndyShowings, type IndyFetch } from "../platforms/indy";
import { CHISWICK_VENUE, createChiswickScraper } from "./chiswick";

// The mapping/filtering is covered exhaustively in platforms/indy.test.ts; this
// pins the Chiswick-specific wiring: the INDY circuit/site ids, the domain, and
// the `chiswick-cinema-{id}` sourceId prefix.
describe("Chiswick venue wiring", () => {
  it("has the correct INDY circuit/site ids and domain", () => {
    expect(CHISWICK_VENUE).toEqual({
      cinemaId: "chiswick-cinema",
      baseUrl: "https://www.chiswickcinema.co.uk",
      circuitId: "56",
      siteId: "170",
    });
    expect(createChiswickScraper().config.cinemaId).toBe("chiswick-cinema");
  });

  it("sends circuit-id 56 / site 170 and produces chiswick-cinema sourceIds", async () => {
    let sentHeaders: Record<string, string> = {};
    let sentSiteIds: unknown;
    const now = new Date("2026-07-18T09:00:00Z");
    const fetchImpl = (async (_url: string, init?: { headers?: Record<string, string>; body?: string }) => {
      sentHeaders = init?.headers ?? {};
      sentSiteIds = JSON.parse(init?.body ?? "{}").variables?.siteIds;
      return {
        ok: true,
        json: async () => ({
          data: {
            showingsForDate: {
              data: [
                {
                  id: "446163",
                  time: "2026-07-18T14:40:00Z",
                  published: true,
                  past: false,
                  private: false,
                  isPreview: false,
                  screenId: "1",
                  movie: { id: "1", name: "The Odyssey", urlSlug: "the-odyssey", duration: 173, releaseDate: "2026-07-17" },
                },
              ],
            },
          },
        }),
      } as unknown as Response;
    }) as IndyFetch;

    const screenings = await fetchIndyShowings(CHISWICK_VENUE, { days: 1, now, fetchImpl, delayMs: 0 });

    expect(sentHeaders["circuit-id"]).toBe("56");
    expect(sentHeaders["site-id"]).toBe("170");
    expect(sentSiteIds).toEqual(["170"]);
    expect(screenings).toHaveLength(1);
    expect(screenings[0].sourceId).toBe("chiswick-cinema-446163");
    expect(screenings[0].bookingUrl).toBe("https://www.chiswickcinema.co.uk/checkout/showing/446163");
  });
});
