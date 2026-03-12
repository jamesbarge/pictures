/**
 * Data Quality Patrol — Audit Script
 *
 * Checks a batch of 20 films (with upcoming screenings) for data quality issues.
 * Reads cursor from the latest Obsidian patrol report to continue where we left off.
 * Outputs structured JSON for the patrol agent to analyze.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, gt, eq, and, isNull, gte } from "drizzle-orm";
import * as schema from "../src/db/schema/index.ts";
import * as fs from "fs";
import * as path from "path";

const BATCH_SIZE = 20;
const OBSIDIAN_DIR =
  "/Users/jamesbarge/Documents/Obsidian Vault/Pictures/Data Quality";

// WAF-protected domains where 403 is expected
const WAF_DOMAINS = [
  "curzon.com",
  "everymancinema.com",
  "picturehouses.com",
  "bfi.org.uk",
  "ticketing.eu.veezi.com",
];

interface PatrolCursor {
  cursorFilmTitle: string;
  cursorFilmId: string;
  filmsCheckedThisCycle: number;
  cycleNumber: number;
}

interface Issue {
  type: string;
  filmId: string;
  filmTitle: string;
  description: string;
  metadata?: Record<string, unknown>;
}

interface BookingCheck {
  url: string;
  filmTitle: string;
  cinemaName: string;
  status: number | string;
  ok: boolean;
}

function readCursorFromLastReport(): PatrolCursor | null {
  try {
    const files = fs
      .readdirSync(OBSIDIAN_DIR)
      .filter((f) => f.startsWith("patrol-") && f.endsWith(".md"))
      .sort();
    if (files.length === 0) return null;

    const lastFile = files[files.length - 1];
    const content = fs.readFileSync(path.join(OBSIDIAN_DIR, lastFile), "utf-8");

    // Parse YAML frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;

    const fm = fmMatch[1];
    const get = (key: string) => {
      const m = fm.match(new RegExp(`^${key}:\\s*"?([^"\\n]*)"?`, "m"));
      return m ? m[1] : null;
    };

    return {
      cursorFilmTitle: get("cursor_film_title") || "",
      cursorFilmId: get("cursor_film_id") || "",
      filmsCheckedThisCycle: parseInt(get("films_checked_this_cycle") || "0"),
      cycleNumber: parseInt(get("cycle_number") || "1"),
    };
  } catch {
    return null;
  }
}

async function checkBookingUrl(url: string): Promise<{ status: number | string; ok: boolean }> {
  try {
    const isWaf = WAF_DOMAINS.some((d) => url.includes(d));
    if (isWaf) {
      return { status: "waf_skip", ok: true };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const resp = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });
    clearTimeout(timeout);
    return { status: resp.status, ok: resp.status >= 200 && resp.status < 400 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort")) return { status: "timeout", ok: false };
    return { status: `error: ${msg.slice(0, 80)}`, ok: false };
  }
}

async function run() {
  const client = postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 1,
  });
  const db = drizzle(client, { schema });

  try {
    const cursor = readCursorFromLastReport();
    const cursorTitle = cursor?.cursorFilmTitle || "";
    let filmsChecked = cursor?.filmsCheckedThisCycle || 0;
    let cycleNumber = cursor?.cycleNumber || 1;

    // Get total films with upcoming screenings (content_type = 'film')
    const now = new Date();
    const totalResult = await db
      .select({ count: sql<number>`count(DISTINCT ${schema.films.id})` })
      .from(schema.films)
      .innerJoin(
        schema.screenings,
        eq(schema.films.id, schema.screenings.filmId)
      )
      .where(
        and(
          eq(schema.films.contentType, "film"),
          gte(schema.screenings.datetime, now)
        )
      );
    const totalFilms = Number(totalResult[0]?.count || 0);

    // Get batch of films after cursor
    const filmsWithScreenings = await db
      .selectDistinctOn([schema.films.title], {
        id: schema.films.id,
        title: schema.films.title,
        year: schema.films.year,
        tmdbId: schema.films.tmdbId,
        posterUrl: schema.films.posterUrl,
        synopsis: schema.films.synopsis,
        cast: schema.films.cast,
        directors: schema.films.directors,
        letterboxdUrl: schema.films.letterboxdUrl,
        letterboxdRating: schema.films.letterboxdRating,
        matchedAt: schema.films.matchedAt,
        contentType: schema.films.contentType,
        isRepertory: schema.films.isRepertory,
      })
      .from(schema.films)
      .innerJoin(
        schema.screenings,
        eq(schema.films.id, schema.screenings.filmId)
      )
      .where(
        and(
          eq(schema.films.contentType, "film"),
          gte(schema.screenings.datetime, now),
          cursorTitle ? gt(schema.films.title, cursorTitle) : undefined
        )
      )
      .orderBy(schema.films.title)
      .limit(BATCH_SIZE);

    // Check if cycle wrapped
    if (filmsWithScreenings.length === 0 && cursorTitle) {
      // Wrap around to start of alphabet
      cycleNumber++;
      filmsChecked = 0;
      const wrapped = await db
        .selectDistinctOn([schema.films.title], {
          id: schema.films.id,
          title: schema.films.title,
          year: schema.films.year,
          tmdbId: schema.films.tmdbId,
          posterUrl: schema.films.posterUrl,
          synopsis: schema.films.synopsis,
          cast: schema.films.cast,
          directors: schema.films.directors,
          letterboxdUrl: schema.films.letterboxdUrl,
          letterboxdRating: schema.films.letterboxdRating,
          matchedAt: schema.films.matchedAt,
          contentType: schema.films.contentType,
          isRepertory: schema.films.isRepertory,
        })
        .from(schema.films)
        .innerJoin(
          schema.screenings,
          eq(schema.films.id, schema.screenings.filmId)
        )
        .where(
          and(
            eq(schema.films.contentType, "film"),
            gte(schema.screenings.datetime, now)
          )
        )
        .orderBy(schema.films.title)
        .limit(BATCH_SIZE);
      filmsWithScreenings.push(...wrapped);
    }

    filmsChecked += filmsWithScreenings.length;

    // Check each film for issues
    const issues: Issue[] = [];

    for (const film of filmsWithScreenings) {
      // Missing TMDB match
      if (!film.tmdbId) {
        issues.push({
          type: "missing_tmdb",
          filmId: film.id,
          filmTitle: film.title,
          description: "No TMDB match",
        });
      }

      // Missing poster
      if (!film.posterUrl) {
        issues.push({
          type: "missing_poster",
          filmId: film.id,
          filmTitle: film.title,
          description: "No poster URL in database",
        });
      }

      // Missing synopsis
      if (!film.synopsis) {
        issues.push({
          type: "missing_synopsis",
          filmId: film.id,
          filmTitle: film.title,
          description: "No synopsis",
        });
      }

      // Missing year
      if (!film.year && film.tmdbId) {
        issues.push({
          type: "missing_year",
          filmId: film.id,
          filmTitle: film.title,
          description: "Has TMDB ID but missing year",
        });
      }

      // Missing cast
      if (
        film.tmdbId &&
        (!film.cast || (Array.isArray(film.cast) && film.cast.length === 0))
      ) {
        issues.push({
          type: "missing_cast",
          filmId: film.id,
          filmTitle: film.title,
          description: "Has TMDB ID but no cast data",
          metadata: { tmdbId: film.tmdbId },
        });
      }

      // Letterboxd checks
      if (!film.letterboxdUrl) {
        issues.push({
          type: "missing_letterboxd",
          filmId: film.id,
          filmTitle: film.title,
          description: "No Letterboxd URL",
        });
      } else if (!film.letterboxdRating) {
        issues.push({
          type: "needs_letterboxd_rating",
          filmId: film.id,
          filmTitle: film.title,
          description: "Has Letterboxd URL but no rating",
        });
      }

      // TMDB backfill needed (has TMDB but missing basic data)
      if (film.tmdbId && (!film.posterUrl || !film.synopsis) && film.matchedAt) {
        issues.push({
          type: "needs_tmdb_backfill",
          filmId: film.id,
          filmTitle: film.title,
          description: "Has TMDB ID but missing poster/synopsis — needs re-enrichment",
          metadata: { tmdbId: film.tmdbId },
        });
      }

      // Repertory classification check
      if (film.year) {
        if (film.year >= 2025 && film.isRepertory) {
          issues.push({
            type: "wrong_repertory_tag",
            filmId: film.id,
            filmTitle: film.title,
            description: `Year ${film.year} >= 2025 but tagged as repertory`,
          });
        }
        if (film.year < 2025 && !film.isRepertory) {
          issues.push({
            type: "wrong_new_tag",
            filmId: film.id,
            filmTitle: film.title,
            description: `Year ${film.year} < 2025 but not tagged as repertory`,
          });
        }
      }
    }

    // Check booking links for the batch (one per film, most recent screening)
    const bookingChecks: BookingCheck[] = [];
    for (const film of filmsWithScreenings.slice(0, 10)) {
      // Check up to 10 booking links per batch
      const screening = await db
        .select({
          bookingUrl: schema.screenings.bookingUrl,
          cinemaId: schema.screenings.cinemaId,
        })
        .from(schema.screenings)
        .where(
          and(
            eq(schema.screenings.filmId, film.id),
            gte(schema.screenings.datetime, now)
          )
        )
        .orderBy(schema.screenings.datetime)
        .limit(1);

      if (screening.length > 0 && screening[0].bookingUrl) {
        const { status, ok } = await checkBookingUrl(screening[0].bookingUrl);
        bookingChecks.push({
          url: screening[0].bookingUrl,
          filmTitle: film.title,
          cinemaName: screening[0].cinemaId,
          status,
          ok,
        });
      }
    }

    // Read previous suggestion from last report
    let previousSuggestion: string | null = null;
    try {
      const files = fs
        .readdirSync(OBSIDIAN_DIR)
        .filter((f) => f.startsWith("patrol-") && f.endsWith(".md"))
        .sort();
      if (files.length > 0) {
        const content = fs.readFileSync(
          path.join(OBSIDIAN_DIR, files[files.length - 1]),
          "utf-8"
        );
        const suggMatch = content.match(
          /## Suggestion\n\n([\s\S]*?)(?=\n## |$)/
        );
        if (suggMatch) previousSuggestion = suggMatch[1].trim();
      }
    } catch {
      // ignore
    }

    const lastFilm = filmsWithScreenings[filmsWithScreenings.length - 1];

    const output = {
      timestamp: new Date().toISOString(),
      cursor: {
        cursorFilmTitle: lastFilm?.title || cursorTitle,
        cursorFilmId: lastFilm?.id || "",
        filmsCheckedThisCycle: filmsChecked,
        cycleNumber,
        batchSize: BATCH_SIZE,
        totalFilms,
      },
      stats: {
        filmsBatchChecked: filmsWithScreenings.length,
        issuesFound: issues.length,
        totalFilmsInDb: totalFilms,
        bookingLinksChecked: bookingChecks.length,
      },
      issues,
      bookingChecks,
      previousSuggestion,
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await client.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
