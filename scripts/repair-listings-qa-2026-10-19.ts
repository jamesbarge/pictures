/**
 * Rewrite film rows from the 19 Oct 2026 listings QA, and point Electric
 * White City programme-index booking URLs at /tickets/<id>.
 *
 * Dry-run unless --execute. Does not delete film rows. Was not run against
 * production from the PR that added it.
 *
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-10-19.ts
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-10-19.ts --execute
 */

import { db, isDatabaseAvailable } from "../src/db";
import { films, screenings } from "../src/db/schema";
import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  planListingsQaFilm,
  repairElectricProgrammeUrl,
  type ListingsQaFilmPlan,
} from "../src/scrapers/utils/listings-qa-2026-10-19";

interface FilmRow {
  id: string;
  title: string;
  year: number | null;
  directors: string[];
  runtime: number | null;
  tmdbId: number | null;
  posterUrl: string | null;
}

function score(film: FilmRow, target: ListingsQaFilmPlan): number {
  let value = 0;
  if (film.tmdbId) value += 100;
  if (film.posterUrl) value += 10;
  if (film.year != null) value += 5;
  if (target.year != null && film.year != null && Math.abs(film.year - target.year) <= 1) value += 30;
  if (film.title === target.title) value += 2;
  return value;
}

async function findCanonical(self: FilmRow, target: ListingsQaFilmPlan): Promise<FilmRow | null> {
  const matches = await db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      directors: films.directors,
      runtime: films.runtime,
      tmdbId: films.tmdbId,
      posterUrl: films.posterUrl,
    })
    .from(films)
    .where(sql`lower(${films.title}) = lower(${target.title})`);
  const others = matches.filter((film) => film.id !== self.id);
  if (others.length === 0) return null;
  others.sort((a, b) => score(b, target) - score(a, target));
  const best = others[0];
  if (score(best, target) > score(self, target)) return best;
  return null;
}

async function noteScreenings(
  ids: string[],
  note: string | null,
  execute: boolean,
): Promise<void> {
  if (!note || ids.length === 0) return;
  const rows = await db
    .select({ id: screenings.id, eventDescription: screenings.eventDescription })
    .from(screenings)
    .where(and(inArray(screenings.id, ids), isNull(screenings.eventDescription)));
  for (const row of rows) {
    console.log(`${execute ? "noted" : "would note"} screening ${row.id}: ${note}`);
    if (execute) {
      await db.update(screenings).set({
        eventDescription: note,
        updatedAt: new Date(),
      }).where(eq(screenings.id, row.id));
    }
  }
}

async function repoint(
  fromId: string,
  toId: string,
  execute: boolean,
): Promise<{ summary: string; movedIds: string[] }> {
  const moving = await db
    .select({ id: screenings.id, cinemaId: screenings.cinemaId, datetime: screenings.datetime })
    .from(screenings)
    .where(eq(screenings.filmId, fromId));
  let moved = 0;
  let removed = 0;
  const movedIds: string[] = [];
  for (const row of moving) {
    const [clash] = await db
      .select({ id: screenings.id })
      .from(screenings)
      .where(and(
        eq(screenings.filmId, toId),
        eq(screenings.cinemaId, row.cinemaId),
        eq(screenings.datetime, row.datetime),
      ))
      .limit(1);
    if (clash) {
      removed++;
      if (execute) await db.delete(screenings).where(eq(screenings.id, row.id));
    } else {
      moved++;
      movedIds.push(row.id);
      if (execute) {
        await db.update(screenings).set({ filmId: toId, updatedAt: new Date() }).where(eq(screenings.id, row.id));
      }
    }
  }
  return {
    summary: `${moving.length} screenings, ${moved} moved, ${removed} dropped as same-slot duplicates`,
    movedIds,
  };
}

async function repairFilms(execute: boolean): Promise<number> {
  const candidates = await db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      directors: films.directors,
      runtime: films.runtime,
      tmdbId: films.tmdbId,
      posterUrl: films.posterUrl,
    })
    .from(films)
    .where(or(
      ilike(films.title, "%Book Launch%"),
      ilike(films.title, "%Introduction%"),
      ilike(films.title, "%live score%"),
      ilike(films.title, "%anniversary with%"),
      ilike(films.title, "%: Encore"),
      ilike(films.title, "Final Shows%"),
      ilike(films.title, "Category H%"),
      ilike(films.title, "%Festival of Queer Spanish Culture%"),
      ilike(films.title, "Queer Horror Nights%"),
      ilike(films.title, "London Breeze%"),
      ilike(films.title, "%costume party%"),
      ilike(films.title, "MS. 45%"),
      ilike(films.title, "%director%cut%"),
      ilike(films.title, "Voice of a Gener%"),
      ilike(films.title, "%Shadow Cast"),
      sql`${films.directors}::text ~* '\\d+\\s*m'`,
      sql`${films.directors}::text LIKE '%/%'`,
      sql`${films.directors}::text ILIKE '%mohsen enayati%'`,
    ));

  let planned = 0;
  for (const film of candidates) {
    const plan = planListingsQaFilm(film);
    if (!plan) continue;
    planned++;
    const owned = await db
      .select({ id: screenings.id })
      .from(screenings)
      .where(eq(screenings.filmId, film.id));
    const ownedIds = owned.map((row) => row.id);

    const canonical = await findCanonical(film, plan);
    if (canonical && canonical.id !== film.id) {
      const { summary, movedIds } = await repoint(film.id, canonical.id, execute);
      console.log(
        `${execute ? "repointed" : "would repoint"} ${film.id} "${film.title}" -> ${canonical.id} "${canonical.title}": ${summary}`,
      );
      await noteScreenings(movedIds.length > 0 ? movedIds : ownedIds, plan.eventNote, execute);
      continue;
    }

    const filmChanged = plan.title !== film.title
      || plan.runtime !== film.runtime
      || plan.directors.length !== film.directors.length
      || plan.directors.some((director, index) => director !== film.directors[index]);
    if (filmChanged) {
      console.log(
        `${execute ? "updated" : "would update"} ${film.id} "${film.title}" -> "${plan.title}"` +
          ` runtime ${film.runtime ?? "null"} -> ${plan.runtime ?? "null"}` +
          ` directors ${JSON.stringify(film.directors)} -> ${JSON.stringify(plan.directors)}`,
      );
      if (execute) {
        await db.update(films).set({
          title: plan.title,
          directors: plan.directors,
          runtime: plan.runtime,
          updatedAt: new Date(),
        }).where(eq(films.id, film.id));
      }
    }
    await noteScreenings(ownedIds, plan.eventNote, execute);
  }
  return planned;
}

async function repairElectric(execute: boolean): Promise<number> {
  const rows = await db
    .select({
      id: screenings.id,
      bookingUrl: screenings.bookingUrl,
      sourceId: screenings.sourceId,
      availabilityStatus: screenings.availabilityStatus,
    })
    .from(screenings)
    .where(ilike(screenings.bookingUrl, "%electriccinema.co.uk/programme%"));

  let planned = 0;
  for (const row of rows) {
    const plan = repairElectricProgrammeUrl(row);
    if (!plan) continue;
    planned++;
    console.log(
      `${execute ? "retargeted" : "would retarget"} screening ${row.id} ${row.bookingUrl} -> ${plan.bookingUrl} (${plan.availabilityStatus})`,
    );
    if (execute) {
      await db.update(screenings).set({
        bookingUrl: plan.bookingUrl,
        availabilityStatus: plan.availabilityStatus,
        availabilityCheckedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(screenings.id, row.id));
    }
  }
  return planned;
}

async function main() {
  const execute = process.argv.includes("--execute");
  if (!isDatabaseAvailable) {
    console.error("DATABASE_URL is not available. Nothing was written.");
    process.exit(1);
  }

  console.log(execute ? "EXECUTE: writing repairs" : "DRY RUN: no rows will change. Re-run with --execute to write.");
  const filmsPlanned = await repairFilms(execute);
  const electricPlanned = await repairElectric(execute);
  console.log(
    `${filmsPlanned} film${filmsPlanned === 1 ? "" : "s"} and ${electricPlanned} Electric booking URL${electricPlanned === 1 ? "" : "s"} ${execute ? "processed" : "would change"}.`,
  );
  if (!execute) console.log("Dry run complete. Re-run with --execute to write.");
}

const invokedDirectly = process.argv[1]?.includes("repair-listings-qa-2026-10-19");
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
