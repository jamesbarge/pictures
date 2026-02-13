/**
 * Eventive API Client
 *
 * Stateless client for the Eventive REST API (https://api.eventive.org).
 * Used by FrightFest and UKJFF which publish structured programmes on Eventive.
 *
 * The API is unauthenticated for public data — the festival SPAs make the same calls.
 * An optional API key can be provided via EVENTIVE_API_KEY env var for higher rate limits.
 */

const EVENTIVE_API_BASE = "https://api.eventive.org";
const DELAY_MS = 500;

// ── Types ────────────────────────────────────────────────────────────────

export interface EventiveFilm {
  id: string;
  name: string;
  short_description?: string;
  description?: string;
  trailer_url?: string;
  still_url?: string;
  poster_url?: string;
  runtime_minutes?: number;
  year?: number;
  directors?: string[];
  tags?: string[];
  sections?: string[];
}

export interface EventiveEvent {
  id: string;
  name: string;
  event_bucket: string;
  film_ids?: string[];
  start_time: string; // ISO 8601
  end_time?: string;
  venue?: {
    id: string;
    name: string;
    address?: string;
  };
  ticket_buckets?: Array<{
    id: string;
    name: string;
    price: number;
    sold_out: boolean;
    available: number;
  }>;
  tags?: string[];
}

// ── Client ───────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Accept-Version": "~1",
  };

  const apiKey = process.env.EVENTIVE_API_KEY;
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  return headers;
}

async function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}

async function fetchEventive<T>(path: string): Promise<T> {
  const url = `${EVENTIVE_API_BASE}${path}`;
  const response = await fetch(url, { headers: getHeaders() });

  if (!response.ok) {
    throw new Error(
      `Eventive API error: ${response.status} ${response.statusText} for ${path}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Get all films for an event bucket (festival edition).
 */
export async function getFilms(eventBucketId: string): Promise<EventiveFilm[]> {
  const result = await fetchEventive<{ films: EventiveFilm[] }>(
    `/event_buckets/${eventBucketId}/films`
  );
  return result.films ?? [];
}

/**
 * Get all events (screenings) for an event bucket.
 */
export async function getEvents(eventBucketId: string): Promise<EventiveEvent[]> {
  await delay();
  const result = await fetchEventive<{ events: EventiveEvent[] }>(
    `/event_buckets/${eventBucketId}/events`
  );
  return result.events ?? [];
}

/**
 * Discover the event_bucket_id from a festival's public Eventive page.
 * The SPA embeds the bucket ID in the page HTML or initial API call.
 */
export async function discoverEventBucket(subdomain: string): Promise<string> {
  const url = `https://${subdomain}.eventive.org`;
  const response = await fetch(url, {
    headers: { "Accept": "text/html" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load Eventive page: ${response.status} for ${url}`
    );
  }

  const html = await response.text();

  // The SPA typically embeds the event_bucket_id in a script tag or meta tag
  // Pattern: "event_bucket":"<id>" or event_bucket_id: "<id>"
  const patterns = [
    /event_bucket["']?\s*:\s*["']([a-f0-9]{24})["']/i,
    /eventBucketId["']?\s*:\s*["']([a-f0-9]{24})["']/i,
    /\/event_buckets\/([a-f0-9]{24})/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error(
    `Could not discover event_bucket_id from ${url}. ` +
    `The page structure may have changed.`
  );
}
