#!/usr/bin/env tsx
/**
 * Repair the 27 Oct 2026 listings QA rows. Dry-run unless --execute.
 * Not run against production by the change that added it.
 *
 * Garden
 *   "La guitarra flamenca de Yerai Cortés (The Flamenco Guitar of Yerai
 *   Cortés)" and "The Flamenco Guitar of Yerai Cortés" are one showing
 *   (TcsPerformance_6223527, 2026-11-10 18:10Z). The bilingual screening is
 *   deleted. Any other upcoming Garden title in the "Original (English)"
 *   shape is moved onto the English-titled film when one exists, or renamed
 *   to that English title. Film rows are not deleted.
 *
 * Genesis
 *   "The Crow - Seasonal Affective Cinema" → The Crow. The strand is written
 *   onto eventDescription when the screening has none. Screenings move onto
 *   an existing "The Crow" that has a TMDB id; if several do, the earlier
 *   year wins (the listing is the 1994 film). The junk film row is left in
 *   place when a destination exists.
 *
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-10-27.ts
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-10-27.ts --execute
 */

import { and, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import { films } from "@/db/schema/films";
import { screenings } from "@/db/schema/screenings";
import {
  collapseGardenTranslationDuplicates,
  gardenEnglishTitle,
  gardenListingTitle,
} from "@/scrapers/cinemas/garden-performance";
import { GENESIS_CROW } from "@/scrapers/utils/listings-qa-2026-10-27";

const execute = process.argv.includes("--execute");

function log(line: string): void {
  console.log(`${execute ? "APPLY" : "DRY"} ${line}`);
}

function preferExistingFilm(
  a: { tmdbId: number | null; year: number | null },
  b: { tmdbId: number | null; year: number | null },
): number {
  const tmdb = Number(Boolean(b.tmdbId)) - Number(Boolean(a.tmdbId));
  if (tmdb !== 0) return tmdb;
  if (a.year == null && b.year == null) return 0;
  if (a.year == null) return 1;
  if (b.year == null) return -1;
  return a.year - b.year;
}

async function repairGarden(now: Date): Promise<void> {
  const rows = await db
    .select({
      screeningId: screenings.id,
      filmId: films.id,
      filmTitle: films.title,
      datetime: screenings.datetime,
      bookingUrl: screenings.bookingUrl,
    })
    .from(screenings)
    .innerJoin(films, eq(films.id, screenings.filmId))
    .where(and(eq(screenings.cinemaId, "garden"), gte(screenings.datetime, now)));

  const collapsed = collapseGardenTranslationDuplicates(rows);
  for (const row of collapsed.drop) {
    log(
      `delete garden screening ${row.screeningId} "${row.filmTitle}" ${row.datetime.toISOString()} — same showing as "${gardenListingTitle(row.filmTitle)}"`,
    );
  }
  if (execute && collapsed.drop.length > 0) {
    await db.delete(screenings).where(
      inArray(
        screenings.id,
        collapsed.drop.map((row) => row.screeningId),
      ),
    );
  }

  const dropped = new Set(collapsed.drop.map((row) => row.screeningId));
  const byFilm = new Map<string, typeof rows>();
  for (const row of rows) {
    if (dropped.has(row.screeningId) || !gardenEnglishTitle(row.filmTitle)) continue;
    const list = byFilm.get(row.filmId) ?? [];
    list.push(row);
    byFilm.set(row.filmId, list);
  }

  for (const [filmId, group] of byFilm) {
    const english = gardenEnglishTitle(group[0].filmTitle);
    if (!english) continue;
    const candidates = await db.select().from(films).where(eq(films.title, english));
    const canonical = candidates.filter((film) => film.id !== filmId).sort(preferExistingFilm)[0];

    if (!canonical) {
      log(`rename film ${filmId} "${group[0].filmTitle}" → "${english}"`);
      if (!execute) continue;
      await db.update(films).set({ title: english, updatedAt: now }).where(eq(films.id, filmId));
      continue;
    }

    log(
      `move ${group.length} screening(s) of "${group[0].filmTitle}" (${filmId}) onto "${english}" (${canonical.id})`,
    );
    for (const row of group) {
      log(`  screening ${row.screeningId} ${row.datetime.toISOString()}`);
      if (!execute) continue;
      try {
        await db
          .update(screenings)
          .set({ filmId: canonical.id, updatedAt: now })
          .where(eq(screenings.id, row.screeningId));
      } catch (error) {
        const code =
          (error as { cause?: { code?: string }; code?: string }).cause?.code ??
          (error as { code?: string }).code;
        if (code !== "23505") throw error;
        log(`  screening ${row.screeningId} already exists on the English title; deleting the extra`);
        await db.delete(screenings).where(eq(screenings.id, row.screeningId));
      }
    }
  }
}

async function repairGenesis(now: Date): Promise<void> {
  const sources = await db.select().from(films).where(eq(films.title, GENESIS_CROW.from));
  if (sources.length === 0) {
    log(`title "${GENESIS_CROW.from}": no film row`);
    return;
  }
  const candidates = await db.select().from(films).where(eq(films.title, GENESIS_CROW.to));

  for (const source of sources) {
    const canonical = candidates.filter((film) => film.id !== source.id).sort(preferExistingFilm)[0];
    const upcoming = await db
      .select()
      .from(screenings)
      .where(and(eq(screenings.filmId, source.id), gte(screenings.datetime, now)));

    if (canonical) {
      log(
        `move ${upcoming.length} screening(s) of "${GENESIS_CROW.from}" (${source.id}) onto "${GENESIS_CROW.to}" (${canonical.id})`,
      );
      for (const screening of upcoming) {
        log(
          `  screening ${screening.id} ${screening.cinemaId} ${screening.datetime.toISOString()} note "${GENESIS_CROW.note}"`,
        );
        if (!execute) continue;
        try {
          await db
            .update(screenings)
            .set({
              filmId: canonical.id,
              ...(screening.eventDescription ? {} : { eventDescription: GENESIS_CROW.note }),
              updatedAt: now,
            })
            .where(eq(screenings.id, screening.id));
        } catch (error) {
          const code =
            (error as { cause?: { code?: string }; code?: string }).cause?.code ??
            (error as { code?: string }).code;
          if (code !== "23505") throw error;
          log(`  screening ${screening.id} already exists on the canonical film; deleting the extra`);
          await db.delete(screenings).where(eq(screenings.id, screening.id));
        }
      }
      continue;
    }

    log(`rename film ${source.id} "${GENESIS_CROW.from}" → "${GENESIS_CROW.to}"`);
    for (const screening of upcoming) {
      if (screening.eventDescription) continue;
      log(`  note on ${screening.id} ${screening.cinemaId} ${screening.datetime.toISOString()}: "${GENESIS_CROW.note}"`);
    }
    if (!execute) continue;
    await db.update(films).set({ title: GENESIS_CROW.to, updatedAt: now }).where(eq(films.id, source.id));
    const untitled = upcoming.filter((screening) => !screening.eventDescription).map((screening) => screening.id);
    if (untitled.length > 0) {
      await db
        .update(screenings)
        .set({ eventDescription: GENESIS_CROW.note, updatedAt: now })
        .where(inArray(screenings.id, untitled));
    }
  }
}

async function main(): Promise<void> {
  console.log(execute ? "Executing." : "Dry run. Pass --execute to write. Film rows are not deleted.");
  const now = new Date();
  await repairGarden(now);
  await repairGenesis(now);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
