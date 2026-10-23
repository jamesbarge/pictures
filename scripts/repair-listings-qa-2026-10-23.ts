/**
 * Rewrite stored rows from the 23 Oct 2026 listings QA.
 *
 * Dry-run unless --execute. Does not delete film rows. A Curzon Bloomsbury
 * screening is deleted only when its booking URL is the DocHouse strand and
 * Bertha DocHouse already has a screening at the same time. Was not run
 * against production from the PR that added it.
 *
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-10-23.ts
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-10-23.ts --execute
 */

import { db, isDatabaseAvailable } from "../src/db";
import { films, screenings } from "../src/db/schema";
import { and, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  chooseListingCanonical,
  isCurzonDocHouseDuplicate,
  listingTitlePlan,
  partListingTargets,
  type RepairFilm,
} from "../src/scrapers/utils/listings-qa-2026-10-23";

type FilmRow = RepairFilm;

function executeFlag(): boolean {
  return process.argv.includes("--execute");
}

async function filmsTitled(titles: string[]): Promise<FilmRow[]> {
  if (titles.length === 0) return [];
  const lowered = titles.map((title) => title.toLowerCase());
  return db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      tmdbId: films.tmdbId,
      posterUrl: films.posterUrl,
    })
    .from(films)
    .where(or(...lowered.map((title) => sql`lower(${films.title}) = ${title}`)));
}

async function noteScreenings(ids: string[], note: string | null, execute: boolean): Promise<void> {
  if (!note || ids.length === 0) return;
  const rows = await db
    .select({ id: screenings.id })
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
): Promise<string[]> {
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
      console.log(`${execute ? "dropped" : "would drop"} duplicate screening ${row.id}`);
      if (execute) await db.delete(screenings).where(eq(screenings.id, row.id));
    } else {
      moved++;
      movedIds.push(row.id);
      if (execute) {
        await db.update(screenings).set({ filmId: toId, updatedAt: new Date() }).where(eq(screenings.id, row.id));
      }
    }
  }
  console.log(`  ${moving.length} screenings, ${moved} moved, ${removed} dropped as same-slot duplicates`);
  return movedIds;
}

async function screeningIds(filmId: string): Promise<string[]> {
  const rows = await db.select({ id: screenings.id }).from(screenings).where(eq(screenings.filmId, filmId));
  return rows.map((row) => row.id);
}

async function repairFilms(execute: boolean): Promise<number> {
  const candidates = await db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      tmdbId: films.tmdbId,
      posterUrl: films.posterUrl,
    })
    .from(films)
    .where(or(
      ilike(films.title, "% + %"),
      ilike(films.title, "% at Genesis"),
      ilike(films.title, "%, Part %"),
      ilike(films.title, "%, part %"),
    ));

  let planned = 0;
  for (const film of candidates) {
    const plan = listingTitlePlan(film.title);
    const targets = partListingTargets(film.title);
    if (!plan && targets.length === 0) continue;
    planned++;

    if (plan) {
      const sameTitle = await filmsTitled([plan.title]);
      const canonical = chooseListingCanonical(film, sameTitle, plan);
      if (canonical) {
        console.log(`${execute ? "repoint" : "would repoint"} "${film.title}" -> "${canonical.title}" (${canonical.id})`);
        const moved = await repoint(film.id, canonical.id, execute);
        await noteScreenings(moved, plan.eventNote, execute);
        continue;
      }
      const nextYear = film.year ?? plan.year;
      console.log(`${execute ? "retitle" : "would retitle"} ${film.id} "${film.title}" -> "${plan.title}" year ${nextYear ?? "unchanged"}`);
      if (execute) {
        await db.update(films).set({
          title: plan.title,
          ...(film.year == null && plan.year != null ? { year: plan.year } : {}),
          updatedAt: new Date(),
        }).where(eq(films.id, film.id));
      }
      await noteScreenings(await screeningIds(film.id), plan.eventNote, execute);
      continue;
    }

    const sameTitle = await filmsTitled(targets);
    const canonical = chooseListingCanonical(film, sameTitle, { year: null });
    if (!canonical) {
      console.log(`leave "${film.title}" — no stronger Part listing is stored`);
      continue;
    }
    console.log(`${execute ? "repoint" : "would repoint"} "${film.title}" -> "${canonical.title}" (${canonical.id})`);
    await repoint(film.id, canonical.id, execute);
  }
  return planned;
}

async function dropDocHouseDuplicates(execute: boolean): Promise<number> {
  const rows = await db
    .select({
      id: screenings.id,
      datetime: screenings.datetime,
      bookingUrl: screenings.bookingUrl,
      cinemaId: screenings.cinemaId,
    })
    .from(screenings)
    .where(and(
      eq(screenings.cinemaId, "curzon-bloomsbury"),
      ilike(screenings.bookingUrl, "https://www.curzon.com/films/dochouse-%"),
      gte(screenings.datetime, new Date()),
    ));

  let dropped = 0;
  for (const row of rows) {
    if (!isCurzonDocHouseDuplicate(row.cinemaId, row.bookingUrl)) continue;
    const [dochouse] = await db
      .select({ id: screenings.id })
      .from(screenings)
      .where(and(
        eq(screenings.cinemaId, "bertha-dochouse"),
        eq(screenings.datetime, row.datetime),
      ))
      .limit(1);
    if (!dochouse) {
      console.log(`keep Curzon screening ${row.id} — no DocHouse row at ${row.datetime.toISOString()}`);
      continue;
    }
    dropped++;
    console.log(`${execute ? "delete" : "would delete"} Curzon duplicate ${row.id} ${row.bookingUrl} (${row.datetime.toISOString()})`);
    if (execute) await db.delete(screenings).where(eq(screenings.id, row.id));
  }
  return dropped;
}

async function main(): Promise<void> {
  const execute = executeFlag();
  if (!isDatabaseAvailable) {
    console.error("No database URL. Refusing to run.");
    process.exit(1);
  }
  console.log(execute ? "Executing." : "Dry run. Pass --execute to write.");
  const planned = await repairFilms(execute);
  const dropped = await dropDocHouseDuplicates(execute);
  console.log(`Done. ${planned} film plans, ${dropped} Curzon DocHouse duplicates.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
