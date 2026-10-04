import { describe, expect, it } from "vitest";
import { fetchIndyShowings, type IndyFetch } from "../platforms/indy";
import { REGENT_STREET_VENUE, createRegentStreetScraper } from "./regent-street";

// The mapping/filtering is covered exhaustively in platforms/indy.test.ts; this
// pins the Regent Street wiring and its horizon, which the shared 35-day
// default was truncating (London Baltic Film Festival and Q&A events 5-7
// weeks out were never requested).
describe("Regent Street venue wiring", () => {
  it("has the correct INDY circuit/site ids, domain and horizon", () => {
    expect(REGENT_STREET_VENUE).toEqual({
      cinemaId: "regent-street",
      baseUrl: "https://www.regentstreetcinema.com",
      circuitId: "19",
      siteId: "85",
      horizonDays: 120,
    });
    expect(createRegentStreetScraper().config.cinemaId).toBe("regent-street");
  });

  it("requests every day of the venue horizon and keeps a showing 48 days out", async () => {
    const now = new Date("2026-10-04T09:00:00Z");
    const requestedDates: string[] = [];
    const fetchImpl = (async (_url: string, init?: { body?: string }) => {
      const date = JSON.parse(init?.body ?? "{}").variables?.date as string;
      requestedDates.push(date);
      const data =
        date === "2026-11-21"
          ? [
              {
                id: "900001",
                time: "2026-11-21T20:00:00Z",
                published: true,
                past: false,
                private: false,
                isPreview: false,
                screenId: "1",
                movie: { id: "1", name: "Ulya", urlSlug: "ulya", duration: 95, releaseDate: null },
              },
            ]
          : [];
      return { ok: true, json: async () => ({ data: { showingsForDate: { data } } }) } as unknown as Response;
    }) as IndyFetch;

    const screenings = await fetchIndyShowings(REGENT_STREET_VENUE, { now, fetchImpl, delayMs: 0 });

    expect(requestedDates).toHaveLength(120);
    expect(requestedDates[0]).toBe("2026-10-04");
    expect(requestedDates.at(-1)).toBe("2027-01-31");
    expect(screenings).toHaveLength(1);
    expect(screenings[0].sourceId).toBe("regent-street-900001");
    expect(screenings[0].datetime.toISOString()).toBe("2026-11-21T20:00:00.000Z");
  });
});
