/**
 * Rewrite film rows from the 2026-10-18 listings QA, and point their screenings
 * at the canonical film when one already exists.
 *
 * Dry-run unless --execute. Does not delete film rows. Was not run against
 * production from the PR that added it.
 *
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-10-18.ts
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-10-18.ts --execute
 */

import { db, isDatabaseAvailable } from "../src/db";
import { films, screenings } from "../src/db/schema";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { planListingTitleRepair, type ListingTitleRepair } from "../src/scrapers/utils/listing-title";

interface FilmRow {
  id: string;
  title: string;
  year: number | null;
  directors: string[];
  tmdbId: number | null;
  posterUrl: string | null;
}

function score(film: FilmRow, target: ListingTitleRepair): number {
  let value = 0;
  if (film.tmdbId) value += 100;
  if (film.posterUrl) value += 10;
  if (film.year != null) value += 5;
  if (target.year != null && film.year != null && Math.abs(film.year - target.year) <= 1) value += 30;
  if (film.title === target.title) value += 2;
  return value;
}

async function findCanonical(self: FilmRow, target: ListingTitleRepair): Promise<FilmRow | null> {
  const matches = await db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      directors: films.directors,
      tmdbId: films.tmdbId,
      posterUrl: films.posterUrl,
    })
    .from(films)
    .where(sql`lower(${films.title}) = lower(${target.title})`);
  const others = matches.filter((film) => film.id !== self.id);
  if (others.length === 0) return null;
  others.sort((a, b) => score(b, target) - score(a, target));
  const best = others[0];
  // Keep a row that already has the stronger record (TMDB id, poster) and
  // only rename it. Repoint when the other film is the better canonical.
  if (score(best, target) > score(self, target)) return best;
  return null;
}

async function repoint(fromId: string, toId: string, execute: boolean): Promise<string> {
  const moving = await db
    .select({ id: screenings.id, cinemaId: screenings.cinemaId, datetime: screenings.datetime })
    .from(screenings)
    .where(eq(screenings.filmId, fromId));
  let moved = 0;
  let removed = 0;
  for (const row of moving) {
    const [clash] = await db
      .select({ id: screenings.id })
      .from(screenings)
      .where(
        and(
          eq(screenings.filmId, toId),
          eq(screenings.cinemaId, row.cinemaId),
          eq(screenings.datetime, row.datetime),
        ),
      )
      .limit(1);
    if (clash) {
      removed++;
      if (execute) await db.delete(screenings).where(eq(screenings.id, row.id));
    } else {
      moved++;
      if (execute) {
        await db.update(screenings).set({ filmId: toId, updatedAt: new Date() }).where(eq(screenings.id, row.id));
      }
    }
  }
  return `${moving.length} screenings, ${moved} moved, ${removed} dropped as same-slot duplicates`;
}

async function main() {
  const execute = process.argv.includes("--execute");
  if (!isDatabaseAvailable) {
    console.error("DATABASE_URL is not available. Nothing was written.");
    process.exit(1);
  }

  console.log(execute ? "EXECUTE: writing repairs" : "DRY RUN: no rows will change. Re-run with --execute to write.");

  const candidates = await db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      directors: films.directors,
      tmdbId: films.tmdbId,
      posterUrl: films.posterUrl,
    })
    .from(films)
    .where(or(
      ilike(films.title, "%'s %"),
      ilike(films.title, "%’s %"),
      ilike(films.title, "%presents %"),
      ilike(films.title, "%Film Africa%"),
      ilike(films.title, "%Horror for a Cause%"),
      ilike(films.title, "%Babies:%"),
      ilike(films.title, "%Baby:%"),
      ilike(films.title, "%Hard of Hearing:%"),
      ilike(films.title, "%Back To Black%"),
      ilike(films.title, "%Director%Cut%"),
      ilike(films.title, "%TATLER%"),
      eq(films.title, "Seven"),
      and(eq(films.title, "Variety"), eq(films.year, 1985)),
      sql`${films.title} = upper(${films.title})`,
      sql`${films.directors}::text ILIKE '%ype Williams%'`,
    ));

  let planned = 0;
  for (const film of candidates) {
    const plan = planListingTitleRepair(film);
    if (!plan) continue;
    planned++;
    const canonical = await findCanonical(film, plan);
    if (canonical && canonical.id !== film.id) {
      const summary = await repoint(film.id, canonical.id, execute);
      console.log(
        `${execute ? "repointed" : "would repoint"} ${film.id} "${film.title}" -> ${canonical.id} "${canonical.title}": ${summary}`,
      );
      if (execute && canonical.directors.some((director) => director.trim() === "ype Williams")) {
        await db.update(films).set({
          directors: canonical.directors.map((director) => director.trim() === "ype Williams" ? "Hype Williams" : director),
          updatedAt: new Date(),
        }).where(eq(films.id, canonical.id));
      }
      continue;
    }

    console.log(
      `${execute ? "updated" : "would update"} ${film.id} "${film.title}" -> "${plan.title}"` +
        ` year ${film.year ?? "null"} -> ${plan.year ?? "null"}` +
        ` directors ${JSON.stringify(film.directors)} -> ${JSON.stringify(plan.directors)}`,
    );
    if (execute) {
      await db.update(films).set({
        title: plan.title,
        year: plan.year,
        directors: plan.directors,
        updatedAt: new Date(),
      }).where(eq(films.id, film.id));
    }
  }

  console.log(`${planned} film${planned === 1 ? "" : "s"} ${execute ? "processed" : "would change"}.`);
  if (!execute) console.log("Dry run complete. Re-run with --execute to write.");
}

const invokedDirectly = process.argv[1]?.includes("repair-listings-qa-2026-10-18");
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
