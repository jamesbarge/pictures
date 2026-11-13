/**
 * Enrichment gaps — the input for the Claude Code review step of /scrape.
 *
 * Read-only against the database. Writes tmp/enrichment-gaps.json with:
 *   - coverage: screening-weighted % of upcoming FILM screenings whose film has
 *     tmdbId / poster / year / genres / directors / Letterboxd rating, plus a
 *     count of films whose isRepertory flag disagrees with their year;
 *   - problems: content_type='film' rows with upcoming screenings that are
 *     unmatched, posterless or yearless (misclassified stage shows, quizzes
 *     etc. are still 'film' and so appear here), each with
 *     its venues, screening count, a booking URL, a non-film pattern hint and,
 *     for unmatched rows, the top 3 TMDB search candidates.
 *
 * TMDB lookups are deterministic API calls (allowed); the judgement — which
 * candidate is right, what is really a non-film — is made by Claude Code in the
 * /scrape session, which writes tmp/enrichment-decisions.json for
 * scripts/apply-manual-tmdb-matches.ts.
 *
 * Usage:
 *   npm run enrich:gaps                 # default: TMDB candidates for up to 150 films
 *   npm run enrich:gaps -- --no-tmdb    # coverage + problem list only
 *   npm run enrich:gaps -- --limit=50
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sql } from "drizzle-orm";
import { db, withDbTimeout } from "@/db";
import { getTMDBClient } from "@/lib/tmdb";
import { NON_FILM_PATTERNS } from "@/lib/title-extraction/patterns";

export const GAPS_FILE = resolve(process.cwd(), "tmp/enrichment-gaps.json");

export interface Coverage {
  upcomingFilmScreenings: number;
  pct: { tmdb: number; poster: number; year: number; genres: number; directors: number; letterboxd: number };
  /** Films with upcoming screenings, year older than 2 years, but isRepertory=false. */
  repertoryMismatchFilms: number;
}

export interface GapCandidate {
  tmdbId: number;
  title: string;
  originalTitle?: string;
  releaseDate?: string;
  popularity?: number;
  overview?: string;
}

export interface GapFilm {
  filmId: string;
  title: string;
  contentType: string;
  year: number | null;
  directors: string[];
  tmdbId: number | null;
  missing: Array<"tmdb" | "poster" | "year">;
  screenings: number;
  firstScreening: string;
  cinemas: string[];
  bookingUrl: string | null;
  nonFilmHint: boolean;
  candidates?: GapCandidate[];
}

const pct = (n: number, d: number) => (d === 0 ? 100 : Math.round((1000 * n) / d) / 10);

export async function computeCoverage(): Promise<Coverage> {
  const [row] = (await db.execute(sql`
    select count(*)::int as total,
      count(*) filter (where f.tmdb_id is not null)::int as tmdb,
      count(*) filter (where f.poster_url is not null and f.poster_url <> '')::int as poster,
      count(*) filter (where f.year is not null)::int as year,
      count(*) filter (where coalesce(array_length(f.genres, 1), 0) > 0)::int as genres,
      count(*) filter (where coalesce(array_length(f.directors, 1), 0) > 0)::int as directors,
      count(*) filter (where f.letterboxd_rating is not null)::int as letterboxd
    from screenings s join films f on f.id = s.film_id
    where s.datetime >= now() and f.content_type = 'film'
  `)) as unknown as Array<Record<string, number>>;
  const [mismatch] = (await db.execute(sql`
    select count(distinct f.id)::int as n
    from films f join screenings s on s.film_id = f.id
    where s.datetime >= now() and f.content_type = 'film'
      and f.year is not null
      and f.year < extract(year from now())::int - 2
      and f.is_repertory = false
  `)) as unknown as Array<{ n: number }>;
  const t = row.total;
  return {
    upcomingFilmScreenings: t,
    pct: {
      tmdb: pct(row.tmdb, t),
      poster: pct(row.poster, t),
      year: pct(row.year, t),
      genres: pct(row.genres, t),
      directors: pct(row.directors, t),
      letterboxd: pct(row.letterboxd, t),
    },
    repertoryMismatchFilms: mismatch.n,
  };
}

async function loadProblemFilms(): Promise<GapFilm[]> {
  const rows = (await db.execute(sql`
    select f.id, f.title, f.content_type, f.year, f.directors, f.tmdb_id,
      (f.poster_url is null or f.poster_url = '') as no_poster,
      count(s.id)::int as screenings,
      to_char(min(s.datetime) at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI') as first_screening,
      array_agg(distinct s.cinema_id) as cinemas,
      (array_agg(s.booking_url order by s.datetime))[1] as booking_url
    from films f join screenings s on s.film_id = f.id
    where s.datetime >= now()
      -- Rows already classified as event/live_broadcast/concert legitimately
      -- have no TMDB match; only "film" rows (including misclassified ones)
      -- need review.
      and f.content_type = 'film'
      and (f.tmdb_id is null or f.poster_url is null or f.poster_url = '' or f.year is null)
    group by f.id
    order by count(s.id) desc, f.title
  `)) as unknown as Array<Record<string, unknown>>;

  return rows.map((r) => {
    const title = String(r.title);
    const missing: GapFilm["missing"] = [];
    if (r.tmdb_id == null) missing.push("tmdb");
    if (r.no_poster) missing.push("poster");
    if (r.year == null) missing.push("year");
    return {
      filmId: String(r.id),
      title,
      contentType: String(r.content_type),
      year: (r.year as number | null) ?? null,
      directors: (r.directors as string[] | null) ?? [],
      tmdbId: (r.tmdb_id as number | null) ?? null,
      missing,
      screenings: Number(r.screenings),
      firstScreening: String(r.first_screening),
      cinemas: (r.cinemas as string[]) ?? [],
      bookingUrl: (r.booking_url as string | null) ?? null,
      nonFilmHint: NON_FILM_PATTERNS.some((rx) => rx.test(title)),
    };
  });
}

async function addCandidates(problems: GapFilm[], limit: number): Promise<number> {
  const tmdb = getTMDBClient();
  const targets = problems
    .filter((p) => p.tmdbId == null && p.contentType === "film" && !p.nonFilmHint)
    .slice(0, limit);
  for (const film of targets) {
    try {
      const res = await tmdb.searchFilms(film.title, film.year ?? undefined);
      film.candidates = res.results.slice(0, 3).map((c) => ({
        tmdbId: c.id,
        title: c.title,
        originalTitle: c.original_title !== c.title ? c.original_title : undefined,
        releaseDate: c.release_date || undefined,
        popularity: c.popularity,
        overview: c.overview ? c.overview.slice(0, 160) : undefined,
      }));
    } catch (err) {
      console.warn(`[enrichment-gaps] TMDB search failed for "${film.title}": ${err instanceof Error ? err.message : err}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return targets.length;
}

export async function writeEnrichmentGaps(opts: { tmdb: boolean; limit: number }): Promise<{ coverage: Coverage; problems: number }> {
  // Client-side timeouts: this runs as the pipeline's last phase, and a wedged
  // pooler connection must fail the phase rather than hang the run.
  const coverage = await withDbTimeout(computeCoverage(), 60_000, "enrichment coverage");
  const problems = await withDbTimeout(loadProblemFilms(), 60_000, "enrichment problems");
  const searched = opts.tmdb ? await addCandidates(problems, opts.limit) : 0;
  mkdirSync(dirname(GAPS_FILE), { recursive: true });
  writeFileSync(
    GAPS_FILE,
    JSON.stringify({ generatedAt: new Date().toISOString(), coverage, tmdbSearched: searched, problems }, null, 2),
  );
  return { coverage, problems: problems.length };
}

export function formatCoverage(c: Coverage): string {
  const p = c.pct;
  return (
    `Coverage of ${c.upcomingFilmScreenings} upcoming film screenings: ` +
    `TMDB ${p.tmdb}% · poster ${p.poster}% · year ${p.year}% · genres ${p.genres}% · ` +
    `directors ${p.directors}% · Letterboxd ${p.letterboxd}% · ` +
    `${c.repertoryMismatchFilms} repertory-flag mismatch(es)`
  );
}

const isMain =
  process.argv[1]?.endsWith("enrichment-gaps.ts") || process.argv[1]?.endsWith("enrichment-gaps.js");

if (isMain) {
  const tmdbOn = !process.argv.includes("--no-tmdb");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 150;
  writeEnrichmentGaps({ tmdb: tmdbOn, limit })
    .then(({ coverage, problems }) => {
      console.log(formatCoverage(coverage));
      console.log(`${problems} problem film(s) written to ${GAPS_FILE}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[enrichment-gaps] failed:", err);
      process.exit(1);
    });
}
