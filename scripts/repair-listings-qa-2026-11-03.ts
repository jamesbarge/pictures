#!/usr/bin/env tsx
/**
 * Repair the 3 Nov 2026 listings QA rows. Dry-run unless --execute.
 * Not run against production by the change that added it. Film rows are not deleted.
 *
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-11-03.ts
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-11-03.ts --execute
 *
 * Titles
 *   "Ken Russell's The Devils" → The Devils (1971, Ken Russell).
 *     "Hell on Earth: The Desecration and Resurrection of The Devils" is not touched.
 *   "Don DeLillo at 90: Cosmopolis with Ben Rivers" and
 *     "Cosmopolis (2012) with Ben Rivers" → Cosmopolis (2012). The two Garden
 *     rows that share TcsPerformance_6283015 at one instant become one screening.
 *   "\"Terrorists\" - London Preview" → Terrorists. Note "London Preview"
 *     when the screening note is empty.
 *   "My Political Biography - Trans Awareness Programme 2026" →
 *     My Political Biography. Note "Trans Awareness Programme 2026" when empty.
 */

import { and, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import { films } from "@/db/schema/films";
import { screenings } from "@/db/schema/screenings";
import { collapseSameGardenFilm } from "@/scrapers/cinemas/garden-performance";
import { cleanFilmTitle, listedGardenFilmRank } from "@/scrapers/utils/film-title-cleaner";
import {
  STORED_TITLE_REPAIRS,
  pickRepairedFilm,
  type RepairFilm,
  type TitleRepair,
} from "@/scrapers/utils/listings-qa-2026-11-03";

const execute = process.argv.includes("--execute");

function log(line: string): void {
  console.log(`${execute ? "APPLY" : "DRY"} ${line}`);
}

function asRepairFilm(film: typeof films.$inferSelect): RepairFilm {
  return {
    id: film.id,
    title: film.title,
    year: film.year,
    tmdbId: film.tmdbId,
    directors: film.directors ?? [],
  };
}

async function setNotes(
  screeningIds: string[],
  repair: TitleRepair,
  now: Date,
  emptyNote: boolean,
  emptySeason: boolean,
): Promise<void> {
  if (screeningIds.length === 0) return;
  const patch: { eventDescription?: string; season?: string; updatedAt: Date } = { updatedAt: now };
  if (emptyNote && repair.note) patch.eventDescription = repair.note;
  if (emptySeason && repair.season) patch.season = repair.season;
  if (!patch.eventDescription && !patch.season) return;
  await db.update(screenings).set(patch).where(inArray(screenings.id, screeningIds));
}

async function moveScreening(
  screeningId: string,
  filmId: string,
  repair: TitleRepair,
  noteIsEmpty: boolean,
  seasonIsEmpty: boolean,
  now: Date,
): Promise<"moved" | "deleted"> {
  try {
    await db
      .update(screenings)
      .set({
        filmId,
        ...(noteIsEmpty && repair.note ? { eventDescription: repair.note } : {}),
        ...(seasonIsEmpty && repair.season ? { season: repair.season } : {}),
        updatedAt: now,
      })
      .where(eq(screenings.id, screeningId));
    return "moved";
  } catch (error) {
    const code =
      (error as { cause?: { code?: string }; code?: string }).cause?.code ??
      (error as { code?: string }).code;
    if (code !== "23505") throw error;
    log(`  screening ${screeningId} already exists on the destination film; deleting the extra`);
    await db.delete(screenings).where(eq(screenings.id, screeningId));
    return "deleted";
  }
}

async function repairTitles(now: Date, dropped: Set<string>): Promise<void> {
  for (const repair of STORED_TITLE_REPAIRS) {
    const sources = await db.select().from(films).where(eq(films.title, repair.from));
    if (sources.length === 0) {
      log(`title "${repair.from}": no film row`);
      continue;
    }
    const named = await db.select().from(films).where(eq(films.title, repair.to));
    let canonical = pickRepairedFilm(named.map(asRepairFilm), repair);

    if (!canonical) {
      const source = sources[0];
      const directors =
        repair.director && (source.directors ?? []).length === 0
          ? [repair.director]
          : (source.directors ?? []);
      const year = source.year ?? repair.year;
      log(
        `rename film ${source.id} "${repair.from}" → "${repair.to}"` +
          (year === source.year ? "" : ` year ${year}`) +
          (directors === source.directors ? "" : ` directors ${JSON.stringify(directors)}`),
      );
      if (execute) {
        await db
          .update(films)
          .set({ title: repair.to, year, directors, updatedAt: now })
          .where(eq(films.id, source.id));
      }
      canonical = { ...asRepairFilm(source), title: repair.to, year, directors };
    }

    for (const source of sources) {
      const upcoming = await db
        .select()
        .from(screenings)
        .where(and(eq(screenings.filmId, source.id), gte(screenings.datetime, now)));
      const kept = upcoming.filter((screening) => !dropped.has(screening.id));

      if (source.id === canonical.id) {
        const untitled = kept.filter((screening) => !screening.eventDescription).map((screening) => screening.id);
        const unseasoned = kept.filter((screening) => !screening.season).map((screening) => screening.id);
        if (repair.note) {
          for (const screening of kept) {
            if (screening.eventDescription) continue;
            log(`  note on ${screening.id}: "${repair.note}"`);
          }
        }
        if (execute) {
          if (repair.note && untitled.length > 0) {
            await setNotes(untitled, repair, now, true, false);
          }
          if (repair.season && unseasoned.length > 0) {
            await setNotes(unseasoned, repair, now, false, true);
          }
        }
        continue;
      }

      log(
        `move ${kept.length} screening(s) of "${repair.from}" (${source.id}) onto "${repair.to}" (${canonical.id})`,
      );
      for (const screening of kept) {
        log(
          `  screening ${screening.id} ${screening.cinemaId} ${screening.datetime.toISOString()}` +
            (repair.note && !screening.eventDescription ? ` note "${repair.note}"` : ""),
        );
        if (!execute) continue;
        await moveScreening(
          screening.id,
          canonical.id,
          repair,
          !screening.eventDescription,
          !screening.season,
          now,
        );
      }
    }
  }
}

async function repairGardenPerformances(now: Date): Promise<Set<string>> {
  const rows = await db
    .select({
      id: screenings.id,
      filmTitle: films.title,
      datetime: screenings.datetime,
      bookingUrl: screenings.bookingUrl,
    })
    .from(screenings)
    .innerJoin(films, eq(films.id, screenings.filmId))
    .where(and(eq(screenings.cinemaId, "garden"), gte(screenings.datetime, now)));

  const plan = collapseSameGardenFilm(rows, cleanFilmTitle, (row) => listedGardenFilmRank(row.filmTitle));
  for (const row of plan.drop) {
    log(
      `delete garden screening ${row.id} "${row.filmTitle}" ${row.datetime.toISOString()} — same performance as another ${cleanFilmTitle(row.filmTitle)} listing`,
    );
  }
  if (execute && plan.drop.length > 0) {
    await db.delete(screenings).where(
      inArray(
        screenings.id,
        plan.drop.map((row) => row.id),
      ),
    );
  }
  return new Set(plan.drop.map((row) => row.id));
}

async function main(): Promise<void> {
  console.log(execute ? "Executing." : "Dry run. Pass --execute to write. Film rows are not deleted.");
  const now = new Date();
  const dropped = await repairGardenPerformances(now);
  await repairTitles(now, dropped);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
