/**
 * 100-film spot check. Pulls the 100 films with the soonest upcoming
 * screenings (what users see first on the calendar) and verifies every
 * field. Compares against TMDB where a TMDB ID is set. Reports findings;
 * makes no mutations.
 *
 * Usage:
 *   npx tsx -r tsconfig-paths/register --env-file=.env.local scripts/_spot-check-100.ts
 */

import { db } from "@/db";
import { films } from "@/db/schema/films";
import { screenings } from "@/db/schema/screenings";
import { cinemas } from "@/db/schema/cinemas";
import { sql, eq, gte, and, inArray } from "drizzle-orm";
import { getTMDBClient } from "@/lib/tmdb";

interface FilmRow {
  id: string;
  title: string;
  year: number | null;
  runtime: number | null;
  tmdbId: number | null;
  posterUrl: string | null;
  synopsis: string | null;
  directors: unknown;
  cast: unknown;
  genres: unknown;
  letterboxdRating: number | null;
  isRepertory: boolean;
  nextScreening: Date;
  cinemaName: string;
}

interface Issue {
  filmId: string;
  title: string;
  field: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

const PROGRAMME_STRAND_PATTERNS = [
  /^DocHouse:\s/i,
  /^Funeral Parade presents/i,
  /^Film Club:/i,
  /^LOCO presents:/i,
  /^Funday[: ]/i,
  /^RIO FOREVER\s*[xX×]/i,
  /^Lost Reels[: ]/i,
  /^LAFS PRESENTS:/i,
  /^UK PREMIERE\s/i,
  /^LONDON PREMIERE\s/i,
  /^Crafty Movie Night\s/i,
  /^Journey Through Irish Cinema:/i,
  /^Film Society \d+/i,
  /\bp\d+,/, // "Funday Workshop: Arco p52,"
];

const NON_FILM_KEYWORDS = [
  "Q&A",
  "Q +A",
  "Workshop",
  "Discussion",
  "Talk",
  "Lecture",
  "Festival",
  "Society",
  "Writers Group",
];

function getStr(v: unknown, idx?: number): string | null {
  if (Array.isArray(v)) {
    if (idx !== undefined) return typeof v[idx] === "string" ? (v[idx] as string) : null;
    return v.length > 0 && typeof v[0] === "string" ? (v[0] as string) : null;
  }
  return null;
}

function arrayLen(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  return 0;
}

function isStringArray(v: unknown): boolean {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

async function main() {
  const t0 = Date.now();
  const now = new Date();

  // Pull the 100 films whose next upcoming screening is soonest.
  // This is exactly what a user sees when they open the calendar tonight.
  const rows = await db.execute(sql`
    WITH first_screenings AS (
      SELECT
        s.film_id,
        MIN(s.datetime) AS next_screening,
        (
          SELECT c.name FROM ${cinemas} c
          WHERE c.id = (
            SELECT s2.cinema_id FROM ${screenings} s2
            WHERE s2.film_id = s.film_id AND s2.datetime >= NOW()
            ORDER BY s2.datetime ASC LIMIT 1
          )
        ) AS cinema_name
      FROM ${screenings} s
      WHERE s.datetime >= NOW()
      GROUP BY s.film_id
    )
    SELECT
      f.id, f.title, f.year, f.runtime, f.tmdb_id AS "tmdbId",
      f.poster_url AS "posterUrl", f.synopsis,
      f.directors, f."cast", f.genres,
      f.letterboxd_rating AS "letterboxdRating",
      f.is_repertory AS "isRepertory",
      fs.next_screening AS "nextScreening",
      fs.cinema_name AS "cinemaName"
    FROM ${films} f
    INNER JOIN first_screenings fs ON fs.film_id = f.id
    ORDER BY fs.next_screening ASC
    LIMIT 100;
  `);

  const films100 = rows as unknown as FilmRow[];
  console.log(`Sampled ${films100.length} films (next-screening ASC). Checking…\n`);

  const issues: Issue[] = [];
  const filmsWithTmdb = films100.filter((f) => f.tmdbId !== null);

  // 1. Heuristic checks (no API calls)
  for (const f of films100) {
    // Title — programme-strand prefixes
    for (const pat of PROGRAMME_STRAND_PATTERNS) {
      if (pat.test(f.title)) {
        issues.push({
          filmId: f.id,
          title: f.title,
          field: "title",
          severity: "high",
          detail: `Programme-strand prefix detected (regex: ${pat.source})`,
        });
        break;
      }
    }
    // Title — all-caps that probably isn't intentional
    if (
      f.title.length > 10 &&
      f.title === f.title.toUpperCase() &&
      !/^\d|^[A-Z]\.|^[IVX]+$/.test(f.title)
    ) {
      issues.push({
        filmId: f.id,
        title: f.title,
        field: "title",
        severity: "medium",
        detail: "Stored in all-caps (likely scraper preserved cinema's display casing)",
      });
    }
    // Title — embedded HTML entities
    if (/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/i.test(f.title)) {
      issues.push({
        filmId: f.id,
        title: f.title,
        field: "title",
        severity: "high",
        detail: "Unescaped HTML entity in title",
      });
    }
    // Year — likely screening-year contamination
    if (f.year === 2026 && !f.tmdbId) {
      issues.push({
        filmId: f.id,
        title: f.title,
        field: "year",
        severity: "medium",
        detail: "Year is 2026 with no TMDB ID — likely the scraper picked up the screening date, not the film's release year",
      });
    }
    // Cast — string-encoded jsonb (the cycle-15 bug)
    if (f.cast !== null && typeof f.cast === "string") {
      issues.push({
        filmId: f.id,
        title: f.title,
        field: "cast",
        severity: "high",
        detail: "cast stored as JSON-encoded STRING instead of jsonb array",
      });
    }
    // Directors — same shape check
    if (f.directors !== null && typeof f.directors === "string") {
      issues.push({
        filmId: f.id,
        title: f.title,
        field: "directors",
        severity: "high",
        detail: "directors stored as JSON-encoded STRING instead of jsonb array",
      });
    }
    // Missing critical fields for a film with a TMDB ID (TMDB should have populated these)
    if (f.tmdbId) {
      if (!f.posterUrl) issues.push({ filmId: f.id, title: f.title, field: "posterUrl", severity: "medium", detail: "No poster despite having TMDB ID" });
      if (!f.synopsis || f.synopsis.length < 30) issues.push({ filmId: f.id, title: f.title, field: "synopsis", severity: "medium", detail: "Missing or too-short synopsis despite TMDB ID" });
      if (arrayLen(f.directors) === 0) issues.push({ filmId: f.id, title: f.title, field: "directors", severity: "medium", detail: "Empty directors despite TMDB ID" });
      if (arrayLen(f.genres) === 0) issues.push({ filmId: f.id, title: f.title, field: "genres", severity: "low", detail: "Empty genres despite TMDB ID" });
      if (!f.year) issues.push({ filmId: f.id, title: f.title, field: "year", severity: "medium", detail: "No year despite TMDB ID" });
      if (!f.runtime || f.runtime < 30) issues.push({ filmId: f.id, title: f.title, field: "runtime", severity: "low", detail: `Runtime suspicious (${f.runtime})` });
    }
    // Letterboxd rating range
    if (f.letterboxdRating !== null && (f.letterboxdRating < 0 || f.letterboxdRating > 5)) {
      issues.push({ filmId: f.id, title: f.title, field: "letterboxdRating", severity: "medium", detail: `Out of 0-5 range: ${f.letterboxdRating}` });
    }
    // Repertory flag heuristic
    const yearNum = typeof f.year === "number" ? f.year : null;
    if (yearNum !== null && yearNum < 2024 && !f.isRepertory) {
      issues.push({ filmId: f.id, title: f.title, field: "isRepertory", severity: "low", detail: `Film year ${yearNum} but is_repertory=false` });
    }
  }

  // 2. TMDB cross-check (only for films with tmdbId)
  console.log(`Fetching ${filmsWithTmdb.length} TMDB records to cross-check…`);
  const tmdb = getTMDBClient();
  let tmdbErrors = 0;
  for (const f of filmsWithTmdb) {
    try {
      const data = await tmdb.getFullFilmData(f.tmdbId!);
      const tmdbYear = data.details.release_date ? parseInt(data.details.release_date.slice(0, 4), 10) : null;
      const tmdbRuntime = data.details.runtime;
      const tmdbDirectorNames = data.directors;

      // Year mismatch
      if (f.year !== null && tmdbYear !== null && Math.abs(f.year - tmdbYear) >= 1) {
        issues.push({
          filmId: f.id,
          title: f.title,
          field: "year",
          severity: f.year === 2026 ? "high" : "medium",
          detail: `DB year=${f.year} vs TMDB year=${tmdbYear}`,
        });
      }
      // Runtime mismatch (TMDB is authoritative, off by 5+ min is suspicious)
      if (f.runtime !== null && tmdbRuntime && Math.abs(f.runtime - tmdbRuntime) >= 5) {
        issues.push({
          filmId: f.id,
          title: f.title,
          field: "runtime",
          severity: "low",
          detail: `DB runtime=${f.runtime} vs TMDB=${tmdbRuntime}`,
        });
      }
      // Directors mismatch — if both populated and lists disagree
      if (Array.isArray(f.directors) && f.directors.length > 0 && tmdbDirectorNames.length > 0) {
        const dbDirs = new Set(
          (f.directors as string[]).map((d) => d.toLowerCase().trim()),
        );
        const tmdbDirs = new Set(tmdbDirectorNames.map((d) => d.toLowerCase().trim()));
        const overlap = [...dbDirs].some((d) => tmdbDirs.has(d));
        if (!overlap) {
          issues.push({
            filmId: f.id,
            title: f.title,
            field: "directors",
            severity: "high",
            detail: `DB directors=[${[...dbDirs].join(", ")}] do not overlap with TMDB=[${tmdbDirectorNames.join(", ")}]`,
          });
        }
      }
      // Title sanity — if DB title is wildly different from TMDB, flag (but allow prefix matches)
      const dbTitle = f.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      const tmdbTitle = (data.details.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (dbTitle && tmdbTitle && !dbTitle.includes(tmdbTitle) && !tmdbTitle.includes(dbTitle)) {
        const origDbTitle = (data.details.original_title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!origDbTitle || !dbTitle.includes(origDbTitle)) {
          issues.push({
            filmId: f.id,
            title: f.title,
            field: "title",
            severity: "medium",
            detail: `DB title "${f.title}" diverges from TMDB title "${data.details.title}"`,
          });
        }
      }
    } catch (err) {
      tmdbErrors++;
      issues.push({
        filmId: f.id,
        title: f.title,
        field: "tmdbId",
        severity: "low",
        detail: `TMDB fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 3. Time-correctness check: any of the 100 films' screenings in 00:00-09:59 London window?
  const filmIds = films100.map((f) => f.id);
  const suspiciousTimes = await db
    .select({
      filmId: screenings.filmId,
      datetime: screenings.datetime,
      londonHour: sql<number>`EXTRACT(HOUR FROM ${screenings.datetime} AT TIME ZONE 'Europe/London')::int`,
      cinemaId: screenings.cinemaId,
    })
    .from(screenings)
    .where(
      and(
        gte(screenings.datetime, now),
        inArray(screenings.filmId, filmIds),
        sql`EXTRACT(HOUR FROM ${screenings.datetime} AT TIME ZONE 'Europe/London') < 10`,
      ),
    );
  const titleById = new Map(films100.map((f) => [f.id, f.title]));
  for (const r of suspiciousTimes) {
    issues.push({
      filmId: r.filmId,
      title: titleById.get(r.filmId) ?? "?",
      field: "screening.datetime",
      severity: "high",
      detail: `Screening at ${r.datetime.toISOString()} → ${String(r.londonHour).padStart(2, "0")}:xx London (${r.cinemaId})`,
    });
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // 4. Report
  const bySev = { high: 0, medium: 0, low: 0 };
  const byField = new Map<string, number>();
  for (const i of issues) {
    bySev[i.severity]++;
    byField.set(i.field, (byField.get(i.field) ?? 0) + 1);
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log(`100-film spot-check complete in ${elapsed}s. ${tmdbErrors} TMDB fetch errors.`);
  console.log("=".repeat(78));
  console.log(`\nIssues: ${issues.length} total — HIGH=${bySev.high}, MED=${bySev.medium}, LOW=${bySev.low}`);
  console.log(`\nBy field:`);
  for (const [field, n] of [...byField.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${field.padEnd(28)} ${n}`);
  }

  console.log(`\n${"-".repeat(78)}\nHIGH severity (${bySev.high}):\n${"-".repeat(78)}`);
  for (const i of issues.filter((i) => i.severity === "high")) {
    console.log(`  [${i.field}] ${i.title} (${i.filmId.slice(0, 8)})`);
    console.log(`    ${i.detail}`);
  }

  console.log(`\n${"-".repeat(78)}\nMEDIUM severity (${bySev.medium}):\n${"-".repeat(78)}`);
  for (const i of issues.filter((i) => i.severity === "medium")) {
    console.log(`  [${i.field}] ${i.title} (${i.filmId.slice(0, 8)})`);
    console.log(`    ${i.detail}`);
  }

  console.log(`\n${"-".repeat(78)}\nLOW severity (${bySev.low}):\n${"-".repeat(78)}`);
  for (const i of issues.filter((i) => i.severity === "low")) {
    console.log(`  [${i.field}] ${i.title} (${i.filmId.slice(0, 8)})`);
    console.log(`    ${i.detail}`);
  }

  console.log(`\n${"=".repeat(78)}\nClean films (no issues): ${films100.filter((f) => !issues.some((i) => i.filmId === f.id)).length} / ${films100.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
