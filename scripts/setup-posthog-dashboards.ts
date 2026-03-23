/**
 * PostHog Dashboard Setup Script
 *
 * Creates 4 dashboards, insights, cohorts, and actions programmatically
 * via the PostHog REST API. Idempotent — safe to re-run.
 *
 * Usage: npx tsx scripts/setup-posthog-dashboards.ts
 *
 * Required env vars:
 *   POSTHOG_PERSONAL_API_KEY - Personal API key with dashboard/insight/action/cohort write scopes
 *   POSTHOG_PROJECT_ID       - PostHog project ID
 */

import "dotenv/config";
import {
  listDashboards,
  createDashboard,
  createInsight,
  listActions,
  createAction,
  listCohorts,
  createCohort,
  healthCheck,
} from "@/lib/posthog-api";

// ============================================
// HELPERS
// ============================================

const TAG = "auto-setup";

function log(emoji: string, msg: string) {
  console.log(`${emoji}  ${msg}`);
}

/** Build a TrendsQuery node */
function trendsQuery(
  series: Array<{
    event: string;
    math?: string;
    properties?: Array<{ key: string; value: unknown; operator: string; type: string }>;
  }>,
  opts: {
    dateRange?: string;
    interval?: string;
    breakdownBy?: string;
    breakdownType?: string;
    display?: string;
    compareFilter?: { compare: boolean; compare_to?: string };
    formulaMode?: string;
  } = {}
): Record<string, unknown> {
  const seriesNodes = series.map((s, i) => ({
    kind: "EventsNode",
    event: s.event,
    math: s.math || "total",
    name: s.event,
    ...(s.properties?.length ? { properties: s.properties } : {}),
    custom_name: undefined,
    order: i,
  }));

  return {
    kind: "TrendsQuery",
    series: seriesNodes,
    dateRange: { date_from: opts.dateRange || "-30d" },
    interval: opts.interval || "day",
    ...(opts.breakdownBy
      ? {
          breakdownFilter: {
            breakdown: opts.breakdownBy,
            breakdown_type: opts.breakdownType || "event",
            breakdown_limit: 15,
          },
        }
      : {}),
    ...(opts.display ? { trendsFilter: { display: opts.display } } : {}),
    ...(opts.compareFilter ? { compareFilter: opts.compareFilter } : {}),
    ...(opts.formulaMode ? { trendsFilter: { ...(opts.display ? { display: opts.display } : {}), formula: opts.formulaMode } } : {}),
  };
}

/** Build a FunnelsQuery node */
function funnelsQuery(
  steps: Array<{
    event: string;
    name?: string;
    properties?: Array<{ key: string; value: unknown; operator: string; type: string }>;
  }>,
  opts: {
    dateRange?: string;
    funnelWindowInterval?: number;
    funnelWindowIntervalUnit?: string;
    breakdownBy?: string;
  } = {}
): Record<string, unknown> {
  return {
    kind: "FunnelsQuery",
    series: steps.map((s, i) => ({
      kind: "EventsNode",
      event: s.event,
      name: s.name || s.event,
      ...(s.properties?.length ? { properties: s.properties } : {}),
      order: i,
    })),
    dateRange: { date_from: opts.dateRange || "-30d" },
    funnelsFilter: {
      funnelWindowInterval: opts.funnelWindowInterval || 14,
      funnelWindowIntervalUnit: opts.funnelWindowIntervalUnit || "day",
    },
    ...(opts.breakdownBy
      ? {
          breakdownFilter: {
            breakdown: opts.breakdownBy,
            breakdown_type: "event",
          },
        }
      : {}),
  };
}

/** Build a RetentionQuery node */
function retentionQuery(
  targetEvent: string,
  returningEvent: string,
  opts: { period?: string; totalIntervals?: number; dateRange?: string } = {}
): Record<string, unknown> {
  return {
    kind: "RetentionQuery",
    retentionFilter: {
      retentionType: "retention_first_time",
      targetEntity: { id: targetEvent, type: "events" },
      returningEntity: { id: returningEvent, type: "events" },
      period: opts.period || "Week",
      totalIntervals: opts.totalIntervals || 8,
    },
    dateRange: { date_from: opts.dateRange || "-8w" },
  };
}

/** Build a LifecycleQuery node */
function lifecycleQuery(
  event: string,
  opts: { interval?: string; dateRange?: string } = {}
): Record<string, unknown> {
  return {
    kind: "LifecycleQuery",
    series: [{ kind: "EventsNode", event, math: "total" }],
    lifecycleFilter: {},
    dateRange: { date_from: opts.dateRange || "-8w" },
    interval: opts.interval || "week",
  };
}

// ============================================
// DASHBOARD DEFINITIONS
// ============================================

interface InsightDef {
  name: string;
  description: string;
  query: Record<string, unknown>;
}

interface DashboardDef {
  name: string;
  description: string;
  insights: InsightDef[];
}

const WANT_TO_SEE_FILTER = [
  { key: "new_status", value: "want_to_see", operator: "exact", type: "event" },
];

const dashboards: DashboardDef[] = [
  // ---- Dashboard 1: Conversion Funnel ----
  {
    name: "Conversion Funnel",
    description: "Browse-to-book conversion tracking and booking trends",
    insights: [
      {
        name: "Browse-to-Book Funnel",
        description: "Full funnel: pageview → film view → screening click → booking click",
        query: funnelsQuery([
          { event: "$pageview", name: "Page View" },
          { event: "film_viewed", name: "Film Viewed" },
          { event: "screening_card_clicked", name: "Screening Clicked" },
          { event: "booking_link_clicked", name: "Booking Clicked" },
        ]),
      },
      {
        name: "Funnel by Source",
        description: "Conversion funnel broken down by discovery source",
        query: funnelsQuery(
          [
            { event: "$pageview", name: "Page View" },
            { event: "film_viewed", name: "Film Viewed" },
            { event: "screening_card_clicked", name: "Screening Clicked" },
            { event: "booking_link_clicked", name: "Booking Clicked" },
          ],
          { breakdownBy: "source" }
        ),
      },
      {
        name: "Daily Booking Clicks",
        description: "Booking link clicks over time, compared to previous period",
        query: trendsQuery([{ event: "booking_link_clicked" }], {
          interval: "day",
          compareFilter: { compare: true },
        }),
      },
      {
        name: "Conversion Rate Over Time",
        description: "Weekly booking-to-view ratio as percentage",
        query: trendsQuery(
          [
            { event: "booking_link_clicked", math: "total" },
            { event: "film_viewed", math: "total" },
          ],
          {
            interval: "week",
            formulaMode: "A / B * 100",
          }
        ),
      },
    ],
  },

  // ---- Dashboard 2: Film & Cinema Engagement ----
  {
    name: "Film & Cinema Engagement",
    description: "Top films, cinema performance, and watchlist activity",
    insights: [
      {
        name: "Top Films by Views",
        description: "Most viewed films broken down by title",
        query: trendsQuery([{ event: "film_viewed" }], {
          breakdownBy: "film_title",
          display: "ActionsBarValue",
        }),
      },
      {
        name: "Top Films by Bookings",
        description: "Most booked films broken down by title",
        query: trendsQuery([{ event: "booking_link_clicked" }], {
          breakdownBy: "film_title",
          display: "ActionsBarValue",
        }),
      },
      {
        name: "Cinema Performance",
        description: "Screening clicks broken down by cinema",
        query: trendsQuery([{ event: "screening_card_clicked" }], {
          breakdownBy: "cinema_name",
          display: "ActionsBarValue",
        }),
      },
      {
        name: "Cinema Booking Conversion",
        description: "Booking clicks broken down by cinema",
        query: trendsQuery([{ event: "booking_link_clicked" }], {
          breakdownBy: "cinema_name",
          display: "ActionsBarValue",
        }),
      },
      {
        name: "Watchlist Activity",
        description: "Daily want-to-see additions",
        query: trendsQuery(
          [
            {
              event: "film_status_changed",
              properties: WANT_TO_SEE_FILTER,
            },
          ],
          { interval: "day" }
        ),
      },
      {
        name: "Repertory vs New Releases",
        description: "Film views broken down by repertory flag",
        query: trendsQuery([{ event: "film_viewed" }], {
          breakdownBy: "is_repertory",
        }),
      },
    ],
  },

  // ---- Dashboard 3: User Retention & Segments ----
  {
    name: "User Retention & Segments",
    description: "Retention curves, lifecycle analysis, and engagement tiers",
    insights: [
      {
        name: "Weekly Retention",
        description: "First pageview → returning film_viewed, weekly over 8 intervals",
        query: retentionQuery("$pageview", "film_viewed", {
          period: "Week",
          totalIntervals: 8,
        }),
      },
      {
        name: "User Lifecycle",
        description: "New/returning/resurrecting/dormant users by film_viewed, weekly",
        query: lifecycleQuery("film_viewed", { interval: "week" }),
      },
      {
        name: "Engagement Tiers",
        description: "Unique users who viewed films, broken down by engagement tier",
        query: trendsQuery([{ event: "film_viewed", math: "dau" }], {
          breakdownBy: "engagement_tier",
          breakdownType: "person",
        }),
      },
      {
        name: "Watchlist-to-Booking Funnel",
        description: "Users who add to watchlist then book within 30 days",
        query: funnelsQuery(
          [
            {
              event: "film_status_changed",
              name: "Added to Watchlist",
              properties: WANT_TO_SEE_FILTER,
            },
            { event: "booking_link_clicked", name: "Booked" },
          ],
          { funnelWindowInterval: 30, funnelWindowIntervalUnit: "day" }
        ),
      },
      {
        name: "New vs Returning Users",
        description: "DAU with first_time_for_user comparison",
        query: trendsQuery(
          [
            { event: "$pageview", math: "dau" },
            { event: "$pageview", math: "first_time_for_user" },
          ],
          { interval: "day" }
        ),
      },
    ],
  },

  // ---- Dashboard 4: Friction & Search Quality ----
  {
    name: "Friction & Search Quality",
    description: "Search quality, empty states, and filter effectiveness",
    insights: [
      {
        name: "Search Volume & Results",
        description: "Total searches vs searches with no results",
        query: trendsQuery(
          [
            { event: "search_performed" },
            { event: "search_no_results" },
          ],
          { interval: "day" }
        ),
      },
      {
        name: "Search No-Results Rate",
        description: "Percentage of searches returning no results, daily",
        query: trendsQuery(
          [
            { event: "search_no_results", math: "total" },
            { event: "search_performed", math: "total" },
          ],
          {
            interval: "day",
            formulaMode: "A / B * 100",
          }
        ),
      },
      {
        name: "Filter Dead Ends",
        description: "Times filters produced an empty calendar",
        query: trendsQuery([{ event: "filter_no_results" }], {
          breakdownBy: "filter_type",
          interval: "day",
        }),
      },
      {
        name: "Tonight Empty States",
        description: "How often the tonight page shows no screenings",
        query: trendsQuery([{ event: "tonight_no_screenings" }], {
          interval: "day",
        }),
      },
      {
        name: "Top Search Queries (No Results)",
        description: "What users search for but can't find",
        query: trendsQuery([{ event: "search_no_results" }], {
          breakdownBy: "query",
          display: "ActionsTable",
        }),
      },
      {
        name: "Filter Usage",
        description: "Which filter types are used most",
        query: trendsQuery([{ event: "filter_changed" }], {
          breakdownBy: "filter_type",
          display: "ActionsBarValue",
        }),
      },
    ],
  },
];

// ============================================
// COHORT DEFINITIONS
// ============================================

interface CohortDef {
  name: string;
  description: string;
  filters: Record<string, unknown>;
}

const cohorts: CohortDef[] = [
  {
    name: "Power Users",
    description: "Users who viewed 10+ films in the last 30 days",
    filters: {
      properties: {
        type: "AND",
        values: [
          {
            type: "AND",
            values: [
              {
                type: "behavioral",
                value: "performed_event",
                event_type: "events",
                key: "film_viewed",
                operator: "gte",
                operator_value: 10,
                time_value: 30,
                time_interval: "day",
              },
            ],
          },
        ],
      },
    },
  },
  {
    name: "Bookers",
    description: "Users who clicked a booking link in the last 90 days",
    filters: {
      properties: {
        type: "AND",
        values: [
          {
            type: "AND",
            values: [
              {
                type: "behavioral",
                value: "performed_event",
                event_type: "events",
                key: "booking_link_clicked",
                operator: "gte",
                operator_value: 1,
                time_value: 90,
                time_interval: "day",
              },
            ],
          },
        ],
      },
    },
  },
  {
    name: "Watchlisters",
    description: "Users who added a film to watchlist in the last 30 days",
    filters: {
      properties: {
        type: "AND",
        values: [
          {
            type: "AND",
            values: [
              {
                type: "behavioral",
                value: "performed_event_with_property",
                event_type: "events",
                key: "film_status_changed",
                property_key: "new_status",
                property_value: "want_to_see",
                operator: "gte",
                operator_value: 1,
                time_value: 30,
                time_interval: "day",
              },
            ],
          },
        ],
      },
    },
  },
  {
    name: "Search Frustrated",
    description: "Users who got no search results 2+ times in the last 7 days",
    filters: {
      properties: {
        type: "AND",
        values: [
          {
            type: "AND",
            values: [
              {
                type: "behavioral",
                value: "performed_event",
                event_type: "events",
                key: "search_no_results",
                operator: "gte",
                operator_value: 2,
                time_value: 7,
                time_interval: "day",
              },
            ],
          },
        ],
      },
    },
  },
];

// ============================================
// ACTION DEFINITIONS
// ============================================

interface ActionDef {
  name: string;
  description: string;
  steps: Array<{
    event: string;
    properties?: Array<{ key: string; value: unknown; operator: string; type: string }>;
  }>;
}

const actions: ActionDef[] = [
  {
    name: "Any Film Engagement",
    description: "film_viewed OR screening_card_clicked OR booking_link_clicked",
    steps: [
      { event: "film_viewed" },
      { event: "screening_card_clicked" },
      { event: "booking_link_clicked" },
    ],
  },
  {
    name: "Booking Intent",
    description: "User clicked a booking link",
    steps: [{ event: "booking_link_clicked" }],
  },
  {
    name: "Watchlist Add",
    description: "User added a film to their watchlist",
    steps: [
      {
        event: "film_status_changed",
        properties: WANT_TO_SEE_FILTER,
      },
    ],
  },
];

// ============================================
// MAIN
// ============================================

async function main() {
  console.log("\n========================================");
  console.log("  PostHog Dashboard Setup");
  console.log("========================================\n");

  // 1. Health check
  const health = await healthCheck();
  if (!health.connected) {
    console.error("PostHog API connection failed:", health.error);
    console.error("\nMake sure POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID are set in .env.local");
    process.exit(1);
  }
  log("✓", `Connected to PostHog project ${health.projectId}`);

  // 2. Load existing resources for idempotency
  const [existingDashboards, existingActions, existingCohorts] = await Promise.all([
    listDashboards(),
    listActions(),
    listCohorts(),
  ]);

  const dashboardsByName = new Map(existingDashboards.results.map((d) => [d.name, d]));
  const actionsByName = new Map(existingActions.results.map((a) => [a.name, a]));
  const cohortsByName = new Map(existingCohorts.results.map((c) => [c.name, c]));

  const stats = { dashboards: 0, insights: 0, actions: 0, cohorts: 0, skipped: 0 };

  // 3. Create dashboards + insights
  console.log("\n--- Dashboards & Insights ---");
  for (const def of dashboards) {
    const existing = dashboardsByName.get(def.name);
    if (existing) {
      log("→", `Dashboard "${def.name}" already exists (id: ${existing.id}), skipping`);
      stats.skipped++;
      continue;
    }

    const dashboard = await createDashboard(def.name, def.description, [TAG]);
    log("✓", `Created dashboard "${def.name}" (id: ${dashboard.id})`);
    stats.dashboards++;

    // Create insights for this dashboard
    for (const insight of def.insights) {
      try {
        const created = await createInsight(
          insight.name,
          insight.query,
          [dashboard.id],
          insight.description
        );
        log("  +", `Insight "${insight.name}" (id: ${created.id})`);
        stats.insights++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log("  !", `Failed to create insight "${insight.name}": ${msg}`);
      }
    }
  }

  // 4. Create actions
  console.log("\n--- Actions ---");
  for (const def of actions) {
    if (actionsByName.has(def.name)) {
      log("→", `Action "${def.name}" already exists, skipping`);
      stats.skipped++;
      continue;
    }

    try {
      const action = await createAction(def.name, def.description, def.steps, [TAG]);
      log("✓", `Created action "${def.name}" (id: ${action.id})`);
      stats.actions++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("!", `Failed to create action "${def.name}": ${msg}`);
    }
  }

  // 5. Create cohorts
  console.log("\n--- Cohorts ---");
  for (const def of cohorts) {
    if (cohortsByName.has(def.name)) {
      log("→", `Cohort "${def.name}" already exists, skipping`);
      stats.skipped++;
      continue;
    }

    try {
      const cohort = await createCohort(def.name, def.description, def.filters);
      log("✓", `Created cohort "${def.name}" (id: ${cohort.id})`);
      stats.cohorts++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("!", `Failed to create cohort "${def.name}": ${msg}`);
    }
  }

  // 6. Summary
  console.log("\n========================================");
  console.log("  Summary");
  console.log("========================================");
  console.log(`  Dashboards created: ${stats.dashboards}`);
  console.log(`  Insights created:   ${stats.insights}`);
  console.log(`  Actions created:    ${stats.actions}`);
  console.log(`  Cohorts created:    ${stats.cohorts}`);
  console.log(`  Skipped (existing): ${stats.skipped}`);
  console.log("========================================\n");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
