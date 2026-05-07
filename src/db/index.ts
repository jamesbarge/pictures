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
// `max` is configurable via DB_POOL_MAX so local /scrape can use multiple
// connection slots — a wedged half-open conn no longer blocks all subsequent
// queries while we wait for max_lifetime rotation. Defaults to 1 to preserve
// serverless-safe behavior on Vercel; bump to 3 in .env.local for local runs.
const poolMax = process.env.DB_POOL_MAX
  ? Math.max(1, Number(process.env.DB_POOL_MAX))
  : 1;

const client = hasValidDatabaseUrl
  ? postgres(connectionString, {
      prepare: false, // Required for Supabase connection pooling (transaction mode)
      max: poolMax,
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

/**
 * Client-side hard ceiling on a DB call. Rejects after `ms` if the underlying
 * postgres-js promise hasn't settled.
 *
 * Why this exists (added 2026-05-07): postgres-js + Supabase pooler can leave
 * the client blocked on `recv()` for a connection the pooler silently dropped
 * at the TCP layer. The server-side `statement_timeout` only fires if the
 * server receives the query. `idle_timeout` only kills idle conns. macOS's
 * default TCP keepalive is 7200s. Net effect: a query promise hangs forever.
 *
 * This wrapper bounds every wrapped call. On timeout the per-cinema try/catch
 * in pipeline.ts logs the failure and moves on — same recovery posture as the
 * existing 57014 (query_canceled) catch path.
 *
 * Note: this stops *waiting* on the promise; the underlying socket is still
 * held by postgres-js until its own cleanup runs. That's acceptable here
 * because `max: 1` means at most one stuck conn, and `max_lifetime: 30min`
 * eventually rotates it.
 */
export function withDbTimeout<T>(
  p: Promise<T>,
  ms = 10_000,
  label = "db query",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timeout after ${ms}ms (client-side)`)),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
