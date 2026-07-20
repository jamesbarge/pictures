import { describe, expect, it } from "vitest";
import { fetchIndyShowings, checkIndyHealth, type IndyVenue, type IndyFetch } from "./indy";

const VENUE: IndyVenue = {
  cinemaId: "regent-street",
  baseUrl: "https://www.regentstreetcinema.com",
  circuitId: "19",
  siteId: "85",
};

// Reference "now": 09:00 UTC on the fixture date, so 11:15/15:00/18:45 are
// future and 08:00 is past.
const NOW = new Date("2026-07-18T09:00:00Z");

const movie = {
  id: "33278",
  name: "The Odyssey",
  urlSlug: "the-odyssey",
  duration: 173,
  rating: "15",
  releaseDate: "2026-07-17",
};

// Real captured payload (regentstreetcinema.com/graphql, siteIds:[85]) plus
// synthetic edge rows for the filters.
const SHOWINGS = [
  { id: "449131", time: "2026-07-18T11:15:00Z", published: true, past: false, private: false, isPreview: false, screenId: "117", movie },
  { id: "449130", time: "2026-07-18T15:00:00Z", published: true, past: false, private: false, isPreview: false, screenId: "117", movie },
  { id: "449129", time: "2026-07-18T18:45:00Z", published: true, past: false, private: false, isPreview: false, screenId: "117", movie },
  { id: "449131", time: "2026-07-18T11:15:00Z", published: true, past: false, private: false, isPreview: false, screenId: "117", movie }, // duplicate id
  { id: "449128", time: "2026-07-18T08:00:00Z", published: true, past: false, private: false, isPreview: false, screenId: "117", movie }, // before NOW
  { id: "449127", time: "2026-07-18T20:00:00Z", published: false, past: false, private: false, isPreview: false, screenId: "117", movie }, // unpublished
  { id: "449126", time: "2026-07-18T20:30:00Z", published: true, past: true, private: false, isPreview: false, screenId: "117", movie }, // past
  { id: "449125", time: "2026-07-18T21:00:00Z", published: true, past: false, private: true, isPreview: false, screenId: "117", movie }, // private
  { id: "449124", time: "2026-07-18T21:30:00Z", published: true, past: false, private: false, isPreview: true, screenId: "117", movie }, // preview
];

function fakeFetch(payloadForDate: (date: string) => unknown): IndyFetch {
  return (async (_url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}");
    const date = body.variables?.date as string;
    return {
      ok: true,
      json: async () => payloadForDate(date),
    } as unknown as Response;
  }) as IndyFetch;
}

describe("fetchIndyShowings", () => {
  it("maps published future showings, dedupes by id, and filters the rest", async () => {
    const fetchImpl = fakeFetch((date) =>
      date === "2026-07-18"
        ? { data: { showingsForDate: { data: SHOWINGS, count: SHOWINGS.length } } }
        : { data: { showingsForDate: { data: [] } } },
    );

    const screenings = await fetchIndyShowings(VENUE, { days: 1, now: NOW, fetchImpl, delayMs: 0 });

    // Only the 3 valid, distinct, future, published showings survive.
    expect(screenings.map((s) => s.sourceId)).toEqual([
      "regent-street-449131",
      "regent-street-449130",
      "regent-street-449129",
    ]);
    const first = screenings[0];
    expect(first.filmTitle).toBe("The Odyssey");
    expect(first.bookingUrl).toBe("https://www.regentstreetcinema.com/checkout/showing/449131");
    expect(first.datetime.toISOString()).toBe("2026-07-18T11:15:00.000Z");
    expect(first.timeSource).toBe("iso");
    expect(first.runtime).toBe(173);
    expect(first.year).toBe(2026); // from releaseDate 2026-07-17
  });

  it("returns empty when the venue has no showings in the horizon", async () => {
    const fetchImpl = fakeFetch(() => ({ data: { showingsForDate: { data: [] } } }));
    const screenings = await fetchIndyShowings(VENUE, { days: 1, now: NOW, fetchImpl, delayMs: 0 });
    expect(screenings).toEqual([]);
  });

  it("throws on an INDY error instead of returning empty success", async () => {
    // Bad/missing site headers => {"error":{"message":"Site not found..."}}.
    const fetchImpl = fakeFetch(() => ({ error: { message: "Site not found. (Code: 104)" } }));
    await expect(
      fetchIndyShowings(VENUE, {
        days: 1,
        now: NOW,
        fetchImpl,
        delayMs: 0,
        attempts: 1,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/Site not found/);
  });

  it("queries consecutive London days across a BST spring-forward (no skip/dup)", async () => {
    const requested: string[] = [];
    const fetchImpl = (async (_url: string, init?: { body?: string }) => {
      requested.push(JSON.parse(init?.body ?? "{}").variables.date);
      return { ok: true, json: async () => ({ data: { showingsForDate: { data: [] } } }) } as unknown as Response;
    }) as IndyFetch;
    // Sat 23:30 UTC, night before GMT→BST (2026-03-29 01:00). A naive +24h step
    // from here would skip the 23-hour Sunday; the noon-anchored loop must not.
    await fetchIndyShowings(VENUE, {
      now: new Date("2026-03-28T23:30:00Z"),
      days: 4,
      fetchImpl,
      delayMs: 0,
    });
    expect(requested).toEqual(["2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"]);
  });

  it("throws on a non-ok HTTP response", async () => {
    const fetchImpl = (async () =>
      ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response) as IndyFetch;
    await expect(
      fetchIndyShowings(VENUE, {
        days: 1,
        now: NOW,
        fetchImpl,
        delayMs: 0,
        attempts: 1,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("throws on a GraphQL errors[] response", async () => {
    const fetchImpl = fakeFetch(() => ({ errors: [{ message: "Cannot query field foo" }] }));
    await expect(
      fetchIndyShowings(VENUE, {
        days: 1,
        now: NOW,
        fetchImpl,
        delayMs: 0,
        attempts: 1,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/Cannot query field foo/);
  });

  it("uses the venue's horizonDays override when opts.days is omitted", async () => {
    const VENUE_WITH_HORIZON: IndyVenue = { ...VENUE, horizonDays: 5 };
    let requestCount = 0;
    const fetchImpl: IndyFetch = (async () => {
      requestCount++;
      return { ok: true, json: async () => ({ data: { showingsForDate: { data: [], count: 0 } } }) } as unknown as Response;
    }) as IndyFetch;

    // opts.days deliberately omitted — must fall back to venue.horizonDays (5),
    // not the shared DEFAULT_HORIZON_DAYS (35).
    await fetchIndyShowings(VENUE_WITH_HORIZON, { now: NOW, fetchImpl, delayMs: 0 });

    expect(requestCount).toBe(5);
  });

  it("still uses the shared default when a venue has no horizonDays override", async () => {
    let requestCount = 0;
    const fetchImpl: IndyFetch = (async () => {
      requestCount++;
      return { ok: true, json: async () => ({ data: { showingsForDate: { data: [], count: 0 } } }) } as unknown as Response;
    }) as IndyFetch;

    await fetchIndyShowings(VENUE, { now: NOW, fetchImpl, delayMs: 0 });

    expect(requestCount).toBe(35);
  });

  it("dedupes a showing id returned under multiple date responses", async () => {
    const s = { id: "500", time: "2026-07-18T20:00:00Z", published: true, past: false, private: false, isPreview: false, screenId: "1", movie };
    // Same showing echoed for every date in the horizon.
    const fetchImpl = fakeFetch(() => ({ data: { showingsForDate: { data: [s] } } }));
    const screenings = await fetchIndyShowings(VENUE, { days: 3, now: NOW, fetchImpl, delayMs: 0 });
    expect(screenings.map((x) => x.sourceId)).toEqual(["regent-street-500"]);
  });
});

describe("checkIndyHealth", () => {
  it("returns true when the endpoint returns data without error", async () => {
    const fetchImpl = fakeFetch(() => ({ data: { showingsForDate: { data: [] } } }));
    expect(await checkIndyHealth(VENUE, fetchImpl)).toBe(true);
  });

  it("returns false when the endpoint errors (the one place empty is ok)", async () => {
    const fetchImpl = fakeFetch(() => ({ error: { message: "Site not found. (Code: 104)" } }));
    expect(await checkIndyHealth(VENUE, fetchImpl)).toBe(false);
  });
});
