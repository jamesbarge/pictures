import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  real,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { cinemas } from "./cinemas";

/**
 * Health Snapshots table - historical health metrics for each cinema scraper
 *
 * Used for:
 * - Detecting scraper failures (stale data)
 * - Volume anomaly detection (sudden drops in screenings)
 * - Alerting on critical issues
 * - Historical trend analysis
 */
export const healthSnapshots = pgTable(
  "health_snapshots",
  {
    // Primary key - UUID
    id: text("id").primaryKey(),

    // Foreign key to cinema
    cinemaId: text("cinema_id")
      .notNull()
      .references(() => cinemas.id, { onDelete: "cascade" }),

    // Snapshot timestamp
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),

    // ============================================
    // Volume Metrics
    // ============================================

    /** Total future screenings at time of snapshot */
    totalFutureScreenings: integer("total_future_screenings").notNull(),

    /** Screenings in next 14 days */
    next14dScreenings: integer("next_14d_screenings").notNull(),

    /** Screenings in next 7 days */
    next7dScreenings: integer("next_7d_screenings").notNull(),

    // ============================================
    // Freshness Metrics
    // ============================================

    /** When the last scrape ran (based on most recent scrapedAt) */
    lastScrapeAt: timestamp("last_scrape_at", { withTimezone: true }),

    /** Hours since last successful scrape */
    hoursSinceLastScrape: real("hours_since_last_scrape"),

    // ============================================
    // Health Scores (0-100)
    // ============================================

    /** Overall health score combining freshness and volume */
    overallHealthScore: real("overall_health_score").notNull(),

    /** Freshness score (100 = just scraped, 0 = very stale) */
    freshnessScore: real("freshness_score").notNull(),

    /** Volume score (100 = normal volume, 0 = no screenings) */
    volumeScore: real("volume_score").notNull(),

    // ============================================
    // Anomaly Detection
    // ============================================

    /** Whether this snapshot detected an anomaly */
    isAnomaly: boolean("is_anomaly").notNull().default(false),

    /** Array of anomaly reason codes */
    anomalyReasons: jsonb("anomaly_reasons").$type<string[]>().default([]),

    // ============================================
    // Chain Comparison (for chain venues)
    // ============================================

    /** Median screenings for other venues in the same chain */
    chainMedian: integer("chain_median"),

    /** This venue's volume as percentage of chain median */
    percentOfChainMedian: real("percent_of_chain_median"),

    // ============================================
    // Alerting
    // ============================================

    /** Whether an alert was triggered for this snapshot */
    triggeredAlert: boolean("triggered_alert").notNull().default(false),

    /** Type of alert triggered */
    alertType: text("alert_type").$type<
      "critical_stale" | "warning_stale" | "critical_volume" | "warning_volume" | "anomaly"
    >(),

    /** When the alert was acknowledged (if applicable) */
    alertAcknowledgedAt: timestamp("alert_acknowledged_at", { withTimezone: true }),

    // ============================================
    // Metadata
    // ============================================

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Index for querying by cinema and time
    cinemaTimeIdx: index("health_snapshots_cinema_time_idx").on(
      table.cinemaId,
      table.snapshotAt
    ),
    // Index for finding anomalies
    anomalyIdx: index("health_snapshots_anomaly_idx").on(table.isAnomaly),
    // Index for finding unacknowledged alerts
    alertIdx: index("health_snapshots_alert_idx").on(
      table.triggeredAlert,
      table.alertAcknowledgedAt
    ),
    // Index for time-based queries
    snapshotTimeIdx: index("health_snapshots_time_idx").on(table.snapshotAt),
  })
);

/**
 * Anomaly reason codes
 */
export const ANOMALY_REASONS = {
  CRITICAL_STALE: "critical_stale", // >72h without scrape
  WARNING_STALE: "warning_stale", // >48h without scrape
  ZERO_SCREENINGS: "zero_screenings", // No future screenings
  LOW_VOLUME: "low_volume", // <60% of chain median
  SUDDEN_DROP: "sudden_drop", // Volume dropped significantly from previous snapshot
  PARSE_ERROR_SUSPECTED: "parse_error_suspected", // Many screenings at suspicious times
} as const;

export type AnomalyReason = (typeof ANOMALY_REASONS)[keyof typeof ANOMALY_REASONS];

/**
 * Health thresholds
 */
export const HEALTH_THRESHOLDS = {
  // Freshness thresholds (hours)
  CRITICAL_STALE_HOURS: 72,
  WARNING_STALE_HOURS: 48,
  HEALTHY_MAX_HOURS: 24,

  // Volume thresholds
  CRITICAL_VOLUME_PERCENT: 0, // 0 screenings
  WARNING_VOLUME_PERCENT: 60, // <60% of chain median

  // Score thresholds
  CRITICAL_SCORE: 30,
  WARNING_SCORE: 60,
  HEALTHY_SCORE: 80,
} as const;
