/**
 * PostHog API Client
 * Server-side utilities for querying PostHog data via REST API
 *
 * REQUIRED: Set POSTHOG_PERSONAL_API_KEY in .env.local
 * Generate from: PostHog → Settings → Personal API Keys
 */

const POSTHOG_API_HOST = "https://eu.posthog.com";

/**
 * Get the PostHog personal API key from environment
 * This is different from the project key used in the JS SDK
 */
function getApiKey(): string {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) {
    throw new Error(
      "POSTHOG_PERSONAL_API_KEY is not set. " +
        "Generate one from PostHog → Settings → Personal API Keys"
    );
  }
  return key;
}

/**
 * Get the PostHog project ID from the project key
 * The project ID is needed for API queries
 */
function getProjectId(): string {
  // Project ID can be extracted from project settings or set explicitly
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "POSTHOG_PROJECT_ID is not set. " +
        "Find it in PostHog → Project Settings → Project ID"
    );
  }
  return projectId;
}

/**
 * Make an authenticated request to the PostHog API
 */
async function posthogFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = getApiKey();

  const response = await fetch(`${POSTHOG_API_HOST}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PostHog API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// ============================================
// TYPES
// ============================================

export interface PostHogEvent {
  id: string;
  distinct_id: string;
  event: string;
  timestamp: string;
  properties: Record<string, unknown>;
  elements?: unknown[];
}

export interface PostHogPerson {
  id: string;
  distinct_ids: string[];
  properties: Record<string, unknown>;
  created_at: string;
}

export interface PostHogSessionRecording {
  id: string;
  distinct_id: string;
  viewed: boolean;
  recording_duration: number;
  active_seconds: number;
  start_time: string;
  end_time: string;
  click_count: number;
  keypress_count: number;
  mouse_activity_count: number;
  console_log_count: number;
  console_warn_count: number;
  console_error_count: number;
  start_url: string;
  person?: {
    id: string;
    name?: string;
    distinct_ids: string[];
    properties: Record<string, unknown>;
  };
}

export interface PostHogInsight {
  id: number;
  name: string;
  description?: string;
  filters: Record<string, unknown>;
  result?: unknown[];
  last_refresh?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface EventsQueryParams {
  event?: string;
  after?: string;
  before?: string;
  distinct_id?: string;
  limit?: number;
  offset?: number;
  properties?: Record<string, unknown>[];
}

export interface RecordingsQueryParams {
  limit?: number;
  offset?: number;
  date_from?: string;
  date_to?: string;
  person_uuid?: string;
  console_search?: string;
  duration_type_filter?: "duration" | "active_seconds";
  duration?: [number, number]; // [min, max] in seconds
}

export interface PersonsQueryParams {
  limit?: number;
  offset?: number;
  search?: string;
  properties?: Record<string, unknown>[];
}

// ============================================
// EVENT QUERIES
// ============================================

/**
 * Query events from PostHog
 */
export async function queryEvents(
  params: EventsQueryParams = {}
): Promise<PaginatedResponse<PostHogEvent>> {
  const projectId = getProjectId();
  const searchParams = new URLSearchParams();

  if (params.event) searchParams.set("event", params.event);
  if (params.after) searchParams.set("after", params.after);
  if (params.before) searchParams.set("before", params.before);
  if (params.distinct_id) searchParams.set("distinct_id", params.distinct_id);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.offset) searchParams.set("offset", String(params.offset));

  const query = searchParams.toString();
  return posthogFetch<PaginatedResponse<PostHogEvent>>(
    `/api/projects/${projectId}/events/${query ? `?${query}` : ""}`
  );
}

/**
 * Get event definitions (list of all event types)
 */
export async function getEventDefinitions(): Promise<
  PaginatedResponse<{ name: string; volume_30_day: number; query_usage_30_day: number }>
> {
  const projectId = getProjectId();
  return posthogFetch(
    `/api/projects/${projectId}/event_definitions/?limit=100`
  );
}

/**
 * Get event counts aggregated by event type
 */
export async function getEventCounts(
  dateFrom?: string,
  dateTo?: string
): Promise<Record<string, number>> {
  const projectId = getProjectId();
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);

  // Use insights API to get aggregated counts
  const result = await posthogFetch<{ result: Array<{ label: string; count: number }> }>(
    `/api/projects/${projectId}/insights/trend/?${params.toString()}&events=[{"id":"$pageview","math":"total"}]`
  );

  const counts: Record<string, number> = {};
  if (result.result) {
    for (const item of result.result) {
      counts[item.label] = item.count;
    }
  }
  return counts;
}

// ============================================
// SESSION RECORDING QUERIES
// ============================================

/**
 * List session recordings
 */
export async function listSessionRecordings(
  params: RecordingsQueryParams = {}
): Promise<PaginatedResponse<PostHogSessionRecording>> {
  const projectId = getProjectId();
  const searchParams = new URLSearchParams();

  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.offset) searchParams.set("offset", String(params.offset));
  if (params.date_from) searchParams.set("date_from", params.date_from);
  if (params.date_to) searchParams.set("date_to", params.date_to);
  if (params.person_uuid) searchParams.set("person_uuid", params.person_uuid);

  const query = searchParams.toString();
  return posthogFetch<PaginatedResponse<PostHogSessionRecording>>(
    `/api/projects/${projectId}/session_recordings/${query ? `?${query}` : ""}`
  );
}

/**
 * Get session recording details
 */
export async function getSessionRecording(
  recordingId: string
): Promise<PostHogSessionRecording & { snapshots?: unknown }> {
  const projectId = getProjectId();
  return posthogFetch(
    `/api/projects/${projectId}/session_recordings/${recordingId}/`
  );
}

// ============================================
// PERSON QUERIES
// ============================================

/**
 * List persons (users)
 */
export async function listPersons(
  params: PersonsQueryParams = {}
): Promise<PaginatedResponse<PostHogPerson>> {
  const projectId = getProjectId();
  const searchParams = new URLSearchParams();

  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.offset) searchParams.set("offset", String(params.offset));
  if (params.search) searchParams.set("search", params.search);

  const query = searchParams.toString();
  return posthogFetch<PaginatedResponse<PostHogPerson>>(
    `/api/projects/${projectId}/persons/${query ? `?${query}` : ""}`
  );
}

/**
 * Get person details by distinct ID
 */
export async function getPersonByDistinctId(
  distinctId: string
): Promise<PostHogPerson | null> {
  const projectId = getProjectId();
  try {
    const result = await posthogFetch<PaginatedResponse<PostHogPerson>>(
      `/api/projects/${projectId}/persons/?distinct_id=${encodeURIComponent(distinctId)}`
    );
    return result.results[0] || null;
  } catch {
    return null;
  }
}

// ============================================
// INSIGHTS & TRENDS
// ============================================

/**
 * Query a trend insight (time series data)
 */
export async function queryTrend(options: {
  events: Array<{ id: string; math?: string; name?: string }>;
  dateFrom?: string;
  dateTo?: string;
  interval?: "hour" | "day" | "week" | "month";
  breakdown?: string;
}): Promise<{
  result: Array<{
    label: string;
    count: number;
    data: number[];
    labels: string[];
    days: string[];
  }>;
}> {
  const projectId = getProjectId();
  const params = new URLSearchParams();

  params.set("events", JSON.stringify(options.events));
  if (options.dateFrom) params.set("date_from", options.dateFrom);
  if (options.dateTo) params.set("date_to", options.dateTo);
  if (options.interval) params.set("interval", options.interval);
  if (options.breakdown) params.set("breakdown", options.breakdown);

  return posthogFetch(`/api/projects/${projectId}/insights/trend/?${params.toString()}`);
}

/**
 * Query a funnel
 */
export async function queryFunnel(options: {
  events: Array<{ id: string; order: number; name?: string }>;
  dateFrom?: string;
  dateTo?: string;
  funnelWindowInterval?: number;
  funnelWindowIntervalUnit?: "minute" | "hour" | "day" | "week";
}): Promise<{
  result: Array<{
    name: string;
    count: number;
    order: number;
    conversion_time?: number;
  }>;
}> {
  const projectId = getProjectId();
  const body = {
    insight: "FUNNELS",
    events: options.events,
    date_from: options.dateFrom || "-7d",
    date_to: options.dateTo,
    funnel_window_interval: options.funnelWindowInterval || 14,
    funnel_window_interval_unit: options.funnelWindowIntervalUnit || "day",
  };

  return posthogFetch(`/api/projects/${projectId}/insights/funnel/`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ============================================
// DASHBOARD SUMMARY
// ============================================

/**
 * Get a summary of key metrics for the analytics dashboard
 */
export async function getDashboardSummary(dateFrom = "-7d"): Promise<{
  totalUsers: number;
  totalEvents: number;
  totalRecordings: number;
  topEvents: Array<{ name: string; count: number }>;
  recentRecordings: PostHogSessionRecording[];
}> {
  const projectId = getProjectId();

  // Run queries in parallel
  const [persons, eventDefs, recordings] = await Promise.all([
    listPersons({ limit: 1 }), // Just to get count
    getEventDefinitions(),
    listSessionRecordings({ limit: 10, date_from: dateFrom }),
  ]);

  // Calculate totals and top events
  const topEvents = eventDefs.results
    .filter((e) => !e.name.startsWith("$"))
    .sort((a, b) => (b.volume_30_day || 0) - (a.volume_30_day || 0))
    .slice(0, 10)
    .map((e) => ({ name: e.name, count: e.volume_30_day || 0 }));

  const totalEvents = eventDefs.results.reduce(
    (sum, e) => sum + (e.volume_30_day || 0),
    0
  );

  return {
    totalUsers: persons.count,
    totalEvents,
    totalRecordings: recordings.count,
    topEvents,
    recentRecordings: recordings.results,
  };
}

// ============================================
// CINEMA-SPECIFIC ANALYTICS
// ============================================

/**
 * Get film engagement analytics
 */
export async function getFilmEngagement(dateFrom = "-7d"): Promise<{
  filmViews: Array<{ filmId: string; filmTitle: string; count: number }>;
  bookingClicks: Array<{ filmId: string; filmTitle: string; count: number }>;
  watchlistAdds: Array<{ filmId: string; filmTitle: string; count: number }>;
}> {
  const projectId = getProjectId();

  // Query film_viewed events with breakdown by film_id
  const viewsResult = await queryTrend({
    events: [{ id: "film_viewed", math: "total" }],
    dateFrom,
    breakdown: "film_id",
  });

  const bookingsResult = await queryTrend({
    events: [{ id: "booking_link_clicked", math: "total" }],
    dateFrom,
    breakdown: "film_id",
  });

  const watchlistResult = await queryTrend({
    events: [{ id: "watchlist_changed", math: "total" }],
    dateFrom,
    breakdown: "film_id",
  });

  // Transform results
  const transformResult = (
    result: typeof viewsResult
  ): Array<{ filmId: string; filmTitle: string; count: number }> => {
    return (result.result || []).map((r) => ({
      filmId: r.label,
      filmTitle: r.label, // Would need to join with DB for actual title
      count: r.count,
    }));
  };

  return {
    filmViews: transformResult(viewsResult),
    bookingClicks: transformResult(bookingsResult),
    watchlistAdds: transformResult(watchlistResult),
  };
}

/**
 * Get cinema engagement analytics
 */
export async function getCinemaEngagement(dateFrom = "-7d"): Promise<{
  screeningClicks: Array<{ cinemaId: string; count: number }>;
  bookingClicks: Array<{ cinemaId: string; count: number }>;
}> {
  const screeningsResult = await queryTrend({
    events: [{ id: "screening_card_clicked", math: "total" }],
    dateFrom,
    breakdown: "cinema_id",
  });

  const bookingsResult = await queryTrend({
    events: [{ id: "booking_link_clicked", math: "total" }],
    dateFrom,
    breakdown: "cinema_id",
  });

  const transformResult = (
    result: typeof screeningsResult
  ): Array<{ cinemaId: string; count: number }> => {
    return (result.result || []).map((r) => ({
      cinemaId: r.label,
      count: r.count,
    }));
  };

  return {
    screeningClicks: transformResult(screeningsResult),
    bookingClicks: transformResult(bookingsResult),
  };
}

/**
 * Get user conversion funnel
 */
export async function getConversionFunnel(dateFrom = "-7d"): Promise<{
  steps: Array<{
    name: string;
    count: number;
    conversionRate: number;
  }>;
}> {
  const result = await queryFunnel({
    events: [
      { id: "$pageview", order: 0, name: "Page View" },
      { id: "film_viewed", order: 1, name: "Viewed Film" },
      { id: "screening_card_clicked", order: 2, name: "Clicked Screening" },
      { id: "booking_link_clicked", order: 3, name: "Clicked Booking" },
    ],
    dateFrom,
  });

  const steps = result.result || [];
  const firstStep = steps[0]?.count || 0;

  return {
    steps: steps.map((step) => ({
      name: step.name,
      count: step.count,
      conversionRate: firstStep > 0 ? (step.count / firstStep) * 100 : 0,
    })),
  };
}

// ============================================
// HEALTH CHECK
// ============================================

/**
 * Verify PostHog API connection is working
 */
export async function healthCheck(): Promise<{
  connected: boolean;
  projectId?: string;
  error?: string;
}> {
  try {
    const projectId = getProjectId();
    // Try to fetch project details
    await posthogFetch(`/api/projects/${projectId}/`);
    return { connected: true, projectId };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
