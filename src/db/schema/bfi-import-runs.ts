import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  uuid,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

export const bfiImportRunTypeEnum = pgEnum("bfi_import_run_type", [
  "full",
  "changes",
]);

export const bfiImportStatusEnum = pgEnum("bfi_import_status", [
  "success",
  "degraded",
  "failed",
]);

export const bfiImportRuns = pgTable(
  "bfi_import_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runType: bfiImportRunTypeEnum("run_type").notNull(),
    status: bfiImportStatusEnum("status").notNull(),
    triggeredBy: text("triggered_by"),
    sourceStatus: jsonb("source_status")
      .$type<{
        pdf: "success" | "empty" | "failed";
        programmeChanges: "success" | "empty" | "failed";
      }>()
      .notNull(),
    pdfScreenings: integer("pdf_screenings").notNull().default(0),
    changesScreenings: integer("changes_screenings").notNull().default(0),
    totalScreenings: integer("total_screenings").notNull().default(0),
    added: integer("added").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    errorCodes: text("error_codes").array().notNull().default([]),
    errors: text("errors").array().notNull().default([]),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    createdAtIdx: index("bfi_import_runs_created_at_idx").on(table.createdAt),
    statusCreatedIdx: index("bfi_import_runs_status_created_at_idx").on(
      table.status,
      table.createdAt
    ),
    runTypeCreatedIdx: index("bfi_import_runs_run_type_created_at_idx").on(
      table.runType,
      table.createdAt
    ),
  })
);

export type BfiImportRunInsert = typeof bfiImportRuns.$inferInsert;
export type BfiImportRunSelect = typeof bfiImportRuns.$inferSelect;
