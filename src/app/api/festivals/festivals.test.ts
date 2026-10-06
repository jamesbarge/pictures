/**
 * Festival routes, as the SvelteKit frontend calls them: anonymous and with no
 * query params (frontend/src/routes/festivals/** and sitemap.xml/+server.ts).
 * Asserts the fields those callers read.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { queue } = vi.hoisted(() => ({ queue: [] as unknown[][] }));

// Every query-builder method returns the chain; awaiting it yields the next queued result.
vi.mock("@/db", () => {
  const chain: Record<string, unknown> = {
    then: (resolve: (rows: unknown[]) => void) => resolve(queue.shift() ?? []),
  };
  for (const method of ["select", "from", "where", "innerJoin", "orderBy", "limit"]) {
    chain[method] = () => chain;
  }
  return { db: chain };
});

import { GET as listFestivals } from "./route";
import { GET as getFestival } from "./[slug]/route";

const festival = {
  id: "festival-1",
  name: "London Film Festival",
  slug: "lff-2026",
  shortName: "LFF",
  year: 2026,
  description: "The big one",
  websiteUrl: "https://example.com/lff",
  logoUrl: null,
  startDate: "2026-10-08",
  endDate: "2026-10-19",
  programmAnnouncedDate: null,
  memberSaleDate: "2026-09-08T09:00:00.000Z",
  publicSaleDate: "2026-09-15T09:00:00.000Z",
  genreFocus: ["world"],
  venues: ["BFI Southbank"],
  isActive: true,
};

const screening = {
  id: "screening-1",
  datetime: "2026-10-10T18:30:00.000Z",
  format: "35mm",
  screen: "NFT1",
  eventType: null,
  eventDescription: null,
  bookingUrl: "https://example.com/book/1",
  availabilityStatus: null,
  festivalSection: "Gala",
  isPremiere: true,
  premiereType: "uk",
  film: { id: "film-1", title: "A Film", year: 2026, directors: ["A Director"], posterUrl: null, runtime: 101 },
  cinema: { id: "bfi-southbank", name: "BFI Southbank", shortName: "BFI" },
};

beforeEach(() => {
  queue.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/festivals", () => {
  it("returns the fields the festivals page and sitemap read", async () => {
    queue.push([festival]);

    const res = await listFestivals();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
    const body = await res.json();
    expect(body.festivals).toMatchObject([
      {
        id: "festival-1",
        name: "London Film Festival",
        slug: "lff-2026",
        shortName: "LFF",
        year: 2026,
        description: "The big one",
        websiteUrl: "https://example.com/lff",
        logoUrl: null,
        startDate: "2026-10-08",
        endDate: "2026-10-19",
        genreFocus: ["world"],
        venues: ["BFI Southbank"],
        isActive: true,
        status: "upcoming",
        ticketStatus: "on_sale",
      },
    ]);
  });
});

describe("GET /api/festivals/[slug]", () => {
  const params = { params: Promise.resolve({ slug: "lff-2026" }) };

  it("returns the festival and screening fields the detail page reads", async () => {
    queue.push([festival], [screening]);

    const res = await getFestival(new NextRequest("http://localhost/api/festivals/lff-2026"), params);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=120, stale-while-revalidate=300");
    const body = await res.json();
    expect(body.festival).toMatchObject({
      id: "festival-1",
      name: "London Film Festival",
      slug: "lff-2026",
      description: "The big one",
      startDate: "2026-10-08",
      endDate: "2026-10-19",
      status: "upcoming",
    });
    expect(body.screenings).toMatchObject([
      {
        id: "screening-1",
        datetime: "2026-10-10T18:30:00.000Z",
        format: "35mm",
        bookingUrl: "https://example.com/book/1",
        film: { id: "film-1", title: "A Film", year: 2026, directors: ["A Director"], posterUrl: null, runtime: 101 },
        cinema: { id: "bfi-southbank", name: "BFI Southbank", shortName: "BFI" },
      },
    ]);
  });

  it("returns 404 for an unknown slug", async () => {
    queue.push([]);

    const res = await getFestival(new NextRequest("http://localhost/api/festivals/nope"), params);

    expect(res.status).toBe(404);
  });
});
