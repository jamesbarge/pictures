/**
 * Cleanup duplicate films in the database
 *
 * Two duplicate detection strategies:
 * 1. TMDB ID: Films sharing the same tmdb_id are definitionally identical
 * 2. Trigram similarity: Fuzzy title matching via pg_trgm for near-duplicates
 *
 * For each duplicate cluster, picks the "best" film record (has TMDB ID, poster,
 * most complete metadata) and reassigns all screenings, season_films, and
 * user_film_statuses to the canonical record.
 *
 * Usage:
 *   npx tsx scripts/cleanup-duplicate-films.ts              # dry run
 *   npx tsx scripts/cleanup-duplicate-films.ts --execute     # actually merge & delete
 */

import { db } from "../src/db";
import { films, screenings } from "../src/db/schema";
import { sql, inArray } from "drizzle-orm";
import { loadThresholds } from "../src/lib/data-quality/load-thresholds";

// -- Types -------------------------------------------------------------------

interface FilmRecord {
  id: string;
  title: string;
  year: number | null;
  tmdbId: number | null;
  posterUrl: string | null;
  runtime: number | null;
  synopsis: string | null;
  directors: string[];
  matchConfidence: number | null;
  screeningCount: number;
}

interface DuplicateCluster {
  reason: "tmdb_id" | "trigram_similarity";
  primary: FilmRecord;
  duplicates: FilmRecord[];
  similarity?: number;
}

// -- Duplicate Finding -------------------------------------------------------

/**
 * Find films that share the same TMDB ID (strongest dedup signal)
 */
async function findTmdbDuplicates(): Promise<DuplicateCluster[]> {
  const rows = await db.execute(sql`
    SELECT
      f.id,
      f.title,
      f.year,
      f.tmdb_id,
      f.poster_url,
      f.runtime,
      f.synopsis,
      f.directors,
      f.match_confidence,
      (SELECT count(*) FROM screenings s WHERE s.film_id = f.id) as screening_count
    FROM films f
    WHERE f.tmdb_id IS NOT NULL
      AND f.tmdb_id IN (
        SELECT tmdb_id FROM films
        WHERE tmdb_id IS NOT NULL
        GROUP BY tmdb_id
        HAVING count(*) > 1
      )
    ORDER BY f.tmdb_id, f.id
  `);

  const filmsByTmdb = new Map<number, FilmRecord[]>();
  for (const row of rows as unknown as Array<Record<string, unknown>>) {
    const tmdbId = row.tmdb_id as number;
    const film: FilmRecord = {
      id: row.id as string,
      title: row.title as string,
      year: row.year as number | null,
      tmdbId,
      posterUrl: row.poster_url as string | null,
      runtime: row.runtime as number | null,
      synopsis: row.synopsis as string | null,
      directors: (row.directors as string[]) || [],
      matchConfidence: row.match_confidence as number | null,
      screeningCount: Number(row.screening_count),
    };
    if (!filmsByTmdb.has(tmdbId)) filmsByTmdb.set(tmdbId, []);
    filmsByTmdb.get(tmdbId)!.push(film);
  }

  const clusters: DuplicateCluster[] = [];
  for (const [, group] of filmsByTmdb) {
    const sorted = [...group].sort((a, b) => scorePrimary(b) - scorePrimary(a));
    clusters.push({
      reason: "tmdb_id",
      primary: sorted[0],
      duplicates: sorted.slice(1),
    });
  }

  return clusters;
}

/**
 * Find films with similar titles using pg_trgm trigram similarity.
 * Only considers films NOT already caught by TMDB dedup.
 */
async function findTrigramDuplicates(
  excludeIds: Set<string>,
  threshold = loadThresholds().duplicateDetection.trigramSimilarityThreshold
): Promise<DuplicateCluster[]> {
  // Get all films with upcoming screenings (or all films if needed)
  const allFilms = await db.execute(sql`
    SELECT
      f.id,
      f.title,
      f.year,
      f.tmdb_id,
      f.poster_url,
      f.runtime,
      f.synopsis,
      f.directors,
      f.match_confidence,
      (SELECT count(*) FROM screenings s WHERE s.film_id = f.id) as screening_count
    FROM films f
    ORDER BY f.title
  `);

  const filmList: FilmRecord[] = [];
  for (const row of allFilms as unknown as Array<Record<string, unknown>>) {
    const id = row.id as string;
    if (excludeIds.has(id)) continue;
    filmList.push({
      id,
      title: row.title as string,
      year: row.year as number | null,
      tmdbId: row.tmdb_id as number | null,
      posterUrl: row.poster_url as string | null,
      runtime: row.runtime as number | null,
      synopsis: row.synopsis as string | null,
      directors: (row.directors as string[]) || [],
      matchConfidence: row.match_confidence as number | null,
      screeningCount: Number(row.screening_count),
    });
  }

  // Use SQL to find pairs above similarity threshold
  const pairs = await db.execute(sql`
    SELECT
      f1.id as id1,
      f2.id as id2,
      similarity(f1.title, f2.title) as sim
    FROM films f1
    JOIN films f2 ON f1.id < f2.id
    WHERE similarity(f1.title, f2.title) >= ${threshold}
      AND (f1.year = f2.year OR f1.year IS NULL OR f2.year IS NULL)
    ORDER BY sim DESC
    LIMIT 200
  `);

  // Build clusters using union-find to group transitively similar films
  const parent = new Map<string, string>();
  const filmMap = new Map<string, FilmRecord>();
  for (const f of filmList) filmMap.set(f.id, f);

  function find(id: string): string {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)!));
    return parent.get(id)!;
  }

  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const pairSims = new Map<string, number>();
  for (const row of pairs as unknown as Array<Record<string, unknown>>) {
    const id1 = row.id1 as string;
    const id2 = row.id2 as string;
    const sim = row.sim as number;

    // Skip films already handled by TMDB dedup
    if (excludeIds.has(id1) || excludeIds.has(id2)) continue;

    union(id1, id2);
    const key = [id1, id2].sort().join(":");
    pairSims.set(key, sim);
  }

  // Group by cluster root
  const groups = new Map<string, Set<string>>();
  for (const [id] of parent) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, new Set());
    groups.get(root)!.add(id);
  }

  const clusters: DuplicateCluster[] = [];
  for (const [, memberIds] of groups) {
    if (memberIds.size < 2) continue;

    const members: FilmRecord[] = [];
    for (const id of memberIds) {
      const film = filmMap.get(id);
      if (film) members.push(film);
    }

    if (members.length < 2) continue;

    const sorted = [...members].sort((a, b) => scorePrimary(b) - scorePrimary(a));
    clusters.push({
      reason: "trigram_similarity",
      primary: sorted[0],
      duplicates: sorted.slice(1),
    });
  }

  return clusters;
}

// -- Primary Selection -------------------------------------------------------

/**
 * Score a film for primary selection. Higher = better candidate to keep.
 * Criteria (in priority order):
 * 1. Has TMDB ID (+100)
 * 2. Has poster (+50)
 * 3. Has synopsis (+20)
 * 4. Has runtime (+10)
 * 5. Has directors (+10)
 * 6. Higher match confidence (+confidence*10)
 * 7. More screenings (+screeningCount)
 */
function scorePrimary(film: FilmRecord): number {
  let score = 0;
  if (film.tmdbId) score += 100;
  if (film.posterUrl) score += 50;
  if (film.synopsis) score += 20;
  if (film.runtime) score += 10;
  if (film.directors.length > 0) score += 10;
  if (film.matchConfidence) score += film.matchConfidence * 10;
  score += film.screeningCount;
  return score;
}

// -- Merge Execution ---------------------------------------------------------

/**
 * Merge duplicate films into their primary, reassigning all references.
 * Handles: screenings, season_films, user_film_statuses
 */
async function mergeDuplicates(
  clusters: DuplicateCluster[],
  dryRun: boolean
): Promise<{ mergedScreenings: number; deletedFilms: number }> {
  let mergedScreenings = 0;
  let deletedFilms = 0;

  for (const cluster of clusters) {
    const primary = cluster.primary;
    const dupeIds = cluster.duplicates.map((d) => d.id);

    if (dupeIds.length === 0) continue;

    const reasonTag = cluster.reason === "tmdb_id" ? "[TMDB]" : "[TRIGRAM]";

    console.log(`\n${reasonTag} Cluster: "${primary.title}" (${primary.year ?? "no year"})`);
    console.log(`  Primary: [${primary.id}] "${primary.title}" — TMDB:${primary.tmdbId ?? "none"}, poster:${primary.posterUrl ? "yes" : "no"}, screenings:${primary.screeningCount}`);

    for (const dup of cluster.duplicates) {
      console.log(`  Duplicate: [${dup.id}] "${dup.title}" — TMDB:${dup.tmdbId ?? "none"}, poster:${dup.posterUrl ? "yes" : "no"}, screenings:${dup.screeningCount}`);
    }

    if (dryRun) {
      deletedFilms += dupeIds.length;
      mergedScreenings += cluster.duplicates.reduce((sum, d) => sum + d.screeningCount, 0);
      continue;
    }

    // Execute in a transaction
    await db.transaction(async (tx) => {
      // 1. Move screenings
      const movedScreenings = await tx
        .update(screenings)
        .set({ filmId: primary.id })
        .where(inArray(screenings.filmId, dupeIds));
      mergedScreenings += (movedScreenings as unknown as { rowCount?: number }).rowCount ?? 0;

      // 2. Move season_films (handle potential unique constraint conflicts)
      const dupeIdsSql = sql.join(dupeIds.map(id => sql`${id}`), sql`, `);
      await tx.execute(sql`
        UPDATE season_films
        SET film_id = ${primary.id}
        WHERE film_id IN (${dupeIdsSql})
          AND NOT EXISTS (
            SELECT 1 FROM season_films sf2
            WHERE sf2.season_id = season_films.season_id
              AND sf2.film_id = ${primary.id}
          )
      `);
      // Delete any remaining season_films that would conflict
      await tx.execute(sql`
        DELETE FROM season_films WHERE film_id IN (${dupeIdsSql})
      `);

      // 3. Move user_film_statuses (handle unique constraint on user_id + film_id)
      await tx.execute(sql`
        UPDATE user_film_statuses
        SET film_id = ${primary.id}
        WHERE film_id IN (${dupeIdsSql})
          AND NOT EXISTS (
            SELECT 1 FROM user_film_statuses ufs2
            WHERE ufs2.user_id = user_film_statuses.user_id
              AND ufs2.film_id = ${primary.id}
          )
      `);
      // Delete any remaining that would conflict (user already has a status for primary film)
      await tx.execute(sql`
        DELETE FROM user_film_statuses WHERE film_id IN (${dupeIdsSql})
      `);

      // 4. Delete duplicate film records
      await tx.delete(films).where(inArray(films.id, dupeIds));
      deletedFilms += dupeIds.length;

      console.log(`  → Merged and deleted ${dupeIds.length} duplicate(s)`);
    });
  }

  return { mergedScreenings, deletedFilms };
}

// -- Main --------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");

  // Trigram false positives confirmed by manual review (2026-07-13 dry run):
  // similar-looking titles that are genuinely DIFFERENT films/events. These
  // ids are excluded from trigram clustering so they can never be merged.
  const NEVER_MERGE_FILM_IDS = new Set<string>([
    "87ca77f0-af66-4a39-b671-9b8e7488e8fd", // Some Like it Swing ≠ Some Like It Hot
    "c6fc2899-6430-469a-8507-c0d4ebb16033", // England vs Ghana ≠ England vs Argentina
    "c78e35bf-047a-4f66-b6de-3884e9c2e37f", // World Cup- England vs. Ghana
    "a85c4d75-52e3-4bf1-b0a9-17035386c920", // England vs Ghana (dup listing)
    "4c665354-a2c0-42a3-809f-847a46f20154", // 25th Anniversary Screening (generic)
    "06dc48c1-9659-4ef5-a70e-4b07a5235e66", // Anniversary Screening (generic)
    "8071134f-0d41-4f5b-a1ae-9d63372a319c", // Brief Encounter + Briefest Encounters (event)
    "f51191f8-9302-4c20-8004-fa9fd987cb27", // The Traveller ≠ The Time Traveller
    "32f8a4e6-81f8-4ace-a0c1-c25e2f1cf7eb", // Autumn Tale (Rohmer) ≠ An Autumn's Tale (HK)
    "bfee36b0-1347-45de-a029-c70ee86385c2", // Black & White ≠ Black Cat, White Cat
    "ab5e93ae-73b6-4e18-85b5-79acb88b38a5", // Baby Comptines 13/05 (dated session)
    "172945ed-c8c2-47ed-877e-33c45be5ec07", // Baby Comptines 01/07 (dated session)
    "4848fed9-08b2-4547-83df-5264a500422e", // Frankenstein's Bride ≠ Young Frankenstein
    "9bb80e8a-3211-480d-a6d2-2e162834b900", // Nickelfest Day One ≠ Day Two
    "8020a045-570f-4750-aea2-ba78d5792106", // My Foreign Land ≠ Foreign Lands
    "a8fb1286-1654-4a12-9425-9b9eb6784658", // Bob: Man of The Angels + Shorts
    "35a4904d-8215-4d96-a7bf-c9d5d3792fc6", // Man of the Angels ≠ Mother Joan of the Angels
    "e7132787-7844-450b-8683-28bf1a2dac89", // Member exclusive: The Misfits ≠ The Girls
    "4081080d-f527-4dc5-8ff9-d70d786b93b5", // Che - Part 2 ≠ Che: Part One
    "c355ace9-fdcc-4af1-a553-17430472b744", // The Silence ≠ The Eternal Silence
    "dade4c93-bd57-4d0b-abdd-c1d369dc4a65", // Members' Screening: The Invite ≠ The Odyssey
    "c024a748-cc27-4d34-b5c0-2873c8867642", // Shrek- Birthday Season ≠ Crash- Birthday Season
    "3069f0c0-bc0b-4354-9d47-004ab6c1a130", // Short Film Programme (generic container)
  ]);

  if (dryRun) {
    console.log("Running in DRY RUN mode (use --execute to actually merge & delete)\n");
  } else {
    console.log("Running in EXECUTE mode — duplicates will be merged and deleted!\n");
  }

  // Step 1: Find TMDB-based duplicates (strongest signal)
  console.log("=== Finding TMDB ID duplicates ===");
  const tmdbClusters = await findTmdbDuplicates();
  console.log(`Found ${tmdbClusters.length} TMDB duplicate clusters`);

  // Collect all IDs already handled by TMDB dedup
  const tmdbHandledIds = new Set<string>();
  for (const cluster of tmdbClusters) {
    tmdbHandledIds.add(cluster.primary.id);
    for (const dup of cluster.duplicates) tmdbHandledIds.add(dup.id);
  }
  for (const id of NEVER_MERGE_FILM_IDS) tmdbHandledIds.add(id);

  // Step 2: Find trigram-based duplicates (excluding TMDB-handled)
  console.log("\n=== Finding trigram similarity duplicates ===");
  const trigramClusters = await findTrigramDuplicates(tmdbHandledIds);
  console.log(`Found ${trigramClusters.length} trigram duplicate clusters`);

  const allClusters = [...tmdbClusters, ...trigramClusters];

  if (allClusters.length === 0) {
    console.log("\nNo duplicates found!");
    return;
  }

  // Step 3: Merge
  const { mergedScreenings, deletedFilms } = await mergeDuplicates(allClusters, dryRun);

  console.log(`\n=== Summary ===`);
  console.log(`  Duplicate clusters: ${allClusters.length}`);
  console.log(`  Films to delete: ${deletedFilms}`);
  console.log(`  Screenings to merge: ${mergedScreenings}`);

  if (dryRun) {
    console.log("\n[DRY RUN] No changes made. Run with --execute to clean up duplicates.");
  } else {
    console.log(`\nCleanup complete! Deleted ${deletedFilms} duplicate films.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
