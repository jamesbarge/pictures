/**
 * Apply the cmd+k search migration (0012_search_layer.sql) to the
 * configured DATABASE_URL. Idempotent — uses IF NOT EXISTS throughout
 * and DROP+CREATE for the text search configuration.
 *
 * Usage:
 *     dotenv -e .env.local -- npx tsx scripts/apply-search-migration.ts
 *
 * Why a bespoke runner instead of drizzle-kit migrate:
 * - drizzle-kit only applies migrations in its journal (auto-generated)
 * - This migration is hand-crafted (extensions, custom TS config,
 *   generated columns with jsonb extraction) and must run as a single
 *   multi-statement DDL transaction
 * - postgres.js `sql.unsafe(string)` is the canonical way to run
 *   multi-statement SQL in this project's stack
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(
  __dirname,
  "..",
  "src",
  "db",
  "migrations",
  "0012_search_layer.sql"
);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  console.log(`Reading migration from ${MIGRATION_PATH}`);
  const ddl = await readFile(MIGRATION_PATH, "utf8");

  // Direct connection (port 5432) rather than the pooler is preferred
  // for DDL because ALTER TABLE adds a long-held lock and pgbouncer
  // transaction-mode pooling can drop the connection mid-statement.
  // postgres.js with prepare:false works either way; we let the URL
  // decide. If DATABASE_URL points at port 6543 (Supavisor), DDL still
  // works but is slightly riskier — print a warning.
  if (url.includes(":6543")) {
    console.warn(
      "DATABASE_URL targets port 6543 (Supavisor pooler) — DDL is supported but a direct connection (port 5432) is safer."
    );
  }

  const sql = postgres(url, { prepare: false, max: 1 });

  try {
    console.log("Applying migration (this may take 30-60s on a large films table)…");
    const t0 = Date.now();
    await sql.unsafe(ddl);
    const ms = Date.now() - t0;
    console.log(`✓ Migration applied in ${ms} ms`);
  } catch (err) {
    console.error("✗ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
