import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Database connection for Pictures
 *
 * Uses postgres.js driver with Drizzle ORM.
 * Connection string comes from environment variable.
 *
 * Handles missing DATABASE_URL gracefully for CI builds.
 */

// Connection string from Supabase
const connectionString = process.env.DATABASE_URL;

// Check if we have a valid database URL (not empty, not placeholder)
const hasValidDatabaseUrl =
  !!connectionString &&
  connectionString !== "" &&
  connectionString !== "disabled" &&
  !connectionString.includes("localhost:5432/postgres");

// Create postgres client only if we have a valid connection string
// Using a lazy connection to avoid errors during build
//
// Timeouts (added 2026-05-07): without these, a silently-dropped Supabase
// pooler connection caused query promises to hang indefinitely. The local
// /scrape stalled twice for 12+ hours each before being killed manually.
//   - statement_timeout: Postgres-side cap on any single query (60s).
//   - idle_timeout: client-side recycle of idle conns to dodge stale pooler links.
//   - connect_timeout: bound the initial handshake so a dead pooler fails fast.
//   - max_lifetime: rotate conns so no single one stays open across pooler restarts.
const client = hasValidDatabaseUrl
  ? postgres(connectionString, {
      prepare: false, // Required for Supabase connection pooling (transaction mode)
      max: 1, // Limit connections in serverless
      idle_timeout: 20, // seconds
      connect_timeout: 15, // seconds
      max_lifetime: 60 * 30, // 30 minutes — if you add db.transaction(...), keep blocks under this
      connection: {
        statement_timeout: 60_000, // milliseconds — kill any query >60s
      },
    })
  : postgres("postgres://placeholder:5432/placeholder", {
      prepare: false,
      max: 0, // Don't actually connect
    });

// Create Drizzle instance with schema
export const db = drizzle(client, { schema });

// Export flag for checking database availability
export const isDatabaseAvailable = hasValidDatabaseUrl;

// Export schema for use in queries
export { schema };

// Type exports for convenience
export type Database = typeof db;
