/**
 * Tiered fetch with paid-tier escalation for blocked pages.
 *
 * Tier "direct"    — plain fetch with browser headers (free, always tried first).
 * Tier "firecrawl" — Firecrawl /v2/scrape, rawHtml only, `proxy: "auto"` (basic
 *                    proxy first, "enhanced" residential only when needed), GB
 *                    location, cache bypassed (maxAge 0). Used only when the
 *                    direct response is a bot block: 403/429, a 503 carrying
 *                    `cf-mitigated`, or a Cloudflare interstitial title.
 *
 * Firecrawl is used purely as a fetcher. Its LLM extraction formats (json,
 * summary, extract) are never requested — interpretation stays in Claude Code
 * sessions per CLAUDE.md's no-hosted-LLM rule.
 *
 * Budgets and host memory keep one blocked multi-page venue from draining the
 * run or blowing the 600s venue cap:
 *   - process budget  SCRAPE_FIRECRAWL_MAX_PAGES (default 300)
 *   - venue budget    SCRAPE_FIRECRAWL_MAX_PAGES_PER_VENUE (default 40)
 *   - a host that blocked us once goes straight to Firecrawl for the rest of
 *     the process (no 30s direct attempt per page);
 *   - a host where Firecrawl failed is never escalated again this process.
 *
 * Fails soft: with no key, a spent budget or a failed escalation, the original
 * direct error is thrown unchanged (`HTTP <status>: ...`), so callers that
 * classify `HTTP 403` (Close-Up's challenge handling) behave as before. A 200
 * whose title merely looks like an interstitial returns the direct body.
 *
 * Usage per label (cinemaId) is tallied for scraper_runs.metadata.fetchTiers.
 */

export type FetchTier = "direct" | "firecrawl" | "browserbase";

export interface TieredFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Usage bucket — normally the cinemaId. */
  label?: string;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
}

export interface TieredFetchResult {
  body: string;
  tier: FetchTier;
  status: number;
}

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
const DEFAULT_FIRECRAWL_MAX_PAGES = 300;
const DEFAULT_FIRECRAWL_MAX_PAGES_PER_VENUE = 40;

/**
 * Cloudflare interstitial titles. Title-based on purpose: body strings like
 * "challenge-platform" persist in Cloudflare's inline scripts on fully loaded
 * pages (see waitForCloudflare in utils/browser.ts).
 */
const CHALLENGE_TITLES = [
  /^just a moment/i,
  /^one moment, please/i,
  /^please wait/i,
  /^checking your browser/i,
  /attention required.*cloudflare/i,
];

let firecrawlPagesUsed = 0;
const firecrawlPagesByLabel = new Map<string, number>();
/** Hosts that bot-blocked a direct fetch this process: skip straight to Firecrawl. */
const blockedHosts = new Set<string>();
/** Hosts where Firecrawl itself failed this process: stop escalating them. */
const firecrawlFailedHosts = new Set<string>();
const usage = new Map<string, Partial<Record<FetchTier, number>>>();

export function isChallengePage(body: string, headers?: Headers): boolean {
  if (headers?.get("cf-mitigated") === "challenge") return true;
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(body.slice(0, 20_000));
  if (!match) return false;
  const title = match[1].trim();
  return CHALLENGE_TITLES.some((rx) => rx.test(title));
}

function isBlock(status: number, body: string, headers: Headers): boolean {
  if (status === 403 || status === 429) return true;
  // A 503 is usually a real outage; only count it when Cloudflare says so.
  if (status === 503) return headers.has("cf-mitigated") || isChallengePage(body, headers);
  return isChallengePage(body, headers);
}

function envLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function firecrawlAvailable(label?: string, host?: string): boolean {
  if (!process.env.FIRECRAWL_API_KEY) return false;
  if (firecrawlPagesUsed >= envLimit("SCRAPE_FIRECRAWL_MAX_PAGES", DEFAULT_FIRECRAWL_MAX_PAGES)) return false;
  if (host && firecrawlFailedHosts.has(host)) return false;
  if (label) {
    const perVenue = envLimit("SCRAPE_FIRECRAWL_MAX_PAGES_PER_VENUE", DEFAULT_FIRECRAWL_MAX_PAGES_PER_VENUE);
    if ((firecrawlPagesByLabel.get(label) ?? 0) >= perVenue) return false;
  }
  return true;
}

export function recordTierUse(label: string | undefined, tier: FetchTier): void {
  if (!label) return;
  const entry = usage.get(label) ?? {};
  entry[tier] = (entry[tier] ?? 0) + 1;
  usage.set(label, entry);
}

/** Return and clear the tier tally for a label (called when a run is recorded). */
export function consumeTierUsage(label: string): Partial<Record<FetchTier, number>> | undefined {
  const entry = usage.get(label);
  usage.delete(label);
  return entry;
}

/** Process-wide paid usage, for the run summary. */
export function getPaidUsage(): { firecrawlPages: number } {
  return { firecrawlPages: firecrawlPagesUsed };
}

/** Test hook. */
export function resetTieredFetchState(): void {
  firecrawlPagesUsed = 0;
  firecrawlPagesByLabel.clear();
  blockedHosts.clear();
  firecrawlFailedHosts.clear();
  usage.clear();
}

/**
 * Chromium renders a JSON response as <html>…<pre>JSON</pre>…</html>; Firecrawl's
 * rawHtml returns that wrapper. Unwrap it so JSON endpoints still parse.
 */
export function unwrapRenderedJson(html: string): string {
  const m = /^\s*<html[^>]*>\s*<head>[\s\S]*?<\/head>\s*<body>\s*<pre[^>]*>([\s\S]*)<\/pre>[\s\S]*<\/body>\s*<\/html>\s*$/i.exec(html);
  if (!m) return html;
  const inner = m[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  try {
    JSON.parse(inner);
    return inner;
  } catch {
    return html;
  }
}

async function fetchViaFirecrawl(
  url: string,
  label: string | undefined,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ body: string; status: number }> {
  firecrawlPagesUsed++;
  if (label) firecrawlPagesByLabel.set(label, (firecrawlPagesByLabel.get(label) ?? 0) + 1);
  const response = await fetchImpl(FIRECRAWL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["rawHtml"],
      proxy: "auto",
      location: { country: "GB", languages: ["en-GB"] },
      onlyMainContent: false,
      // Listings change daily: never accept Firecrawl's cached copy (its v2
      // default is up to 2 days old) and don't populate the cache either.
      maxAge: 0,
      storeInCache: false,
      timeout: timeoutMs,
    }),
    signal: AbortSignal.timeout(timeoutMs + 15_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`Firecrawl HTTP ${response.status}: ${detail}`);
  }
  const json = (await response.json()) as {
    success?: boolean;
    error?: string;
    data?: { rawHtml?: string; metadata?: { statusCode?: number } };
  };
  if (!json.success || typeof json.data?.rawHtml !== "string") {
    throw new Error(`Firecrawl failed: ${json.error ?? "no rawHtml in response"}`);
  }
  return { body: unwrapRenderedJson(json.data.rawHtml), status: json.data.metadata?.statusCode ?? 200 };
}

/** Try Firecrawl; on any failure remember the host and return null. */
async function tryFirecrawl(
  url: string,
  host: string,
  options: TieredFetchOptions,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<TieredFetchResult | null> {
  try {
    const escalated = await fetchViaFirecrawl(url, options.label, fetchImpl, Math.max(timeoutMs, 60_000));
    if (escalated.status >= 400 || isChallengePage(escalated.body)) {
      throw new Error(`Firecrawl returned a block too (status ${escalated.status})`);
    }
    recordTierUse(options.label, "firecrawl");
    return { body: escalated.body, tier: "firecrawl", status: escalated.status };
  } catch (err) {
    firecrawlFailedHosts.add(host);
    console.warn(
      `[${options.label ?? "fetch"}] Firecrawl escalation failed for ${host} (no further escalation this run): ` +
        `${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

/**
 * Fetch a URL as text, escalating to Firecrawl when the direct request is
 * bot-blocked. Throws `HTTP <status>: <text>` for non-block failures, and the
 * original direct error when escalation is unavailable or also blocked.
 */
export async function fetchTextWithEscalation(url: string, options: TieredFetchOptions = {}): Promise<TieredFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const host = hostOf(url);

  // A host that already blocked us this run: skip the (up to 30s) direct try.
  if (blockedHosts.has(host) && firecrawlAvailable(options.label, host)) {
    const result = await tryFirecrawl(url, host, options, fetchImpl, timeoutMs);
    if (result) return result;
  }

  const response = await fetchImpl(url, {
    headers: options.headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.text();
  const blocked = isBlock(response.status, body, response.headers);

  if (!blocked) {
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    recordTierUse(options.label, "direct");
    return { body, tier: "direct", status: response.status };
  }

  blockedHosts.add(host);
  if (firecrawlAvailable(options.label, host)) {
    console.warn(`[${options.label ?? "fetch"}] Direct fetch blocked (HTTP ${response.status}) — escalating to Firecrawl: ${url}`);
    const result = await tryFirecrawl(url, host, options, fetchImpl, timeoutMs);
    if (result) return result;
  }

  // Nowhere (left) to escalate. A 200 whose title merely looks like an
  // interstitial keeps the old behaviour and returns the body.
  if (response.ok) {
    recordTierUse(options.label, "direct");
    return { body, tier: "direct", status: response.status };
  }
  throw new Error(`HTTP ${response.status}: ${response.statusText} (bot block)`);
}
