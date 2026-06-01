/**
 * One-time dedup sweep for the BFI canonical-sourceId migration
 * (fix/bfi-sourceid-path-agnostic).
 *
 * WHY: unifying the BFI sourceId format (bfi-<cinemaId>-<titleSlug>-<screen>-<iso>
 * across Playwright/PDF/changes, with screen appended) CHANGES every BFI
 * sourceId. The next BFI scrape therefore INSERTs new-keyed rows alongside the
 * pre-migration rows (scrapers don't delete future screenings), producing a
 * one-time duplicate wave. This sweep removes the superseded duplicates.
 *
 * SAFE BY DESIGN: it only deletes within a (cinema_id, film_id, datetime,
 * screen) partition that has >1 row, keeping the most-recently-scraped row.
 * Two genuinely-simultaneous shows in different screens (NFT1 vs NFT2) live in
 * DIFFERENT partitions, so they are never collapsed.
 *
 * SCOPE: the DB `screen` column stores the RAW per-path string ("Screen NFT3"
 * from Playwright vs "NFT3" from PDF), so this partition collapses the
 * SAME-PATH re-key churn this migration is for (old vs new sourceId for the
 * SAME raw screen — the dominant Playwright→Playwright case). It deliberately
 * does NOT merge historical cross-path drift across different raw screen
 * strings; the unified sourceId prevents new cross-path dupes at the upsert
 * layer, and the pre-migration dry-run showed 0 such rows anyway.
 *
 * SEQUENCE: deploy the code → run the BFI Playwright scrape (so new-format rows
 * exist) → run this sweep. Running it before the new scrape would still be safe
 * (it only removes true dupes) but pointless.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/dedup-bfi-sourceid-migration.ts            # dry-run (report only)
 *   npx tsx --env-file=.env.local scripts/dedup-bfi-sourceid-migration.ts --execute  # delete dupes
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";

const EXECUTE = process.argv.includes("--execute");
const BFI_CINEMAS = ["bfi-southbank", "bfi-imax"];

function rows<T>(r: unknown): T[] {
  return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);
}

async function main() {
  // Find future BFI screenings that share a (cinema, film, datetime, screen)
  // key with another row — i.e. duplicates created by the sourceId reformat.
  // Rank newest-scraped first; rank>1 are the superseded rows to delete.
  const dupeSql = sql`
    WITH ranked AS (
      SELECT id, source_id, scraped_at,
        row_number() OVER (
          PARTITION BY cinema_id, film_id, datetime, COALESCE(screen, '')
          ORDER BY scraped_at DESC NULLS LAST, id DESC
        ) AS rn,
        count(*) OVER (
          PARTITION BY cinema_id, film_id, datetime, COALESCE(screen, '')
        ) AS grp
      FROM screenings
      WHERE cinema_id IN (${sql.join(BFI_CINEMAS.map((c) => sql`${c}`), sql`, `)})
        AND datetime > now()
    )
    SELECT id, source_id FROM ranked WHERE rn > 1
  `;

  const losers = rows<{ id: string; source_id: string | null }>(await db.execute(dupeSql));
  console.log(`\nBFI future-screening duplicates to remove: ${losers.length}`);
  if (losers.length > 0) {
    const byPrefix: Record<string, number> = {};
    for (const l of losers) {
      const p = (l.source_id ?? "null").replace(/-(bfi-)?[^-]+-\d{4}-.*$/, "").slice(0, 24);
      byPrefix[p] = (byPrefix[p] ?? 0) + 1;
    }
    console.log("  by sourceId shape (sample):", JSON.stringify(byPrefix).slice(0, 300));
  }

  if (!EXECUTE) {
    console.log("\nDRY RUN — no rows deleted. Re-run with --execute to apply.");
    process.exit(0);
  }

  if (losers.length === 0) {
    console.log("Nothing to delete.");
    process.exit(0);
  }

  const ids = losers.map((l) => l.id);
  const res = await db.execute(
    sql`DELETE FROM screenings WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`
  );
  const deleted = (res as { rowCount?: number }).rowCount ?? ids.length;
  console.log(`\n✅ Deleted ${deleted} superseded BFI duplicate screenings.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
