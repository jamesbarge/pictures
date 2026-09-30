/**
 * Dedup judgement harness.
 *
 * Replays candidate film pairs from the live DB through both the current rules
 * and a TypeSafe judgement, then reports where they disagree. Read-only: it
 * never writes to the database.
 *
 * Usage
 *   npx tsx --env-file=.env.local scripts/dedup-judgement/run.ts --band=undecidable
 *   npx tsx --env-file=.env.local scripts/dedup-judgement/run.ts --band=automerge --limit=40
 *   npx tsx --env-file=.env.local scripts/dedup-judgement/run.ts --band=undecidable --print-request
 *
 * Cost: the automerge and wide bands self-join `films` with similarity() and
 * no trigram index on `films.title`, about 70s at ~4.6k films (2026-09-26).
 * The frozen snapshot means each band pays that once.
 *
 * Bands
 *   undecidable  identical titles the year window rejects or cannot judge.
 *                These are the pairs the current rules provably cannot decide.
 *   automerge    pairs at or above the 0.85 auto-merge floor, to hunt for
 *                false positives in what we merge today.
 *   wide         everything from trigram 0.45 up, for a broad sweep.
 *
 * Without TYPESAFE_API_KEY the harness runs in preview mode: it builds every
 * request, reports the baseline decisions and token estimate, and prints one
 * full request body so the questions can be reviewed before any key is spent.
 * `--replay` rebuilds a report from cached responses with no key, no network
 * and no DB connection.
 *
 * The pair list is frozen to runs/pairs-<band>-<limit>.json on first load and
 * reused afterwards, because screening counts and venues move with every scrape
 * and are part of the request state, so a fresh pull would change every cache
 * key. Pass `--refresh` to pull the pairs from the DB again.
 *
 * Calls go through the experiment harness's TypeSafeClient: pinned model,
 * validated responses, a persistent $5-capped budget ledger, bounded retries,
 * and a cache under scripts/dedup-judgement/runs/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { TypeSafeClient } from "../typesafe-experiments/api";
import { buildRequest, type CandidatePair, type FilmSide } from "./questions";
import {
  decideFromAnswers,
  decideFromCurrentRules,
  type Decision,
  type PairAnswers,
} from "./policy";

// The shared client's documented concurrency ceiling for experiments.
const CONCURRENCY = 4;
const RUNS_DIR = join(__dirname, "runs");
const CACHE_DIR = join(RUNS_DIR, "cache");

type Band = "undecidable" | "automerge" | "wide";

interface Args {
  band: Band;
  limit: number;
  printRequest: boolean;
  replay: boolean;
  refresh: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const band = (get("band") ?? "undecidable") as Band;
  if (!["undecidable", "automerge", "wide"].includes(band)) {
    throw new Error(`unknown --band=${band}`);
  }
  return {
    band,
    limit: Number(get("limit") ?? 60),
    printRequest: argv.includes("--print-request"),
    replay: argv.includes("--replay"),
    refresh: argv.includes("--refresh"),
  };
}

/** SQL predicate selecting the requested band. */
function bandPredicate(band: Band) {
  if (band === "undecidable") {
    // Identical titles where the year window either rejects the pair outright
    // or has nothing to judge because one side has no year.
    return sql`lower(btrim(f1.title)) = lower(btrim(f2.title))
      AND (
        (f1.year IS NOT NULL AND f2.year IS NOT NULL AND abs(f1.year - f2.year) > 5)
        OR ((f1.year IS NULL) <> (f2.year IS NULL))
      )`;
  }
  if (band === "automerge") {
    return sql`similarity(f1.title, f2.title) >= 0.85`;
  }
  return sql`similarity(f1.title, f2.title) >= 0.45`;
}

async function loadPairs(band: Band, limit: number): Promise<CandidatePair[]> {
  // Imported lazily so --replay from a snapshot never opens a DB connection.
  const { db } = await import("../../src/db");
  const rows = await db.execute(sql`
    WITH venue_rollup AS (
      SELECT s.film_id, array_agg(DISTINCT c.name) AS venues, count(*)::int AS screening_count
      FROM screenings s JOIN cinemas c ON c.id = s.cinema_id
      GROUP BY s.film_id
    )
    SELECT
      f1.id AS l_id, f1.title AS l_title, f1.year AS l_year, f1.tmdb_id AS l_tmdb,
      f1.directors AS l_directors, f1.runtime AS l_runtime, f1.synopsis AS l_synopsis,
      COALESCE(v1.venues, '{}') AS l_venues, COALESCE(v1.screening_count, 0) AS l_count,
      f2.id AS r_id, f2.title AS r_title, f2.year AS r_year, f2.tmdb_id AS r_tmdb,
      f2.directors AS r_directors, f2.runtime AS r_runtime, f2.synopsis AS r_synopsis,
      COALESCE(v2.venues, '{}') AS r_venues, COALESCE(v2.screening_count, 0) AS r_count,
      similarity(f1.title, f2.title) AS sim
    FROM films f1
    JOIN films f2 ON f1.id < f2.id
    LEFT JOIN venue_rollup v1 ON v1.film_id = f1.id
    LEFT JOIN venue_rollup v2 ON v2.film_id = f2.id
    WHERE ${bandPredicate(band)}
    ORDER BY sim DESC, f1.title, f1.id, f2.id
    LIMIT ${limit}
  `);

  const side = (r: Record<string, unknown>, p: "l" | "r"): FilmSide => ({
    title: r[`${p}_title`] as string,
    year: (r[`${p}_year`] as number | null) ?? null,
    tmdbId: (r[`${p}_tmdb`] as number | null) ?? null,
    directors: (r[`${p}_directors`] as string[] | null) ?? [],
    runtime: (r[`${p}_runtime`] as number | null) ?? null,
    synopsis: (r[`${p}_synopsis`] as string | null) ?? null,
    venues: (r[`${p}_venues`] as string[] | null) ?? [],
    screeningCount: Number(r[`${p}_count`] ?? 0),
  });

  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    leftId: r.l_id as string,
    rightId: r.r_id as string,
    left: side(r, "l"),
    right: side(r, "r"),
    // postgres.js returns NUMERIC as a string; similarity() is a float4 but
    // coerce anyway so a driver change cannot silently produce NaN comparisons.
    trigramSimilarity: Number(r.sim),
  }));
}

async function ask(pair: CandidatePair, client: TypeSafeClient): Promise<PairAnswers> {
  const record = await client.evaluate(buildRequest(pair));
  // validateResponse has already checked every answer's type and range.
  return record.response.answers as unknown as PairAnswers;
}

/** Bounded-concurrency map, so a 400-pair sweep stays inside the rate limit. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

function describe(side: FilmSide): string {
  return `${side.title} [${side.year ?? "-"}|tmdb ${side.tmdbId ?? "-"}|${side.screeningCount} scr]`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.TYPESAFE_API_KEY;

  const snapshot = join(RUNS_DIR, `pairs-${args.band}-${args.limit}.json`);
  let pairs: CandidatePair[];
  if (existsSync(snapshot) && !args.refresh) {
    pairs = JSON.parse(readFileSync(snapshot, "utf8")) as CandidatePair[];
    console.log(`\nUsing frozen pairs from ${snapshot} (--refresh to re-pull)`);
  } else if (args.replay) {
    throw new Error(`--replay needs a frozen pair list at ${snapshot}; run once without --replay first.`);
  } else {
    pairs = await loadPairs(args.band, args.limit);
    mkdirSync(RUNS_DIR, { recursive: true });
    writeFileSync(snapshot, JSON.stringify(pairs, null, 2));
  }
  console.log(`\nBand "${args.band}": ${pairs.length} candidate pairs\n`);

  if (args.printRequest && pairs.length) {
    console.log("Example request body:\n");
    console.log(JSON.stringify(buildRequest(pairs[0]), null, 2));
    console.log();
  }

  const baseline = pairs.map(decideFromCurrentRules);

  if (!apiKey && !args.replay) {
    // Rough token estimate so the cost of a live run is known before it runs.
    const chars = pairs.reduce(
      (n, p) => n + JSON.stringify(buildRequest(p)).length,
      0
    );
    const tokens = Math.round(chars / 4);
    console.log("TYPESAFE_API_KEY is not set, so this is a preview run.\n");
    console.log("Current rules would decide:");
    for (const action of ["merge", "review", "leave_unlinked"] as const) {
      console.log(`  ${action.padEnd(15)} ${baseline.filter((d) => d.action === action).length}`);
    }
    console.log(
      `\nA live run would send ~${tokens.toLocaleString()} input tokens ` +
        `(~$${((tokens / 1_000_000) * 0.042).toFixed(4)} at jev-1.13 pricing).`
    );
    console.log("Re-run with --print-request to review the exact questions.\n");
    process.exit(0);
  }

  const client = new TypeSafeClient({ cacheDir: CACHE_DIR, mode: args.replay ? "replay" : "live" });
  const answers = await mapLimit(pairs, CONCURRENCY, (p) => ask(p, client));
  const stats = client.stats;
  console.log(
    `TypeSafe: ${stats.networkRequests} network requests, ${stats.cacheHits} cache hits, ` +
      `$${stats.spentUsd.toFixed(4)} recorded spend (upper estimate)\n`
  );
  const judged = answers.map((a) => decideFromAnswers(a));

  let agree = 0;
  const disagreements: Array<{ pair: CandidatePair; was: Decision; now: Decision; a: PairAnswers }> = [];
  pairs.forEach((pair, i) => {
    if (baseline[i].action === judged[i].action) agree++;
    else disagreements.push({ pair, was: baseline[i], now: judged[i], a: answers[i] });
  });

  console.log(`Agreement: ${agree}/${pairs.length}\n`);
  console.log(`Disagreements (${disagreements.length}):\n`);
  for (const d of disagreements) {
    console.log(`  ${describe(d.pair.left)}`);
    console.log(`  ${describe(d.pair.right)}`);
    console.log(`    trigram ${d.pair.trigramSimilarity.toFixed(2)}`);
    console.log(`    current:   ${d.was.action} (${d.was.reason})`);
    console.log(
      `    judgement: ${d.now.action} (${d.now.reason}) ` +
        `score ${d.a.relationship.score.toFixed(2)} conf ${d.a.relationship.confidence.toFixed(2)}`
    );
    console.log();
  }

  const counts = (ds: Decision[]) =>
    (["merge", "review", "leave_unlinked"] as const)
      .map((a) => `${a} ${ds.filter((d) => d.action === a).length}`)
      .join("  ");
  console.log(`Current rules: ${counts(baseline)}`);
  console.log(`Judgement:     ${counts(judged)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
