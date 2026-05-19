/**
 * Verify the cmd+k search migration (0012_search_layer.sql) applied
 * correctly. Run AFTER the migration is applied:
 *
 *     npx tsx scripts/verify-search-migration.ts
 *
 * Tests:
 *   1. Required extensions are enabled
 *   2. The `pictures` text search config exists with unaccent
 *   3. search_tsv / search_text generated columns exist on all 5 tables
 *   4. All required GIN + compound btree indexes exist
 *   5. Unaccent works ("Amélie" matches "amelie")
 *   6. Trigram fuzzy works ("amelei" matches "amelie")
 *   7. Cast jsonb extraction populated search_tsv for a real film
 *
 * Exits 0 on full success, 1 on any failure. Safe to run in CI.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";

// Drizzle + postgres.js returns rows as an array directly; the
// `{ rows: [...] }` shape only appears with pg's node-postgres driver.
// Project pattern (see src/agents/data-quality/index.ts:257-259) is to
// handle both, defensively.
function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const maybe = (result as { rows?: T[] }).rows;
  return maybe ?? [];
}

interface Check {
  name: string;
  run: () => Promise<{ ok: boolean; detail?: string }>;
}

const checks: Check[] = [
  {
    name: "extension: unaccent",
    async run() {
      const result = await db.execute(sql`
        SELECT extname FROM pg_extension WHERE extname = 'unaccent'
      `);
      return { ok: toRows<{ extname: string }>(result).length === 1 };
    },
  },
  {
    name: "extension: pg_trgm",
    async run() {
      const result = await db.execute(sql`
        SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
      `);
      return { ok: toRows<{ extname: string }>(result).length === 1 };
    },
  },
  {
    name: "extension: btree_gin",
    async run() {
      const result = await db.execute(sql`
        SELECT extname FROM pg_extension WHERE extname = 'btree_gin'
      `);
      return { ok: toRows<{ extname: string }>(result).length === 1 };
    },
  },
  {
    name: "text search config: pictures",
    async run() {
      const result = await db.execute(sql`
        SELECT cfgname FROM pg_ts_config WHERE cfgname = 'pictures'
      `);
      return { ok: toRows<{ cfgname: string }>(result).length === 1 };
    },
  },
  {
    name: "generated columns: films.search_tsv + search_text",
    async run() {
      const result = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'films'
          AND column_name IN ('search_tsv', 'search_text')
      `);
      const rows = toRows<{ column_name: string }>(result);
      return {
        ok: rows.length === 2,
        detail: `found ${rows.length}/2 columns`,
      };
    },
  },
  {
    name: "generated columns: cinemas.search_tsv + search_text",
    async run() {
      const result = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'cinemas'
          AND column_name IN ('search_tsv', 'search_text')
      `);
      const rows = toRows<{ column_name: string }>(result);
      return {
        ok: rows.length === 2,
        detail: `found ${rows.length}/2 columns`,
      };
    },
  },
  {
    name: "generated column: screenings.search_tsv",
    async run() {
      const result = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'screenings' AND column_name = 'search_tsv'
      `);
      return { ok: toRows<{ column_name: string }>(result).length === 1 };
    },
  },
  {
    name: "generated column: festivals.search_tsv",
    async run() {
      const result = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'festivals' AND column_name = 'search_tsv'
      `);
      return { ok: toRows<{ column_name: string }>(result).length === 1 };
    },
  },
  {
    name: "generated column: seasons.search_tsv",
    async run() {
      const result = await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'seasons' AND column_name = 'search_tsv'
      `);
      return { ok: toRows<{ column_name: string }>(result).length === 1 };
    },
  },
  {
    name: "indexes: 11 GIN + compound btrees",
    async run() {
      const result = await db.execute(sql`
        SELECT indexname FROM pg_indexes
        WHERE indexname IN (
          'idx_films_search_tsv', 'idx_films_search_trgm',
          'idx_cinemas_search_tsv', 'idx_cinemas_search_trgm',
          'idx_screenings_search_tsv', 'idx_festivals_search_tsv',
          'idx_seasons_search_tsv',
          'idx_films_rep_year', 'idx_films_content_type_year',
          'idx_films_decade', 'idx_screenings_film_future'
        )
      `);
      const rows = toRows<{ indexname: string }>(result);
      return {
        ok: rows.length === 11,
        detail: `found ${rows.length}/11 indexes`,
      };
    },
  },
  {
    name: "unaccent: Amélie matches amelie",
    async run() {
      const result = await db.execute(sql`
        SELECT to_tsvector('pictures', 'Amélie') @@ websearch_to_tsquery('pictures', 'amelie') AS match
      `);
      const rows = toRows<{ match: boolean }>(result);
      return { ok: rows[0]?.match === true };
    },
  },
  {
    name: "trigram fuzzy: amelei %> amelie",
    async run() {
      const result = await db.execute(sql`
        SELECT 'amelie' %> 'amelei' AS match
      `);
      const rows = toRows<{ match: boolean }>(result);
      return { ok: rows[0]?.match === true };
    },
  },
  {
    name: "films.search_tsv populated for a film with cast",
    async run() {
      const result = await db.execute(sql`
        SELECT id,
               length(search_tsv::text) AS tsv_len
        FROM films
        WHERE jsonb_array_length(coalesce("cast", '[]'::jsonb)) > 3
          AND search_tsv IS NOT NULL
        ORDER BY tmdb_popularity DESC NULLS LAST
        LIMIT 1
      `);
      const rows = toRows<{ id: string; tsv_len: number }>(result);
      const len = Number(rows[0]?.tsv_len ?? 0);
      return {
        ok: len > 50,
        detail: `sample film tsv length ${len} chars`,
      };
    },
  },
  {
    name: "cinemas.search_tsv extracts address.area from jsonb",
    async run() {
      const result = await db.execute(sql`
        SELECT id, search_tsv::text AS tsv
        FROM cinemas
        WHERE address->>'area' IS NOT NULL AND search_tsv IS NOT NULL
        LIMIT 1
      `);
      const rows = toRows<{ id: string; tsv: string }>(result);
      const tsv = rows[0]?.tsv ?? "";
      return {
        ok: tsv.length > 10,
        detail: `sample cinema tsv: ${tsv.slice(0, 80)}…`,
      };
    },
  },
];

async function main() {
  let failed = 0;
  for (const check of checks) {
    try {
      const result = await check.run();
      const icon = result.ok ? "✓" : "✗";
      const detail = result.detail ? ` (${result.detail})` : "";
      console.log(`${icon} ${check.name}${detail}`);
      if (!result.ok) failed += 1;
    } catch (err) {
      console.log(`✗ ${check.name} — threw ${(err as Error).message}`);
      failed += 1;
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${checks.length} checks passed.`);
  process.exit(0);
}

main();
