#!/usr/bin/env tsx
/**
 * Repair the 24 Oct 2026 listings QA rows. Dry-run unless --execute.
 * Not run against production by the change that added it.
 *
 * Titles
 *   "BFI IMAX exclusive preview: Godzilla Minus Zero" → Godzilla Minus Zero,
 *     note "BFI IMAX exclusive preview". Screenings move onto the film that
 *     already has that title when one exists. The junk film row is left in place.
 *   "Special preview: La Bola Negra" → La Bola Negra. A director equal to the
 *     raw title is removed. Note "Special preview".
 *   "Women and the World Festival: Traces" → Traces. Note "Women and the World Festival".
 *     The Curzon Bloomsbury / Bertha DocHouse duplicate showing is not deleted
 *     here (draft #837).
 *
 * Garden
 *   Screenings that share a TcsPerformance id are checked against the public
 *   booking page. On 24 Oct 2026, 6266328 is The Social Reckoning (15),
 *   Tuesday 27 Oct 2026, 3:45pm. The Fatherland row at 16:00Z with that URL
 *   is deleted. Film rows are not deleted.
 *
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-10-24.ts
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-10-24.ts --execute
 */

import { and, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import { films } from "@/db/schema/films";
import { screenings } from "@/db/schema/screenings";
import {
  gardenPerformanceId,
  parseGardenBookingHeading,
  resolveSharedGardenPerformance,
  type GardenBookingHeading,
} from "@/scrapers/cinemas/garden-performance";
import {
  LISTING_TITLE_REPAIRS,
  directorsWithoutCopiedTitle,
} from "@/scrapers/utils/listings-qa-2026-10-24";

const execute = process.argv.includes("--execute");

function log(line: string): void {
  console.log(`${execute ? "APPLY" : "DRY"} ${line}`);
}

async function repairTitles(now: Date): Promise<void> {
  for (const repair of LISTING_TITLE_REPAIRS) {
    const sources = await db.select().from(films).where(eq(films.title, repair.from));
    if (sources.length === 0) {
      log(`title "${repair.from}": no film row`);
      continue;
    }
    const candidates = await db.select().from(films).where(eq(films.title, repair.to));

    for (const source of sources) {
      const canonical = candidates
        .filter((film) => film.id !== source.id)
        .sort((a, b) => Number(Boolean(b.tmdbId)) - Number(Boolean(a.tmdbId)) || Number(Boolean(b.year)) - Number(Boolean(a.year)))[0];

      const upcoming = await db
        .select()
        .from(screenings)
        .where(and(eq(screenings.filmId, source.id), gte(screenings.datetime, now)));

      if (canonical) {
        log(
          `move ${upcoming.length} screening(s) of "${repair.from}" (${source.id}) onto "${repair.to}" (${canonical.id})`,
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

      const directors = directorsWithoutCopiedTitle(source.directors ?? [], repair.from);
      log(
        `rename film ${source.id} "${repair.from}" → "${repair.to}"` +
          (directors.length === (source.directors ?? []).length ? "" : `; directors ${JSON.stringify(source.directors)} → ${JSON.stringify(directors)}`),
      );
      for (const screening of upcoming) {
        if (screening.eventDescription) continue;
        log(`  note on ${screening.id} ${screening.cinemaId} ${screening.datetime.toISOString()}: "${repair.note}"`);
      }
      if (!execute) continue;
      await db
        .update(films)
        .set({ title: repair.to, directors, updatedAt: now })
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

async function readHeading(url: string): Promise<GardenBookingHeading | null> {
  const response = await fetch(url, {
    headers: { "User-Agent": "pictures-listings-qa/2026-10-24", Accept: "text/html" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;
  return parseGardenBookingHeading(await response.text());
}

async function repairGarden(now: Date): Promise<void> {
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

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const id = gardenPerformanceId(row.bookingUrl);
    if (!id) continue;
    const list = groups.get(id) ?? [];
    list.push(row);
    groups.set(id, list);
  }

  for (const [id, group] of groups) {
    const distinct = new Set(group.map((row) => `${row.filmTitle}\0${row.datetime.toISOString()}`));
    if (distinct.size < 2) continue;
    const heading = await readHeading(group[0].bookingUrl);
    const plan = resolveSharedGardenPerformance(group, heading);
    if (!heading || plan.drop.length === 0) {
      log(
        `garden TcsPerformance_${id}: ${group.length} rows, booking page ${heading ? "did not match one of them" : "unreadable"}; no delete`,
      );
      continue;
    }
    for (const row of plan.drop) {
      log(
        `delete garden screening ${row.id} "${row.filmTitle}" ${row.datetime.toISOString()} — TcsPerformance_${id} is "${heading.title}" ${heading.date} ${heading.time}`,
      );
    }
    if (!execute) continue;
    await db.delete(screenings).where(
      inArray(
        screenings.id,
        plan.drop.map((row) => row.id),
      ),
    );
  }
}

async function main(): Promise<void> {
  console.log(execute ? "Executing." : "Dry run. Pass --execute to write. Film rows are not deleted.");
  const now = new Date();
  await repairTitles(now);
  await repairGarden(now);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
