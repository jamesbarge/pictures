#!/usr/bin/env tsx
/**
 * Repair the 26 Oct 2026 listings QA row. Dry-run unless --execute.
 * Not run against production by the change that added it.
 *
 * "Spider (2002) with Peter Suschitzky" (Garden, 9 Nov 2026 20:00Z,
 * David Cronenberg, year 2002) → Spider. The guest credit is the screening
 * note. Upcoming screenings move onto an existing Spider row whose year is
 * 2002, preferring one that already has a TMDB id. A Spider from any other
 * year is left alone. When no such row exists, this film is renamed and its
 * year is filled in only when it was null. Directors stay. Film rows are
 * not deleted. A screening that would share film + cinema + datetime with
 * the destination is deleted; that is the extra copy of the same showing.
 *
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-10-26.ts
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-10-26.ts --execute
 */

import { and, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import { films } from "@/db/schema/films";
import { screenings } from "@/db/schema/screenings";
import { GUEST_TITLE_REPAIRS, pickSameYearFilm } from "@/scrapers/utils/listings-qa-2026-10-26";

const execute = process.argv.includes("--execute");

function log(line: string): void {
  console.log(`${execute ? "APPLY" : "DRY"} ${line}`);
}

async function repairTitles(now: Date): Promise<void> {
  for (const repair of GUEST_TITLE_REPAIRS) {
    const sources = await db.select().from(films).where(eq(films.title, repair.from));
    if (sources.length === 0) {
      log(`title "${repair.from}": no film row`);
      continue;
    }
    const candidates = await db.select().from(films).where(eq(films.title, repair.to));

    for (const source of sources) {
      const canonical = pickSameYearFilm(candidates, source.id, repair.year);
      const upcoming = await db
        .select()
        .from(screenings)
        .where(and(eq(screenings.filmId, source.id), gte(screenings.datetime, now)));

      if (canonical) {
        log(
          `move ${upcoming.length} screening(s) of "${repair.from}" (${source.id}) onto "${repair.to}" (${canonical.id}, ${repair.year})`,
        );
        for (const screening of upcoming) {
          log(
            `  screening ${screening.id} ${screening.cinemaId} ${screening.datetime.toISOString()} note "${repair.note}"`,
          );
          if (!execute) continue;
          try {
            await db
              .update(screenings)
              .set({
                filmId: canonical.id,
                ...(screening.eventDescription ? {} : { eventDescription: repair.note }),
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

      log(
        `rename film ${source.id} "${repair.from}" → "${repair.to}"` +
          (source.year == null ? `; year → ${repair.year}` : ""),
      );
      for (const screening of upcoming) {
        if (screening.eventDescription) continue;
        log(`  note on ${screening.id} ${screening.cinemaId} ${screening.datetime.toISOString()}: "${repair.note}"`);
      }
      if (!execute) continue;
      await db
        .update(films)
        .set({
          title: repair.to,
          ...(source.year == null ? { year: repair.year } : {}),
          updatedAt: now,
        })
        .where(eq(films.id, source.id));
      const untitled = upcoming.filter((screening) => !screening.eventDescription).map((screening) => screening.id);
      if (untitled.length > 0) {
        await db
          .update(screenings)
          .set({ eventDescription: repair.note, updatedAt: now })
          .where(inArray(screenings.id, untitled));
      }
    }
  }
}

async function main(): Promise<void> {
  console.log(execute ? "Executing." : "Dry run. Pass --execute to write. Film rows are not deleted.");
  await repairTitles(new Date());
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
