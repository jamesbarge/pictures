/**
 * Reconcile phantom screenings against the last successful scrape (plan 009).
 *
 * The pipeline is upsert-only: rows that vanish from a cinema's website are
 * never removed, so sourceId scheme changes (or programme changes) strand
 * "phantom" rows that no longer exist at the source. This script finds and —
 * only with --execute — deletes them, one cinema at a time.
 *
 * A phantom is an UPCOMING row (datetime >= now) that the cinema's most
 * recent successful scrape did NOT refresh (scraped_at < that run's start).
 * The pipeline bumps scraped_at on every insert AND update, so anything the
 * live scrape still lists carries a fresh scraped_at and is never touched.
 *
 * Usage (default-dry, PR #660 convention):
 *   npm run reconcile:plan -- <cinemaId>                   # print plan, no writes
 *   npm run reconcile:apply -- <cinemaId>                  # delete planned rows
 *   npm run reconcile:plan -- <cinemaId> --force-large     # bypass the 40% cap (still dry)
 *
 * Hard guards (all non-negotiable — see plans/009-sourceid-phantom-reconcile.md):
 *   1. Exactly one cinemaId per invocation; it must exist in the cinema registry.
 *   2. A successful scrape of that cinema must have completed within the last
 *      2 hours (scraper_runs) — reconciling against a stale scrape would
 *      delete valid rows. A "success" run that upserted 0 screenings is
 *      refused outright (NOT overridable): it has no information content,
 *      and sweeping behind it would wipe the venue.
 *   3. Only rows with datetime >= now AND scraped_at < <last run start> are
 *      ever candidates (re-guarded again inside the DELETE itself). Rows
 *      beyond the run's demonstrated scrape horizon (the latest datetime the
 *      run actually refreshed) are excluded — a temporarily shortened
 *      listings window must not condemn valid far-future rows.
 *   4. Refuse if the plan would delete >40% of the cinema's upcoming rows
 *      (--force-large overrides with a red warning; --execute still required).
 *   5. Every doomed row is printed (title, datetime, source_id, scraped_at);
 *      --execute deletes in batches of 100 inside a single transaction.
 *
 * Known limitation: only canonical registry cinema IDs are accepted; any
 * screenings rows still carrying legacy cinema IDs are not swept.
 *
 * Supersedes the one-off `src/scripts/_bfi_reconcile.ts` (untracked staging
 * script): unlike it, this script does NOT scrape — run the venue's scraper
 * first, then reconcile while the run is fresh.
 *
 * Rollout sequence per scraper sourceId change (plan 009 step 1):
 *   deploy change → scrape venue once → reconcile:plan → review → reconcile:apply
 */

import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "@/db";
import { films, scraperRuns, screenings } from "@/db/schema";
import { CINEMA_REGISTRY } from "@/config/cinema-registry";

// ============================================================================
// Pure guard logic (unit-tested in reconcile-phantom-screenings.test.ts)
// ============================================================================

/** Guard 2: a reconcile is only safe within this window after a successful scrape. */
export const MAX_SCRAPE_AGE_MS = 2 * 60 * 60 * 1000;

/** Guard 4: refuse plans that would delete more than this share of upcoming rows. */
export const DELETION_CAP = 0.4;

/** Guard 5: delete batch size inside the transaction. */
export const DELETE_BATCH_SIZE = 100;

export interface ReconcileArgs {
  cinemaId: string | null;
  execute: boolean;
  forceLarge: boolean;
  errors: string[];
}

/**
 * Guard 1a (pure): parse argv into exactly one cinemaId + known flags.
 * Any extra positional or unknown flag is an error — a typo must never
 * silently widen the blast radius of a deletion script.
 */
export function parseReconcileArgs(argv: string[]): ReconcileArgs {
  const args: ReconcileArgs = { cinemaId: null, execute: false, forceLarge: false, errors: [] };
  for (const arg of argv) {
    if (arg === "--execute") {
      args.execute = true;
    } else if (arg === "--force-large") {
      args.forceLarge = true;
    } else if (arg.startsWith("-")) {
      args.errors.push(`Unknown flag: ${arg}`);
    } else if (args.cinemaId === null) {
      args.cinemaId = arg;
    } else {
      args.errors.push(`Multiple cinema IDs given ("${args.cinemaId}", "${arg}") — one cinema per invocation.`);
    }
  }
  if (args.cinemaId === null) {
    args.errors.push("Missing required <cinemaId> argument.");
  }
  return args;
}

/** Guard 1b (pure): the cinemaId must exist in the known registry. */
export function validateCinemaId(cinemaId: string, knownIds: readonly string[]): boolean {
  return knownIds.includes(cinemaId);
}

/**
 * Guard 2 (pure): true only if the last successful scrape completed recently
 * enough (within MAX_SCRAPE_AGE_MS, and not in the future).
 */
export function isReconcileSafe(
  lastRunCompletedAt: Date | null | undefined,
  now: Date,
  maxAgeMs: number = MAX_SCRAPE_AGE_MS,
): boolean {
  if (!lastRunCompletedAt) return false;
  const age = now.getTime() - lastRunCompletedAt.getTime();
  return age >= 0 && age <= maxAgeMs;
}

/**
 * Guard 2b (pure): a "success" run that upserted zero screenings (or never
 * recorded a count) is vacuous — reconciling against it would classify every
 * upcoming row as a phantom. Never overridable, not even by --force-large.
 */
export function isVacuousRun(screeningCount: number | null | undefined): boolean {
  return !(typeof screeningCount === "number" && screeningCount > 0);
}

/**
 * Guard 3 (pure): a row is a phantom only if it is upcoming AND the last
 * successful run did not refresh it (the pipeline bumps scraped_at on every
 * insert and update, so live rows always carry scraped_at >= run start).
 */
export function isPhantomRow(
  row: { datetime: Date; scrapedAt: Date },
  runStartedAt: Date,
  now: Date,
): boolean {
  return row.datetime.getTime() >= now.getTime() && row.scrapedAt.getTime() < runStartedAt.getTime();
}

/**
 * Guard 3b (pure): the run's demonstrated scrape horizon — the latest
 * datetime among rows the run actually refreshed (scraped_at >= run start).
 * Otherwise-phantom rows BEYOND this horizon are excluded from the plan: the
 * run never demonstrated coverage out there, so their absence proves nothing
 * (shortened listings windows / capped APIs / partial scraper paths).
 * Returns null when the run refreshed nothing (vacuous — guard 2b refuses).
 */
export function scrapeHorizon(
  rows: ReadonlyArray<{ datetime: Date; scrapedAt: Date }>,
  runStartedAt: Date,
): Date | null {
  let max: Date | null = null;
  for (const row of rows) {
    if (row.scrapedAt.getTime() >= runStartedAt.getTime() && (max === null || row.datetime > max)) {
      max = row.datetime;
    }
  }
  return max;
}

/** Guard 4 (pure): does the plan exceed the deletion cap? Empty-total plans with deletions always exceed. */
export function exceedsDeletionCap(planned: number, total: number, cap: number = DELETION_CAP): boolean {
  if (planned <= 0) return false;
  if (total <= 0) return true;
  return planned / total > cap;
}

/** Guard 5 (pure): split ids into fixed-size delete batches. */
export function batchIds<T>(ids: readonly T[], size: number = DELETE_BATCH_SIZE): T[][] {
  if (size <= 0) throw new Error(`batchIds: size must be > 0, got ${size}`);
  const batches: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    batches.push(ids.slice(i, i + size));
  }
  return batches;
}

// ============================================================================
// Main
// ============================================================================

const RED = "\x1b[31m";
const RESET = "\x1b[0m";

async function main(): Promise<void> {
  const args = parseReconcileArgs(process.argv.slice(2));
  if (args.errors.length > 0 || !args.cinemaId) {
    for (const err of args.errors) console.error(`ERROR: ${err}`);
    console.error(
      "\nUsage: reconcile-phantom-screenings.ts <cinemaId> [--execute] [--force-large]",
    );
    process.exit(1);
    return;
  }
  const cinemaId = args.cinemaId;

  // Guard 1: cinema must exist in the registry.
  const knownIds = CINEMA_REGISTRY.map((c) => c.id);
  if (!validateCinemaId(cinemaId, knownIds)) {
    console.error(`ERROR: Unknown cinema "${cinemaId}" — not in the cinema registry.`);
    console.error(`Known IDs include: ${knownIds.slice(0, 10).join(", ")}, ...`);
    process.exit(1);
    return;
  }

  const now = new Date();

  // Guard 2: last SUCCESSFUL scrape of this cinema must be fresh (< 2h old).
  const [lastRun] = await db
    .select({
      startedAt: scraperRuns.startedAt,
      completedAt: scraperRuns.completedAt,
      screeningCount: scraperRuns.screeningCount,
    })
    .from(scraperRuns)
    .where(and(eq(scraperRuns.cinemaId, cinemaId), eq(scraperRuns.status, "success")))
    .orderBy(desc(scraperRuns.startedAt))
    .limit(1);

  if (!lastRun || !isReconcileSafe(lastRun.completedAt, now)) {
    const lastSeen = lastRun?.completedAt?.toISOString() ?? "never";
    console.error(
      `REFUSED (guard 2): no successful scrape of "${cinemaId}" completed in the last ` +
        `${MAX_SCRAPE_AGE_MS / 3_600_000}h (last success: ${lastSeen}).\n` +
        `Run the scraper first, then reconcile while the run is fresh — reconciling ` +
        `against a stale scrape would delete valid rows.`,
    );
    process.exit(1);
    return;
  }

  // Guard 2b: a vacuous "success" run (0 screenings upserted) must never be
  // swept behind — every upcoming row would be condemned. Not overridable.
  if (isVacuousRun(lastRun.screeningCount)) {
    console.error(
      `REFUSED (guard 2b): the last successful scrape of "${cinemaId}" recorded ` +
        `${lastRun.screeningCount ?? "no"} screenings — a reconcile against an empty scrape ` +
        `would delete the venue's entire upcoming programme. This refusal cannot be overridden.`,
    );
    process.exit(1);
    return;
  }

  const runStartedAt = lastRun.startedAt;
  console.log(`[reconcile] cinema:    ${cinemaId}`);
  console.log(`[reconcile] last run:  started ${runStartedAt.toISOString()}, completed ${lastRun.completedAt!.toISOString()} (${lastRun.screeningCount ?? "?"} screenings)`);
  console.log(`[reconcile] mode:      ${args.execute ? "EXECUTE" : "plan (dry run — pass --execute to delete)"}\n`);

  // Fetch all upcoming rows for the cinema; classify with the pure guard-3 predicate.
  const upcoming = await db
    .select({
      id: screenings.id,
      datetime: screenings.datetime,
      scrapedAt: screenings.scrapedAt,
      sourceId: screenings.sourceId,
      title: films.title,
    })
    .from(screenings)
    .innerJoin(films, eq(screenings.filmId, films.id))
    .where(and(eq(screenings.cinemaId, cinemaId), gte(screenings.datetime, now)));

  // Guard 3b: never condemn rows beyond the run's demonstrated coverage.
  const horizon = scrapeHorizon(upcoming, runStartedAt);
  if (horizon === null) {
    console.error(
      `REFUSED (guard 3b): the last successful scrape refreshed zero upcoming rows for ` +
        `"${cinemaId}" — it demonstrated no coverage, so nothing can be safely classified ` +
        `as a phantom. This refusal cannot be overridden.`,
    );
    process.exit(1);
    return;
  }

  const stale = upcoming.filter((row) => isPhantomRow(row, runStartedAt, now));
  const phantoms = stale
    .filter((row) => row.datetime.getTime() <= horizon.getTime())
    .sort((a, b) => a.datetime.getTime() - b.datetime.getTime());
  const beyondHorizon = stale
    .filter((row) => row.datetime.getTime() > horizon.getTime())
    .sort((a, b) => a.datetime.getTime() - b.datetime.getTime());

  console.log(`[reconcile] upcoming rows: ${upcoming.length}`);
  console.log(`[reconcile] scrape horizon: ${horizon.toISOString()} (latest datetime the run refreshed)`);
  console.log(`[reconcile] phantom rows:  ${phantoms.length} (scraped_at < run start, now <= datetime <= horizon)\n`);

  if (beyondHorizon.length > 0) {
    console.log(
      `[reconcile] BEYOND SCRAPE HORIZON — ${beyondHorizon.length} stale rows excluded ` +
        `(the run never demonstrated coverage past ${horizon.toISOString()}):`,
    );
    for (const p of beyondHorizon) {
      console.log(
        `  EXCLUDED      ${p.datetime.toISOString()}  source_id=${p.sourceId ?? "<null>"}  ` +
          `scraped_at=${p.scrapedAt.toISOString()}  "${p.title}"`,
      );
    }
    console.log("");
  }

  if (phantoms.length === 0) {
    console.log("Nothing to reconcile — every upcoming row was refreshed by the last scrape.");
    process.exit(0);
    return;
  }

  // Guard 5 (plan output): print every doomed row.
  for (const p of phantoms) {
    console.log(
      `  WOULD DELETE  ${p.datetime.toISOString()}  source_id=${p.sourceId ?? "<null>"}  ` +
        `scraped_at=${p.scrapedAt.toISOString()}  "${p.title}"`,
    );
  }
  const pct = upcoming.length > 0 ? ((phantoms.length / upcoming.length) * 100).toFixed(1) : "100";
  console.log(`\n[reconcile] plan: delete ${phantoms.length}/${upcoming.length} upcoming rows (${pct}%)`);

  // Guard 4: deletion cap.
  if (exceedsDeletionCap(phantoms.length, upcoming.length)) {
    if (!args.forceLarge) {
      console.error(
        `\nREFUSED (guard 4): plan would delete >${DELETION_CAP * 100}% of "${cinemaId}"'s upcoming rows. ` +
          `Verify the scrape was complete (not blocked/partial) before overriding with --force-large.`,
      );
      process.exit(1);
      return;
    }
    console.warn(
      `\n${RED}WARNING: --force-large override active — plan exceeds the ${DELETION_CAP * 100}% deletion cap. ` +
        `Double-check the scrape above was healthy before applying.${RESET}`,
    );
  }

  if (!args.execute) {
    console.log("\nDry run complete. Re-run with --execute to apply this plan.");
    process.exit(0);
    return;
  }

  // Guard 5 (execute): batched deletes inside a single transaction, each batch
  // re-guarded to this cinema + future-only + still-stale rows.
  const ids = phantoms.map((p) => p.id);
  let deleted = 0;
  await db.transaction(async (tx) => {
    for (const batch of batchIds(ids)) {
      const result = await tx
        .delete(screenings)
        .where(
          and(
            inArray(screenings.id, batch),
            eq(screenings.cinemaId, cinemaId),
            gte(screenings.datetime, now),
            lt(screenings.scrapedAt, runStartedAt),
          ),
        )
        .returning({ id: screenings.id });
      deleted += result.length;
    }
  });

  console.log(`\n[reconcile] deleted ${deleted} phantom rows from "${cinemaId}".`);
  if (deleted !== ids.length) {
    console.warn(
      `[reconcile] note: ${ids.length - deleted} planned rows were skipped by the re-guard ` +
        `(refreshed or past by execution time) — that is the guard working, not an error.`,
    );
  }
  process.exit(0);
}

// Run if called directly (not when imported by tests)
const isDirectRun =
  process.argv[1]?.endsWith("reconcile-phantom-screenings.ts") ||
  process.argv[1]?.endsWith("reconcile-phantom-screenings.js");

if (isDirectRun) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
