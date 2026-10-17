/**
 * Data Issues table - stores issues flagged by AI agents
 *
 * This table tracks data quality issues that agents detect,
 * along with their resolution status.
 */

import {
  pgTable,
  text,
  real,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type {
  DataIssueType,
  IssueSeverity,
  IssueStatus,
} from "@/agents/types";

/**
 * Data issues table - agent-flagged data quality problems
 */
export const dataIssues = pgTable(
  "data_issues",
  {
    // Primary key - UUID
    id: text("id").primaryKey(),

    // Issue classification
    type: text("type").$type<DataIssueType>().notNull(),
    severity: text("severity").$type<IssueSeverity>().notNull(),

    // Affected entity
    entityType: text("entity_type")
      .$type<"screening" | "film" | "cinema">()
      .notNull(),
    entityId: text("entity_id").notNull(),

    // Issue details
    description: text("description").notNull(),
    suggestedFix: text("suggested_fix"),
    confidence: real("confidence").notNull(), // 0-1 scale

    // Resolution tracking
    status: text("status").$type<IssueStatus>().notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"), // "agent" or user ID

    // Tracking
    agentName: text("agent_name").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Index for finding open issues
    index("idx_data_issues_status").on(table.status),
    // Index for finding issues by entity
    index("idx_data_issues_entity").on(table.entityType, table.entityId),
    // Index for finding issues by type
    index("idx_data_issues_type").on(table.type),
    // Index for recent issues
    index("idx_data_issues_detected").on(table.detectedAt),
  ]
);
