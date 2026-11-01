#!/usr/bin/env tsx
/**
 * Repair the 1 Nov 2026 listings QA rows. Dry-run unless --execute.
 * Not run against production by the change that added it. Film rows are not deleted.
 *
 * Titles
 *   "MUBI FEST LIVE: A LONG WINTER" → A Long Winter. Note and season
 *     "MUBI FEST LIVE". A note that is only "Q&A" is replaced, because
 *     eventType already says q_and_a and the listings payload does not
 *     return season. Any other note is left as it is.
 *   "Little Shop of Horrors (director’s Cut)" → Little Shop of Horrors,
 *     preferring a 1986 row over the 1960 namesake. Note "Director's Cut"
 *     when the screening has none.
 *
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-11-01.ts
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-11-01.ts --execute
 */

import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { films } from "@/db/schema/films";
import { screenings } from "@/db/schema/screenings";
import {
  LISTING_QA_2026_11_01_TITLES,
  destinationTitle,
  pickCanonicalFilm,
  repairNote,
  repairSeason,
  repairedEventDescription,
  repairedSeason,
} from "@/scrapers/utils/listings-qa-2026-11-01";

const execute = process.argv.includes("--execute");

function log(line: string): void {
  console.log(`${execute ? "APPLY" : "DRY"} ${line}`);
}

function pgCode(error: unknown): string | undefined {
  return (
    (error as { cause?: { code?: string }; code?: string }).cause?.code ??
    (error as { code?: string }).code
  );
}

async function repairTitles(now: Date): Promise<void> {
  for (const from of LISTING_QA_2026_11_01_TITLES) {
    const to = destinationTitle(from);
    const note = repairNote(from);
    const strand = repairSeason(from);
    const sources = await db
      .select()
      .from(films)
      .where(sql`lower(${films.title}) = ${from.toLowerCase()}`);
    if (sources.length === 0) {
      log(`title "${from}": no film row`);
      continue;
    }
    const candidates = await db
      .select()
      .from(films)
      .where(sql`lower(${films.title}) = ${to.toLowerCase()}`);

    for (const source of sources) {
      const canonical = pickCanonicalFilm(source, candidates);
      const upcoming = await db
        .select()
        .from(screenings)
        .where(and(eq(screenings.filmId, source.id), gte(screenings.datetime, now)));

      if (canonical) {
        log(
          `move ${upcoming.length} screening(s) of "${from}" (${source.id}) onto "${canonical.title}" (${canonical.id})`,
        );
        for (const screening of upcoming) {
          const description = repairedEventDescription(screening.eventDescription, note, strand);
          const season = repairedSeason(screening.season, strand);
          log(
            `  screening ${screening.id} ${screening.cinemaId} ${screening.datetime.toISOString()}` +
              (description ? ` note "${description}"` : "") +
              (season ? ` season "${season}"` : ""),
          );
          if (!execute) continue;
          try {
            await db
              .update(screenings)
              .set({
                filmId: canonical.id,
                ...(description ? { eventDescription: description } : {}),
                ...(season ? { season } : {}),
                updatedAt: now,
              })
              .where(eq(screenings.id, screening.id));
          } catch (error) {
            if (pgCode(error) !== "23505") throw error;
            log(`  screening ${screening.id} already exists on the canonical film; deleting the extra`);
            await db.delete(screenings).where(eq(screenings.id, screening.id));
          }
        }
        continue;
      }

      if (source.title === to) {
        log(`film ${source.id} "${from}" already titled "${to}"`);
      } else {
        log(`rename film ${source.id} "${source.title}" → "${to}"`);
      }
      for (const screening of upcoming) {
        const description = repairedEventDescription(screening.eventDescription, note, strand);
        const season = repairedSeason(screening.season, strand);
        if (!description && !season) continue;
        log(
          `  ${screening.id} ${screening.cinemaId} ${screening.datetime.toISOString()}` +
            (description ? ` note "${description}"` : "") +
            (season ? ` season "${season}"` : ""),
        );
      }
      if (!execute) continue;
      if (source.title !== to) {
        await db.update(films).set({ title: to, updatedAt: now }).where(eq(films.id, source.id));
      }
      for (const screening of upcoming) {
        const description = repairedEventDescription(screening.eventDescription, note, strand);
        const season = repairedSeason(screening.season, strand);
        if (!description && !season) continue;
        await db
          .update(screenings)
          .set({
            ...(description ? { eventDescription: description } : {}),
            ...(season ? { season } : {}),
            updatedAt: now,
          })
          .where(eq(screenings.id, screening.id));
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
