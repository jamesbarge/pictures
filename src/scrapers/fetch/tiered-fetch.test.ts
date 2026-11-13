import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeTierUsage,
  fetchTextWithEscalation,
  getPaidUsage,
  isChallengePage,
  resetTieredFetchState,
  unwrapRenderedJson,
} from "./tiered-fetch";

const CHALLENGE_HTML = "<html><head><title>Just a moment...</title></head><body></body></html>";
const REAL_HTML = "<html><head><title>What's On | Cinema</title></head><body>films</body></html>";

function firecrawlOk(rawHtml: string, statusCode = 200): Response {
  return new Response(JSON.stringify({ success: true, data: { rawHtml, metadata: { statusCode } } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("isChallengePage", () => {
  it("detects interstitial titles", () => {
    expect(isChallengePage(CHALLENGE_HTML)).toBe(true);
    expect(isChallengePage("<title>Attention Required! | Cloudflare</title>")).toBe(true);
  });

  it("ignores real pages that merely embed Cloudflare scripts", () => {
    expect(isChallengePage(`${REAL_HTML}<script src="/cdn-cgi/challenge-platform/x.js"></script>`)).toBe(false);
  });

  it("trusts the cf-mitigated header", () => {
    expect(isChallengePage(REAL_HTML, new Headers({ "cf-mitigated": "challenge" }))).toBe(true);
  });
});

describe("unwrapRenderedJson", () => {
  it("unwraps Chromium's <pre> rendering of a JSON body", () => {
    const html = '<html><head><meta name="color-scheme" content="light dark"></head><body><pre style="word-wrap: break-word;">{"a":"x &amp; y"}</pre></body></html>';
    expect(JSON.parse(unwrapRenderedJson(html))).toEqual({ a: "x & y" });
  });

  it("leaves ordinary HTML alone", () => {
    expect(unwrapRenderedJson(REAL_HTML)).toBe(REAL_HTML);
  });
});

describe("fetchTextWithEscalation", () => {
  const env = { ...process.env };

  beforeEach(() => {
    resetTieredFetchState();
    process.env.FIRECRAWL_API_KEY = "test-key";
    delete process.env.SCRAPE_FIRECRAWL_MAX_PAGES;
    delete process.env.SCRAPE_FIRECRAWL_MAX_PAGES_PER_VENUE;
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("returns the direct body when not blocked, without calling Firecrawl", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(REAL_HTML, { status: 200 }));
    const result = await fetchTextWithEscalation("https://cinema.test/", { fetchImpl, label: "c1" });
    expect(result).toMatchObject({ tier: "direct", body: REAL_HTML });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(consumeTierUsage("c1")).toEqual({ direct: 1 });
  });

  it("escalates a 403 challenge to Firecrawl", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(CHALLENGE_HTML, { status: 403 }))
      .mockResolvedValueOnce(firecrawlOk(REAL_HTML));
    const result = await fetchTextWithEscalation("https://cinema.test/", { fetchImpl, label: "c2" });
    expect(result).toMatchObject({ tier: "firecrawl", body: REAL_HTML });

    const [endpoint, init] = fetchImpl.mock.calls[1];
    expect(endpoint).toBe("https://api.firecrawl.dev/v2/scrape");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.formats).toEqual(["rawHtml"]); // never an LLM extraction format
    expect(sent.location.country).toBe("GB");
    expect(consumeTierUsage("c2")).toEqual({ firecrawl: 1 });
    expect(getPaidUsage().firecrawlPages).toBe(1);
  });

  it("does not escalate ordinary errors like 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 404, statusText: "Not Found" }));
    await expect(fetchTextWithEscalation("https://cinema.test/x", { fetchImpl })).rejects.toThrow(/HTTP 404/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws the original HTTP 403 when no Firecrawl key is set", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const fetchImpl = vi.fn().mockResolvedValue(new Response(CHALLENGE_HTML, { status: 403 }));
    await expect(fetchTextWithEscalation("https://cinema.test/", { fetchImpl })).rejects.toThrow(/\bHTTP 403\b/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops escalating once the page budget is spent", async () => {
    process.env.SCRAPE_FIRECRAWL_MAX_PAGES = "1";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(CHALLENGE_HTML, { status: 403 }))
      .mockResolvedValueOnce(firecrawlOk(REAL_HTML))
      .mockResolvedValueOnce(new Response(CHALLENGE_HTML, { status: 403 }));
    await fetchTextWithEscalation("https://cinema.test/a", { fetchImpl });
    await expect(fetchTextWithEscalation("https://cinema.test/b", { fetchImpl })).rejects.toThrow(/HTTP 403/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("throws the direct error when Firecrawl also gets a challenge page", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(CHALLENGE_HTML, { status: 403 }))
      .mockResolvedValueOnce(firecrawlOk(CHALLENGE_HTML));
    await expect(fetchTextWithEscalation("https://cinema.test/", { fetchImpl })).rejects.toThrow(/HTTP 403/);
  });

  it("bypasses Firecrawl's cache", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(CHALLENGE_HTML, { status: 403 }))
      .mockResolvedValueOnce(firecrawlOk(REAL_HTML));
    await fetchTextWithEscalation("https://cinema.test/", { fetchImpl });
    const sent = JSON.parse((fetchImpl.mock.calls[1][1] as RequestInit).body as string);
    expect(sent).toMatchObject({ maxAge: 0, storeInCache: false });
  });

  it("goes straight to Firecrawl for a host that already blocked us", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(CHALLENGE_HTML, { status: 403 }))
      .mockResolvedValueOnce(firecrawlOk(REAL_HTML))
      .mockResolvedValueOnce(firecrawlOk(REAL_HTML));
    await fetchTextWithEscalation("https://cinema.test/day/1", { fetchImpl });
    const second = await fetchTextWithEscalation("https://cinema.test/day/2", { fetchImpl });
    expect(second.tier).toBe("firecrawl");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[2][0]).toBe("https://api.firecrawl.dev/v2/scrape");
  });

  it("stops escalating a host once Firecrawl failed for it", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(CHALLENGE_HTML, { status: 403 }))
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(new Response(CHALLENGE_HTML, { status: 403 }));
    await expect(fetchTextWithEscalation("https://cinema.test/a", { fetchImpl })).rejects.toThrow(/HTTP 403/);
    await expect(fetchTextWithEscalation("https://cinema.test/b", { fetchImpl })).rejects.toThrow(/HTTP 403/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("enforces the per-venue page budget", async () => {
    process.env.SCRAPE_FIRECRAWL_MAX_PAGES_PER_VENUE = "1";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(CHALLENGE_HTML, { status: 403 }))
      .mockResolvedValueOnce(firecrawlOk(REAL_HTML))
      .mockResolvedValueOnce(new Response(CHALLENGE_HTML, { status: 403 }))
      .mockResolvedValueOnce(new Response(CHALLENGE_HTML, { status: 403 }))
      .mockResolvedValueOnce(firecrawlOk(REAL_HTML));
    await fetchTextWithEscalation("https://one.test/a", { fetchImpl, label: "v1" });
    await expect(fetchTextWithEscalation("https://one.test/b", { fetchImpl, label: "v1" })).rejects.toThrow(/HTTP 403/);
    // A different venue still has budget.
    const other = await fetchTextWithEscalation("https://two.test/", { fetchImpl, label: "v2" });
    expect(other.tier).toBe("firecrawl");
  });

  it("does not escalate a plain 503 outage", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("down", { status: 503, statusText: "Service Unavailable" }));
    await expect(fetchTextWithEscalation("https://cinema.test/", { fetchImpl })).rejects.toThrow(/HTTP 503/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns a 200 interstitial-looking body when Firecrawl fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(CHALLENGE_HTML, { status: 200 }))
      .mockResolvedValueOnce(new Response("boom", { status: 500 }));
    const result = await fetchTextWithEscalation("https://cinema.test/", { fetchImpl });
    expect(result).toMatchObject({ tier: "direct", status: 200 });
  });

  it("keeps a 200 interstitial-looking page when there is nowhere to escalate", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const fetchImpl = vi.fn().mockResolvedValue(new Response(CHALLENGE_HTML, { status: 200 }));
    const result = await fetchTextWithEscalation("https://cinema.test/", { fetchImpl });
    expect(result.tier).toBe("direct");
  });
});
