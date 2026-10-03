/**
 * Apply judged TMDB matches to unmatched upcoming films.
 *
 * Input is a JSON file written after a Claude Code review session:
 *   { "match": { "<exact films.title>": <tmdbId>, ... },
 *     "reclassify": { "<exact films.title>": "live_broadcast" | "event" | "concert", ... } }
 * Other top-level keys are ignored, so the file can carry review notes.
 *
 * Only rows with tmdb_id IS NULL and at least one upcoming screening are touched.
 * Writes reuse the rematch sweep's executeUpdate / executeMerge, so a manual match
 * gets the same metadata fields, write guards and transactional merge as the
 * automated paths.
 *
 * Re-scrape durability: the pipeline finds films by normalizeTitle(films.title).
 * An UPDATE keeps the scraped title unless TMDB's title normalizes to the same key,
 * so updated rows stay findable. A MERGE deletes the row carrying the venue's key;
 * unless the cleaner, the trigram step or a cache alias routes that venue title to
 * the merge target, the next scrape re-creates an unmatched row and moves the
 * screenings back onto it. The dry run flags those merges as [key changes]. The
 * mapping file is safe to re-run: re-created rows with the same titles are merged
 * again.
 *
 * Needs .claude/data-check-learnings.json in the working directory (it holds the
 * TMDB blocklist and learned cleaner rules, and is gitignored, so worktrees lack it
 * unless symlinked). --execute refuses to run without it.
 *
 * Usage:
 *   npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/apply-manual-tmdb-matches.ts --file=<path>
 *   ... --execute    apply the plan (default is a dry run)
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { getTMDBClient } from "@/lib/tmdb";
import { isBlockedTmdbId } from "@/lib/tmdb/blocklist";
import { normalizeTitle } from "@/scrapers/pipeline";
import { executeMerge, executeUpdate } from "@/scripts/rematch-unmatched-films";

const STRATEGY = "claude-code-manual";
const CONTENT_TYPES = new Set(["film", "concert", "live_broadcast", "event"]);

export interface CandidateRow {
  id: string;
  title: string;
  year: number | null;
  directors: string[];
  screenings: number;
}

export type PlannedAction =
  | { kind: "update"; row: CandidateRow; tmdbId: number }
  | { kind: "merge"; row: CandidateRow; tmdbId: number; targetFilmId: string; targetTitle: string }
  | { kind: "skip"; title: string; tmdbId: number; reason: string };

/** Keep the scraped title unless TMDB's normalizes to the same cache key. */
export function chooseTitle(current: string, tmdbTitle: string, normalize: (t: string) => string): string {
  return normalize(tmdbTitle) === normalize(current) ? tmdbTitle : current;
}

/**
 * Turn a title -> tmdbId mapping into UPDATE / MERGE / SKIP actions.
 * Every row mapped to one id collapses onto a single film: the existing owner of
 * that id if there is one, otherwise the mapped row with the most upcoming screenings.
 */
export function planManualMatches(input: {
  rowsByTitle: Map<string, CandidateRow[]>;
  mapping: Record<string, number>;
  owners: Map<number, { id: string; title: string }>;
  isBlocked: (tmdbId: number) => boolean;
}): PlannedAction[] {
  const skips: PlannedAction[] = [];
  const rowsById = new Map<number, CandidateRow[]>();

  for (const [title, tmdbId] of Object.entries(input.mapping)) {
    if (input.isBlocked(tmdbId)) {
      skips.push({ kind: "skip", title, tmdbId, reason: "tmdb id is on the global blocklist" });
      continue;
    }
    const rows = input.rowsByTitle.get(title) ?? [];
    if (rows.length === 0) {
      skips.push({ kind: "skip", title, tmdbId, reason: "no unmatched row with upcoming screenings has this exact title" });
      continue;
    }
    rowsById.set(tmdbId, [...(rowsById.get(tmdbId) ?? []), ...rows]);
  }

  const actions: PlannedAction[] = [];
  for (const [tmdbId, rows] of rowsById) {
    // Busiest row survives; on a tie the shorter title is usually the one without event debris.
    const sorted = [...rows].sort((a, b) => b.screenings - a.screenings || a.title.length - b.title.length);
    const owner = input.owners.get(tmdbId);
    if (owner) {
      for (const row of sorted) actions.push({ kind: "merge", row, tmdbId, targetFilmId: owner.id, targetTitle: owner.title });
      continue;
    }
    const [keeper, ...rest] = sorted;
    actions.push({ kind: "update", row: keeper, tmdbId });
    for (const row of rest) actions.push({ kind: "merge", row, tmdbId, targetFilmId: keeper.id, targetTitle: keeper.title });
  }
  return [...actions, ...skips];
}

/** Merges into a keeper whose UPDATE failed would fold siblings into a row that never got its tmdb_id. */
export function withoutMergesIntoFailedKeepers(
  merges: PlannedAction[],
  failedKeeperIds: Set<string>,
): { kept: PlannedAction[]; dropped: PlannedAction[] } {
  const kept: PlannedAction[] = [];
  const dropped: PlannedAction[] = [];
  for (const m of merges) (m.kind === "merge" && failedKeeperIds.has(m.targetFilmId) ? dropped : kept).push(m);
  return { kept, dropped };
}

async function loadCandidateRows(titles: string[]): Promise<Map<string, CandidateRow[]>> {
  const rows = await db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      directors: films.directors,
      screenings: sql<number>`count(${screenings.id})::int`,
    })
    .from(films)
    .innerJoin(screenings, and(eq(screenings.filmId, films.id), gte(screenings.datetime, new Date())))
    .where(and(isNull(films.tmdbId), inArray(films.title, titles)))
    .groupBy(films.id);
  const byTitle = new Map<string, CandidateRow[]>();
  for (const r of rows) byTitle.set(r.title, [...(byTitle.get(r.title) ?? []), r]);
  return byTitle;
}

async function loadOwners(tmdbIds: number[]): Promise<Map<number, { id: string; title: string }>> {
  if (tmdbIds.length === 0) return new Map();
  const rows = await db
    .select({ id: films.id, title: films.title, tmdbId: films.tmdbId })
    .from(films)
    .where(inArray(films.tmdbId, tmdbIds));
  return new Map(rows.map((r) => [r.tmdbId as number, { id: r.id, title: r.title }]));
}

async function main() {
  const execute = process.argv.includes("--execute");
  const file = process.argv.find((a) => a.startsWith("--file="))?.slice("--file=".length);
  if (!file) throw new Error("Pass --file=<mapping.json>");
  const input = JSON.parse(readFileSync(file, "utf8")) as {
    match?: Record<string, number>;
    reclassify?: Record<string, string>;
  };
  const mapping = input.match ?? {};
  const reclassify = input.reclassify ?? {};
  for (const [title, type] of Object.entries(reclassify)) {
    if (!CONTENT_TYPES.has(type)) throw new Error(`Invalid content type "${type}" for "${title}"`);
  }

  console.log(`[apply-manual-tmdb] ${execute ? "EXECUTE" : "DRY RUN"} | ${Object.keys(mapping).length} matches, ${Object.keys(reclassify).length} reclassifications`);

  const learnings = resolve(process.cwd(), ".claude/data-check-learnings.json");
  if (!existsSync(learnings)) {
    const msg = `${learnings} is missing: the TMDB blocklist and learned cleaner rules would be silently empty.`;
    if (execute) throw new Error(`${msg} Run from the main checkout or symlink the file.`);
    console.warn(`WARNING: ${msg}`);
  }

  const rowsByTitle = await loadCandidateRows(Object.keys(mapping));
  const owners = await loadOwners([...new Set(Object.values(mapping))]);
  const plan = planManualMatches({ rowsByTitle, mapping, owners, isBlocked: isBlockedTmdbId });

  // Confirm every id exists on TMDB before writing, and resolve its title and year.
  const client = getTMDBClient();
  const tmdb = new Map<number, { title: string; year: number | null }>();
  for (const id of new Set(plan.filter((p) => p.kind !== "skip").map((p) => p.tmdbId))) {
    try {
      const d = await client.getFilmDetails(id);
      tmdb.set(id, { title: d.title, year: d.release_date ? Number(d.release_date.slice(0, 4)) : null });
    } catch (err) {
      console.warn(`  TMDB lookup failed for ${id}: ${(err as Error).message}`);
    }
  }
  const final = plan.map((p): PlannedAction =>
    p.kind !== "skip" && !tmdb.has(p.tmdbId)
      ? { kind: "skip", title: p.row.title, tmdbId: p.tmdbId, reason: "tmdb lookup failed" }
      : p,
  );

  const updates = final.filter((p) => p.kind === "update");
  const merges = final.filter((p) => p.kind === "merge");
  const skips = final.filter((p) => p.kind === "skip");
  const count = (xs: PlannedAction[]) => xs.reduce((a, p) => a + (p.kind === "skip" ? 0 : p.row.screenings), 0);

  console.log(`\nUPDATE ${updates.length} rows (${count(updates)} upcoming screenings)`);
  for (const p of updates) {
    const t = tmdb.get(p.tmdbId)!;
    const title = chooseTitle(p.row.title, t.title, normalizeTitle);
    console.log(`  ${String(p.row.screenings).padStart(4)}  "${p.row.title}" -> ${p.tmdbId} "${t.title}" (${t.year ?? "?"})${title !== p.row.title ? `  [retitle "${title}"]` : ""}`);
  }
  const keyChanges = merges.filter((p) => p.kind === "merge" && normalizeTitle(p.row.title) !== normalizeTitle(p.targetTitle));
  console.log(`\nMERGE ${merges.length} rows (${count(merges)} upcoming screenings; ${keyChanges.length} change the cache key)`);
  for (const p of merges) {
    if (p.kind !== "merge") continue;
    const flag = keyChanges.includes(p) ? "  [key changes]" : "";
    console.log(`  ${String(p.row.screenings).padStart(4)}  "${p.row.title}" -> film ${p.targetFilmId.slice(0, 8)} "${p.targetTitle}" (tmdb ${p.tmdbId})${flag}`);
  }
  console.log(`\nSKIP ${skips.length}`);
  for (const p of skips) if (p.kind === "skip") console.log(`  "${p.title}" (${p.tmdbId}): ${p.reason}`);

  const reclassRows = Object.keys(reclassify).length
    ? await db
        .select({ id: films.id, title: films.title })
        .from(films)
        .where(
          and(
            isNull(films.tmdbId),
            eq(films.contentType, "film"),
            inArray(films.title, Object.keys(reclassify)),
            sql`EXISTS (SELECT 1 FROM screenings s WHERE s.film_id = ${films.id} AND s.datetime >= now())`,
          ),
        )
    : [];
  console.log(`\nRECLASSIFY ${reclassRows.length} rows`);
  for (const r of reclassRows) console.log(`  "${r.title}" -> ${reclassify[r.title]}`);
  const reclassFound = new Set(reclassRows.map((r) => r.title));
  for (const title of Object.keys(reclassify))
    if (!reclassFound.has(title)) console.log(`  SKIP "${title}": no unmatched film row with upcoming screenings has this exact title`);

  if (!execute) {
    console.log("\n[DRY RUN] No changes made. Re-run with --execute to apply.");
    return;
  }

  let ok = 0;
  let failed = 0;
  const failedKeepers = new Set<string>();
  for (const p of updates) {
    if (p.kind !== "update") continue;
    const t = tmdb.get(p.tmdbId)!;
    try {
      await executeUpdate({
        film: { id: p.row.id, title: p.row.title, year: p.row.year, directors: p.row.directors },
        cleanedTitle: p.row.title,
        tmdbId: p.tmdbId,
        tmdbTitle: t.title,
        tmdbYear: t.year ?? 0,
        confidence: 1,
        title: chooseTitle(p.row.title, t.title, normalizeTitle),
        strategy: STRATEGY,
      });
      ok++;
    } catch (err) {
      failed++;
      failedKeepers.add(p.row.id);
      console.error(`  UPDATE failed "${p.row.title}" -> ${p.tmdbId}: ${(err as Error).message}`);
    }
  }
  const { kept: safeMerges, dropped } = withoutMergesIntoFailedKeepers(merges, failedKeepers);
  for (const p of dropped)
    if (p.kind === "merge") console.error(`  MERGE skipped "${p.row.title}": its keeper ${p.targetFilmId.slice(0, 8)} failed to update`);
  for (const p of safeMerges) {
    if (p.kind !== "merge") continue;
    try {
      await executeMerge({
        film: { id: p.row.id, title: p.row.title, year: p.row.year, directors: p.row.directors },
        cleanedTitle: p.row.title,
        tmdbId: p.tmdbId,
        targetFilmId: p.targetFilmId,
        targetTitle: p.targetTitle,
        screeningCount: p.row.screenings,
      });
      ok++;
    } catch (err) {
      failed++;
      console.error(`  MERGE failed "${p.row.title}" -> ${p.targetFilmId}: ${(err as Error).message}`);
    }
  }
  for (const r of reclassRows) {
    await db
      .update(films)
      .set({ contentType: reclassify[r.title] as "film" | "concert" | "live_broadcast" | "event", updatedAt: new Date() })
      .where(eq(films.id, r.id));
  }
  console.log(`\n[EXECUTE] ${ok} match actions applied, ${failed} failed, ${dropped.length} merges skipped, ${reclassRows.length} rows reclassified.`);
}

const isDirectRun =
  process.argv[1]?.endsWith("apply-manual-tmdb-matches.ts") ||
  process.argv[1]?.endsWith("apply-manual-tmdb-matches.js");

if (isDirectRun) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}
