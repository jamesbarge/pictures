/**
 * Admin & Data Completeness Schemas
 * Tables for tracking scraper runs, anomalies, and admin actions
 */

import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import { cinemas } from "./cinemas";

/**
 * Scraper run status enum
 */
export const scraperRunStatusEnum = pgEnum("scraper_run_status", [
  "success",
  "failed",
  "anomaly",
  "partial",
]);

/**
 * Anomaly type enum
 */
export const anomalyTypeEnum = pgEnum("anomaly_type", [
  "low_count",
  "zero_results",
  "error",
  "high_count",
]);

/**
 * Cinema tier enum - determines verification sensitivity
 */
export const cinemaTierEnum = pgEnum("cinema_tier", ["top", "standard"]);

/**
 * Scraper runs table - tracks every scraper execution
 * Used for anomaly detection via same-day-last-week comparison
 */
export const scraperRuns = pgTable("scraper_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  cinemaId: text("cinema_id")
    .notNull()
    .references(() => cinemas.id, { onDelete: "cascade" }),

  // Timing
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),

  // Status
  status: scraperRunStatusEnum("status").notNull(),

  // Counts for comparison
  screeningCount: integer("screening_count"),
  baselineCount: integer("baseline_count"),

  // Anomaly details (if any)
  anomalyType: anomalyTypeEnum("anomaly_type"),
  anomalyDetails: jsonb("anomaly_details").$type<{
    expectedRange?: { min: number; max: number };
    percentChange?: number;
    errorMessage?: string;
  }>(),

  // Resolution
  autoFixed: boolean("auto_fixed").notNull().default(false),
  autoRetried: boolean("auto_retried").notNull().default(false),
  fixedByAi: boolean("fixed_by_ai").notNull().default(false),

  // Notes and metadata
  notes: text("notes"),
  metadata: jsonb("metadata").$type<{
    duration?: number;
    userAgent?: string;
    proxyUsed?: boolean;
  }>(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Admin actions table - audit trail for all admin operations
 */
export const adminActions = pgTable("admin_actions", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Who made the change
  adminUserId: text("admin_user_id").notNull(),
  adminEmail: text("admin_email"),

  // What changed
  actionType: text("action_type")
    .notNull()
    .$type<"add" | "edit" | "delete" | "ai_fix" | "bulk_import" | "merge">(),
  entityType: text("entity_type")
    .notNull()
    .$type<"screening" | "film" | "cinema" | "scraper_run">(),
  entityId: text("entity_id"),

  // Before/after snapshots
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),

  // Context
  reason: text("reason"),
  metadata: jsonb("metadata").$type<{
    source?: string;
    batchId?: string;
    affectedCount?: number;
  }>(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Cinema baselines table - expected screening counts per day
 * Used for anomaly detection thresholds
 */
export const cinemaBaselines = pgTable("cinema_baselines", {
  cinemaId: text("cinema_id")
    .primaryKey()
    .references(() => cinemas.id, { onDelete: "cascade" }),

  // Tier determines verification sensitivity
  tier: cinemaTierEnum("tier").notNull().default("standard"),

  // Expected counts by day type
  weekdayAvg: integer("weekday_avg"),
  weekendAvg: integer("weekend_avg"),

  // Tolerance for anomaly detection (percentage)
  tolerancePercent: integer("tolerance_percent").notNull().default(30),

  // Override automatic baseline calculation
  manualOverride: boolean("manual_override").notNull().default(false),

  // Scrape horizon settings
  scrapeHorizonDays: integer("scrape_horizon_days").notNull().default(60),
  maxScrapeDate: timestamp("max_scrape_date", { withTimezone: true }),

  // Metadata
  lastCalculated: timestamp("last_calculated", { withTimezone: true }),
  notes: text("notes"),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Type exports
export type ScraperRunInsert = typeof scraperRuns.$inferInsert;
export type ScraperRunSelect = typeof scraperRuns.$inferSelect;
export type AdminActionInsert = typeof adminActions.$inferInsert;
export type AdminActionSelect = typeof adminActions.$inferSelect;
export type CinemaBaselineInsert = typeof cinemaBaselines.$inferInsert;
export type CinemaBaselineSelect = typeof cinemaBaselines.$inferSelect;
