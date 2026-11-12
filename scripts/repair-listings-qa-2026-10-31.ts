#!/usr/bin/env tsx
/**
 * Repair the 31 Oct 2026 listings QA rows. Dry-run unless --execute.
 * Not run against production by the change that added it. Film rows are not deleted.
 *
 * Titles
 *   "Festive Fun with Peppa Cinema Experience" → Festive Fun with Peppa.
 *     Upcoming screenings move onto the film that already has that title,
 *     preferring one TMDB knows. A move that would share film + cinema +
 *     datetime deletes the extra screening.
 *   "SLA 2026: …" → the film after the colon. Note and season "SLA 2026".
 *     An existing note such as "(4K restoration)" is left as it is.
 *   "Italian cocktails, Morricone musical intro + Ennio" → Ennio.
 *     The cocktails line replaces a note that is only "Ennio".
 *   "'Wicker Sour' cocktails, straw man making + Wicker" → Wicker, same rule.
 *   "All Out Of Bubblegum Film Club: THE SHINING" → The Shining, preferring
 *     a 1980 row. Note and season are the club name.
 *
 * Ticket copies
 *   Upcoming screenings that share a cinema, clock, screen, and showing-specific
 *   booking URL are reduced to one when their titles clean to the same film.
 *   Garden's Spanish/English pair does not, and is left for draft #854.
 *
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-10-31.ts
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-10-31.ts --execute
 */

import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { films } from "@/db/schema/films";
import { screenings } from "@/db/schema/screenings";
import { bookingUrlIdentifiesAShowing } from "@/scrapers/utils/screening-classification";
import {
  LISTING_QA_2026_10_31_TITLES,
  chooseTicketSurvivor,
  destinationTitle,
  listingEventNote,
  pickCanonicalFilm,
  repairedEventDescription,
  repairedSeason,
  strandSeasonNote,
} from "@/scrapers/utils/listings-qa-2026-10-31";

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
  for (const from of LISTING_QA_2026_10_31_TITLES) {
    const to = destinationTitle(from);
    const note = listingEventNote(from);
    const strand = strandSeasonNote(from);
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
          const description = repairedEventDescription(screening.eventDescription, to, note);
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
        const description = repairedEventDescription(screening.eventDescription, to, note);
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
        const description = repairedEventDescription(screening.eventDescription, to, note);
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

async function repairSharedTickets(now: Date): Promise<void> {
  const rows = await db
    .select({
      id: screenings.id,
      cinemaId: screenings.cinemaId,
      datetime: screenings.datetime,
      bookingUrl: screenings.bookingUrl,
      screen: screenings.screen,
      filmTitle: films.title,
      tmdbId: films.tmdbId,
    })
    .from(screenings)
    .innerJoin(films, eq(films.id, screenings.filmId))
    .where(gte(screenings.datetime, now));

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!bookingUrlIdentifiesAShowing(row.bookingUrl)) continue;
    const key = [
      row.cinemaId,
      row.datetime.toISOString(),
      row.bookingUrl,
      (row.screen ?? "").trim().toLowerCase(),
    ].join("\0");
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    const plan = chooseTicketSurvivor(group);
    if (!plan) continue;
    for (const row of plan.drop) {
      log(
        `delete extra ticket copy ${row.id} "${row.filmTitle}" (keeping ${plan.keep.id} "${plan.keep.filmTitle}")`,
      );
      if (!execute) continue;
      await db.delete(screenings).where(eq(screenings.id, row.id));
    }
  }
}

async function main(): Promise<void> {
  const now = new Date();
  await repairTitles(now);
  await repairSharedTickets(now);
  if (!execute) console.log("Dry run. Pass --execute to write.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
