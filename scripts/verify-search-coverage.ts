/**
 * Verification for feat/search-coverage-relevance.
 *
 * Proves two things against the live DB (READ-ONLY):
 *   1. COVERAGE: films whose earliest upcoming screening is >30 days out were
 *      invisible to the old search (hard `< now()+30d` cap) but are found now.
 *   2. RELEVANCE: an exact title query ranks that film #1 via the new boost.
 *
 * Run: npx tsx scripts/verify-search-coverage.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";

// Mirrors the route's films CTE. `cap` toggles the old 30-day upper bound;
// `boost` toggles the new exact/prefix title boost.
function filmsQuery(q: string, { cap, boost }: { cap: boolean; boost: boolean }) {
  const capClause = cap ? sql`AND ns.next_dt < now() + interval '30 days'` : sql``;
  const boostExpr = boost
    ? sql`+ 0.20 * (lower(f.title) = lower(p.q))::int + 0.08 * (f.title ILIKE p.q || '%')::int`
    : sql``;
  return db.execute(sql`
    WITH params AS (
      SELECT ${q}::text AS q, websearch_to_tsquery('pictures', ${q}) AS tsq
    ),
    lexical AS (
      SELECT f.id, row_number() OVER (ORDER BY ts_rank_cd(f.search_tsv, p.tsq) DESC) AS r
      FROM films f, params p WHERE f.search_tsv @@ p.tsq
      ORDER BY ts_rank_cd(f.search_tsv, p.tsq) DESC LIMIT 200
    ),
    trgm AS (
      SELECT f.id, row_number() OVER (ORDER BY word_similarity(p.q, f.search_text) DESC) AS r
      FROM films f, params p WHERE f.search_text % p.q
      ORDER BY word_similarity(p.q, f.search_text) DESC LIMIT 200
    ),
    fused AS (
      SELECT id, sum(rrf) AS rrf_score FROM (
        SELECT id, 1.0/(60 + r) AS rrf FROM lexical
        UNION ALL SELECT id, 1.0/(60 + r) AS rrf FROM trgm
      ) u GROUP BY id
    )
    SELECT f.title, f.year, ns.next_dt AS next_screening_at,
      (fused.rrf_score ${boostExpr}
        + 0.05 * coalesce(exp(-extract(epoch FROM (ns.next_dt - now()))/604800.0), 0)
        + 0.02 * ln(1 + coalesce(f.tmdb_popularity, 0))) AS score
    FROM fused JOIN films f ON f.id = fused.id CROSS JOIN params p
    LEFT JOIN LATERAL (
      SELECT min(s.datetime) AS next_dt FROM screenings s WHERE s.film_id = f.id AND s.datetime > now()
    ) ns ON true
    WHERE ns.next_dt IS NOT NULL ${capClause}
    ORDER BY score DESC LIMIT 12
  `);
}

function rows<T>(r: unknown): T[] {
  return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);
}
type Row = { title: string; year: number | null; next_screening_at: string; score: number };

async function main() {
  // 1. Census: how many distinct films are only screening >30 days out?
  const censusRes = await db.execute(sql`
    WITH next AS (
      SELECT f.id, f.title, min(s.datetime) AS next_dt
      FROM films f JOIN screenings s ON s.film_id = f.id
      WHERE s.datetime > now()
      GROUP BY f.id, f.title
    )
    SELECT count(*) FILTER (WHERE next_dt >= now() + interval '30 days') AS beyond_30d,
           count(*) AS total_upcoming
    FROM next
  `);
  const census = rows<{ beyond_30d: number; total_upcoming: number }>(censusRes)[0];
  console.log(`\n📊 Upcoming films: ${census.total_upcoming} total; ` +
    `${census.beyond_30d} have their EARLIEST screening >30 days out (invisible to old search).`);

  // Find a concrete far-out film to use as the search probe.
  const farRes = await db.execute(sql`
    WITH next AS (
      SELECT f.id, f.title, f.year, min(s.datetime) AS next_dt
      FROM films f JOIN screenings s ON s.film_id = f.id
      WHERE s.datetime > now() GROUP BY f.id, f.title, f.year
    )
    SELECT title, year, next_dt FROM next
    WHERE next_dt >= now() + interval '30 days'
    ORDER BY next_dt ASC LIMIT 8
  `);
  const farFilms = rows<{ title: string; year: number | null; next_dt: string }>(farRes);
  console.log(`\n🔭 Sample far-out films (earliest screening >30d):`);
  farFilms.forEach((f) => console.log(`   • ${f.title} (${f.year ?? "?"}) — ${new Date(f.next_dt).toDateString()}`));

  // 2. Coverage proof: search a far-out film's title, old vs new.
  for (const probe of farFilms.slice(0, 3)) {
    const newR = rows<Row>(await filmsQuery(probe.title, { cap: false, boost: true }));
    const oldR = rows<Row>(await filmsQuery(probe.title, { cap: true, boost: false }));
    const inNew = newR.some((r) => r.title.toLowerCase() === probe.title.toLowerCase());
    const inOld = oldR.some((r) => r.title.toLowerCase() === probe.title.toLowerCase());
    const rank = newR.findIndex((r) => r.title.toLowerCase() === probe.title.toLowerCase()) + 1;
    console.log(`\n🔎 query="${probe.title}"  NEW: found=${inNew} (rank ${rank || "-"}, ${newR.length} results) | OLD: found=${inOld} (${oldR.length} results)`);
    if (inNew && !inOld) console.log(`   ✅ COVERAGE WIN: now findable, was hidden by the 30-day cap.`);
    if (inNew && rank === 1) console.log(`   ✅ RELEVANCE: exact-title query ranks it #1.`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
