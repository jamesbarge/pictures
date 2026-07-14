/**
 * INDY Systems platform client (INDY Cinema Group, "powered by Fandango").
 *
 * Shared GraphQL client for London cinemas on the INDY booking platform. Each
 * venue proxies `/graphql` on its own domain; the endpoint is OPEN — a plain
 * POST with two identifying headers (`circuit-id`, `site-id`) returns showings,
 * no auth token / cookie / CSRF required. This replaces the old per-scraper
 * Playwright response-interception (which waited on fragile 20s/3s timers) with
 * a deterministic direct `fetch()`.
 *
 * Known INDY venues (circuit-id / site-id):
 *   - Regent Street Cinema — 19 / 85 (regentstreetcinema.com)
 *   - The Chiswick Cinema  — 56 / 170 (chiswickcinema.co.uk)
 * Discover a new venue's ids by reading the `circuit-id` / `site-id` headers on
 * any `/graphql` request the site makes (constant per venue).
 *
 * NOTE: Phoenix Cinema (East Finchley) is NOT on INDY — it's an ASP.NET `.dll`
 * system (`PhoenixCinemaLondon.dll`); see cinemas/phoenix.ts.
 */

import { sanitizeRuntime } from "../utils/metadata-parser";
import type { RawScreening } from "../types";

export interface IndyVenue {
  /** Our cinema id, e.g. "regent-street" — also the sourceId prefix. */
  cinemaId: string;
  /** Venue site origin, e.g. "https://www.regentstreetcinema.com". */
  baseUrl: string;
  /** INDY `circuit-id` header value, e.g. "19". */
  circuitId: string;
  /** INDY `site-id` header + `siteIds` variable value, e.g. "85". */
  siteId: string;
}

interface IndyMovie {
  id: string;
  name: string;
  urlSlug?: string | null;
  duration?: number | null;
  rating?: string | null;
  releaseDate?: string | null;
}

interface IndyShowing {
  id: string;
  time: string; // ISO UTC, e.g. "2026-07-18T11:15:00Z"
  published: boolean;
  past: boolean;
  private?: boolean;
  isPreview?: boolean;
  screenId?: string | null;
  movie: IndyMovie;
}

interface IndyResponse {
  data?: { showingsForDate?: { data?: IndyShowing[] | null; count?: number } | null } | null;
  errors?: Array<{ message: string }>;
  // INDY returns a top-level `error` object for bad/missing site headers
  // (e.g. {"error":{"message":"Site not found. (Code: 104)"}}).
  error?: { message: string };
}

const SHOWINGS_QUERY =
  "query ($date: String, $siteIds: [ID]) { showingsForDate(date: $date, siteIds: $siteIds) " +
  "{ data { id time published past private isPreview screenId " +
  "movie { id name urlSlug duration rating releaseDate } } count } }";

export type IndyFetch = typeof fetch;

const DEFAULT_HORIZON_DAYS = 35;
const DEFAULT_REQUEST_DELAY_MS = 250;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 500;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * YYYY-MM-DD in Europe/London, `offset` calendar days after `from`'s London
 * date. Anchors arithmetic at NOON UTC (12:00/13:00 London — always inside the
 * same calendar day) so stepping never skips or duplicates a day across a
 * BST↔GMT transition, the way raw `+ offset*86_400_000` from a near-midnight
 * `now` would (spring-forward's 23h day gets jumped clean over).
 */
function londonDateKey(from: Date, offset: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(from);
  const num = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  // Date.UTC normalizes day-of-month overflow (e.g. day 32 → next month).
  const anchored = new Date(Date.UTC(num("year"), num("month") - 1, num("day") + offset, 12));
  const yyyy = anchored.getUTCFullYear();
  const mm = String(anchored.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(anchored.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Deterministic failure (bad site headers, GraphQL error, HTTP 4xx) that won't
 * fix itself on retry — surfaced immediately instead of burning all attempts.
 */
class DeterministicIndyError extends Error {}

/**
 * POST showingsForDate for one date. Retries TRANSIENT failures (network / 5xx
 * / parse) and THROWS if all attempts fail; deterministic API errors fail fast.
 * Never swallowed as an empty success (SCRAPING_PLAYBOOK.md failure semantics).
 */
async function postShowingsForDate(
  venue: IndyVenue,
  date: string,
  fetchFn: IndyFetch,
  attempts: number,
  retryDelayMs: number,
): Promise<IndyShowing[]> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchFn(`${venue.baseUrl}/graphql`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/graphql-response+json,application/json;q=0.9",
          "circuit-id": venue.circuitId,
          "site-id": venue.siteId,
          "client-type": "consumer",
        },
        body: JSON.stringify({
          query: SHOWINGS_QUERY,
          variables: { date, siteIds: [venue.siteId] },
        }),
      });
      if (!res.ok) {
        const msg = `HTTP ${res.status} for ${venue.cinemaId} ${date}`;
        // 4xx won't fix on retry; 5xx might be transient.
        throw res.status < 500 ? new DeterministicIndyError(msg) : new Error(msg);
      }
      const json = (await res.json()) as IndyResponse;
      if (json.error) {
        throw new DeterministicIndyError(
          `INDY error for ${venue.cinemaId} ${date}: ${json.error.message}`,
        );
      }
      if (json.errors?.length) {
        throw new DeterministicIndyError(
          `GraphQL error for ${venue.cinemaId} ${date}: ${json.errors
            .map((e) => e.message)
            .join("; ")}`,
        );
      }
      return json.data?.showingsForDate?.data ?? [];
    } catch (err) {
      if (err instanceof DeterministicIndyError) throw err;
      lastError = err; // transient — retry
      if (i < attempts - 1 && retryDelayMs > 0) await delay(retryDelayMs * (i + 1));
    }
  }
  throw lastError ?? new Error(`INDY request failed for ${venue.cinemaId} ${date}`);
}

export interface FetchIndyOptions {
  /** Horizon in days from `now` (default 35). */
  days?: number;
  /** Injectable fetch (tests). Defaults to global fetch. */
  fetchImpl?: IndyFetch;
  /** Reference "now" (tests). Defaults to new Date(). */
  now?: Date;
  /** Delay between per-date requests (default 250ms). */
  delayMs?: number;
  /** Retry attempts per date request (default 3). */
  attempts?: number;
  /** Base retry backoff (default 500ms). */
  retryDelayMs?: number;
}

/**
 * Fetch an INDY venue's upcoming showings via direct GraphQL, mapped to
 * RawScreening. Loops each day today…+days, dedupes by showing id, and keeps
 * only published, non-past, non-private, non-preview future showings.
 */
export async function fetchIndyShowings(
  venue: IndyVenue,
  opts: FetchIndyOptions = {},
): Promise<RawScreening[]> {
  const days = opts.days ?? DEFAULT_HORIZON_DAYS;
  const fetchFn = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const delayMs = opts.delayMs ?? DEFAULT_REQUEST_DELAY_MS;
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;
  const retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  const seen = new Set<string>();
  const screenings: RawScreening[] = [];

  for (let offset = 0; offset < days; offset++) {
    const date = londonDateKey(now, offset);
    const showings = await postShowingsForDate(venue, date, fetchFn, attempts, retryDelayMs);
    for (const s of showings) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      if (!s.published || s.past || s.private || s.isPreview) continue;
      const datetime = new Date(s.time);
      if (isNaN(datetime.getTime()) || datetime < now) continue;
      screenings.push(mapShowing(venue, s, datetime));
    }
    if (offset < days - 1 && delayMs > 0) await delay(delayMs);
  }

  return screenings;
}

/** Map an INDY showing to a RawScreening (ISO-sourced; sourceId preserved). */
function mapShowing(venue: IndyVenue, s: IndyShowing, datetime: Date): RawScreening {
  const releaseYear = s.movie.releaseDate
    ? new Date(s.movie.releaseDate).getFullYear()
    : undefined;
  return {
    filmTitle: s.movie.name.trim(),
    datetime,
    bookingUrl: `${venue.baseUrl}/checkout/showing/${s.id}`,
    sourceId: `${venue.cinemaId}-${s.id}`,
    runtime: sanitizeRuntime(s.movie.duration ?? null),
    year: releaseYear && !Number.isNaN(releaseYear) ? releaseYear : undefined,
    timeSource: "iso",
  };
}

/**
 * Health check against the REAL dependency: a today `showingsForDate` POST that
 * returns without an INDY/GraphQL error means the endpoint + venue headers work.
 */
export async function checkIndyHealth(venue: IndyVenue, fetchImpl?: IndyFetch): Promise<boolean> {
  try {
    const today = londonDateKey(new Date(), 0);
    await postShowingsForDate(venue, today, fetchImpl ?? fetch, 1, 0);
    return true;
  } catch {
    return false;
  }
}
