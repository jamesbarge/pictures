#!/usr/bin/env tsx
/**
 * Repair the 13 Nov 2026 listings QA rows. Dry-run unless --execute.
 * Not run against production by the change that added it. Film rows are
 * not deleted.
 *
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-11-13.ts
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-11-13.ts --execute
 *
 * Close-Up "alker" (TicketSource e-eaoamek, 27 Nov 2026 20:15Z) moves onto
 * Stalker. The search-page source id is rewritten from `-alker` to
 * `-stalker` so the next scrape updates that row.
 *
 * Album titles that lost their closing quote are renamed, or their upcoming
 * screenings move onto a film that already has the quote. A note that is
 * only the stray quote plus the anniversary is rewritten without the quote.
 *
 * A unique-key collision leaves the original screening in place. Festival
 * tags and user schedule rows cascade-delete with a screening, so this
 * script does not delete one.
 */

import { and, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import { films } from "@/db/schema/films";
import { screenings } from "@/db/schema/screenings";
import {
  noteWithoutStrayQuote,
  QUOTE_TITLE_REPAIRS,
  restoredAlkerSourceId,
} from "@/scrapers/utils/listings-qa-2026-11-13";

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

async function upcomingOf(filmId: string, now: Date) {
  return db
    .select()
    .from(screenings)
    .where(and(eq(screenings.filmId, filmId), gte(screenings.datetime, now)));
}

async function repairAlker(now: Date): Promise<void> {
  const sources = await db.select().from(films).where(eq(films.title, "alker"));
  if (sources.length === 0) {
    log('title "alker": no film row');
    return;
  }
  const stalkers = await db.select().from(films).where(eq(films.title, "Stalker"));
  for (const source of sources) {
    const rows = (await upcomingOf(source.id, now)).filter(
      (screening) => screening.cinemaId === "close-up-cinema",
    );
    if (rows.length === 0) {
      log(`film ${source.id} "alker": no upcoming Close-Up screening`);
      continue;
    }
    const canonical = stalkers
      .filter((film) => film.id !== source.id)
      .sort(
        (a, b) =>
          Number(b.year === 1979) - Number(a.year === 1979) ||
          Number(Boolean(b.tmdbId)) - Number(Boolean(a.tmdbId)),
      )[0];

    if (!canonical) {
      log(`rename film ${source.id} "alker" → "Stalker" (${rows.length} Close-Up screening(s))`);
      for (const screening of rows) {
        const sourceId = restoredAlkerSourceId(screening.sourceId);
        if (sourceId !== screening.sourceId) {
          log(`  sourceId ${screening.sourceId} → ${sourceId}`);
        }
      }
      if (!execute) continue;
      await db.transaction(async (tx) => {
        await tx.update(films).set({ title: "Stalker", updatedAt: now }).where(eq(films.id, source.id));
        for (const screening of rows) {
          const sourceId = restoredAlkerSourceId(screening.sourceId);
          if (!sourceId || sourceId === screening.sourceId) continue;
          const taken = await tx
            .select({ id: screenings.id })
            .from(screenings)
            .where(and(eq(screenings.cinemaId, screening.cinemaId), eq(screenings.sourceId, sourceId)));
          if (taken.length > 0) {
            log(`  sourceId ${sourceId} already used by ${taken[0].id}; kept ${screening.sourceId}`);
            continue;
          }
          await tx
            .update(screenings)
            .set({ sourceId, updatedAt: now })
            .where(eq(screenings.id, screening.id));
        }
      });
      continue;
    }

    log(
      `move ${rows.length} Close-Up screening(s) of "alker" (${source.id}) onto "Stalker" (${canonical.id}` +
        `${canonical.year ? `, ${canonical.year}` : ""})`,
    );
    for (const screening of rows) {
      const sourceId = restoredAlkerSourceId(screening.sourceId);
      log(
        `  screening ${screening.id} ${screening.datetime.toISOString()} ${screening.bookingUrl}` +
          (sourceId === screening.sourceId ? "" : ` sourceId ${screening.sourceId} → ${sourceId}`),
      );
      if (!execute) continue;
      const already = await db
        .select({ id: screenings.id })
        .from(screenings)
        .where(
          and(
            eq(screenings.filmId, canonical.id),
            eq(screenings.cinemaId, screening.cinemaId),
            eq(screenings.datetime, screening.datetime),
          ),
        );
      if (already.length > 0) {
        log(
          `  screening ${screening.id} left in place: Stalker already has ${screening.cinemaId} at ${screening.datetime.toISOString()} (${already[0].id})`,
        );
        continue;
      }
      try {
        await db
          .update(screenings)
          .set({ filmId: canonical.id, updatedAt: now })
          .where(eq(screenings.id, screening.id));
      } catch (error) {
        if (pgCode(error) !== "23505") throw error;
        log(`  screening ${screening.id} left in place: film move hit a unique key`);
        continue;
      }
      if (!sourceId || sourceId === screening.sourceId) continue;
      const taken = await db
        .select({ id: screenings.id })
        .from(screenings)
        .where(and(eq(screenings.cinemaId, screening.cinemaId), eq(screenings.sourceId, sourceId)));
      if (taken.length > 0) {
        log(`  sourceId ${sourceId} already used by ${taken[0].id}; kept ${screening.sourceId}`);
        continue;
      }
      try {
        await db
          .update(screenings)
          .set({ sourceId, updatedAt: now })
          .where(eq(screenings.id, screening.id));
      } catch (error) {
        if (pgCode(error) !== "23505") throw error;
        log(`  sourceId ${sourceId} collided; kept ${screening.sourceId}`);
      }
    }
  }
}

async function repairQuotedAlbums(now: Date): Promise<void> {
  for (const repair of QUOTE_TITLE_REPAIRS) {
    const sources = await db.select().from(films).where(eq(films.title, repair.from));
    if (sources.length === 0) {
      log(`title "${repair.from}": no film row`);
      continue;
    }
    const candidates = await db.select().from(films).where(eq(films.title, repair.to));
    for (const source of sources) {
      const rows = await upcomingOf(source.id, now);
      const canonical = candidates.find((film) => film.id !== source.id);
      if (canonical) {
        log(`move ${rows.length} screening(s) of "${repair.from}" (${source.id}) onto "${repair.to}" (${canonical.id})`);
        for (const screening of rows) {
          const note = noteWithoutStrayQuote(screening.eventDescription);
          log(`  screening ${screening.id} ${screening.cinemaId} ${screening.datetime.toISOString()}`);
          if (!execute) continue;
          const already = await db
            .select({ id: screenings.id })
            .from(screenings)
            .where(
              and(
                eq(screenings.filmId, canonical.id),
                eq(screenings.cinemaId, screening.cinemaId),
                eq(screenings.datetime, screening.datetime),
              ),
            );
          if (already.length > 0) {
            log(
              `  screening ${screening.id} left in place: "${repair.to}" already has ${screening.cinemaId} at ${screening.datetime.toISOString()} (${already[0].id})`,
            );
            continue;
          }
          try {
            await db
              .update(screenings)
              .set({
                filmId: canonical.id,
                ...(note ? { eventDescription: note } : {}),
                updatedAt: now,
              })
              .where(eq(screenings.id, screening.id));
          } catch (error) {
            if (pgCode(error) !== "23505") throw error;
            log(`  screening ${screening.id} left in place: film move hit a unique key`);
          }
        }
        continue;
      }

      log(`rename film ${source.id} "${repair.from}" → "${repair.to}"`);
      for (const screening of rows) {
        const note = noteWithoutStrayQuote(screening.eventDescription);
        if (note) log(`  note on ${screening.id}: ${JSON.stringify(screening.eventDescription)} → ${JSON.stringify(note)}`);
      }
      if (!execute) continue;
      await db.transaction(async (tx) => {
        await tx.update(films).set({ title: repair.to, updatedAt: now }).where(eq(films.id, source.id));
        for (const screening of rows) {
          const note = noteWithoutStrayQuote(screening.eventDescription);
          if (!note) continue;
          await tx
            .update(screenings)
            .set({ eventDescription: note, updatedAt: now })
            .where(eq(screenings.id, screening.id));
        }
      });
    }
  }
}

async function main(): Promise<void> {
  const now = new Date();
  await repairAlker(now);
  await repairQuotedAlbums(now);
  log(execute ? "done" : "dry run only");
}

const invokedAsScript = process.argv[1]?.includes("repair-listings-qa-2026-11-13");
if (invokedAsScript) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
