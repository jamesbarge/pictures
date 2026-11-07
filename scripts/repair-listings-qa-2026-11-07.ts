#!/usr/bin/env tsx
/**
 * Repair the 7 Nov 2026 listings QA rows. Dry-run unless --execute.
 * Not run against production by the change that added it. Film rows are
 * not deleted.
 *
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-11-07.ts
 *   npx tsx -r tsconfig-paths/register scripts/repair-listings-qa-2026-11-07.ts --execute
 *
 * Titles already stored under a strand or a truncated card are renamed, or
 * their upcoming screenings move onto an existing film of the cleaned title.
 * A Prince Charles screening of Tenet (2026) or Blue Velvet (2011) moves
 * only when a film of the page's year already exists; otherwise the next
 * scrape, which now sends that year, does it. DocHouse screenings of the
 * 1915 "The Great Experiment" move onto a current row of that title.
 */

import { and, eq, gte, inArray, like } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { db } from "@/db";
import { films } from "@/db/schema/films";
import { screenings } from "@/db/schema/screenings";
import { cleanFilmTitle, listingEventNote } from "@/scrapers/utils/film-title-cleaner";
import { splitDirectorCredit } from "@/scrapers/utils/film-write-guards";

const execute = process.argv.includes("--execute");

const TITLE_REPAIRS: Array<{ from: string; to: string; note: string | null; year?: number }> = [
  {
    from: "Hubley Hash...",
    to: "Hubley Hash + music with trumpeter Olivia Cuttill",
    note: "Reverie Cineclub Presents",
  },
  {
    from: "Blues Like Showers of Rain & Jazz Is Our...",
    to: "Blues Like Showers of Rain & Jazz Is Our Religion",
    note: "Jazz on Screen",
  },
  {
    from: "I Am Furious Black: The Films of Madeline Anderson and ...",
    to: "The Films of Madeline Anderson and St. Clair Bourne 1960-1974",
    note: null,
  },
  { from: "Narrow Margin Presents The Tall T", to: "The Tall T", note: "Narrow Margin Presents", year: 1957 },
  { from: "Nolan in 35mm: The Prestige", to: "The Prestige", note: "Nolan in 35mm", year: 2006 },
  { from: "Parents & Baby Screening - Wicker", to: "Wicker", note: "Parents & Baby Screening" },
];

function log(line: string): void {
  console.log(`${execute ? "APPLY" : "DRY"} ${line}`);
}

async function upcomingOf(filmId: string, now: Date) {
  return db
    .select()
    .from(screenings)
    .where(and(eq(screenings.filmId, filmId), gte(screenings.datetime, now)));
}

async function moveOrRename(
  source: typeof films.$inferSelect,
  to: string,
  note: string | null,
  now: Date,
  year?: number,
  rejectBeforeYear?: number,
): Promise<void> {
  const candidates = await db.select().from(films).where(eq(films.title, to));
  const canonical = candidates
    .filter((film) => film.id !== source.id)
    .filter((film) => year == null || film.year == null || Math.abs((film.year ?? year) - year) <= 1)
    .filter((film) => rejectBeforeYear == null || film.year == null || film.year >= rejectBeforeYear)
    .sort(
      (a, b) =>
        Number(Boolean(b.tmdbId)) - Number(Boolean(a.tmdbId)) ||
        Number(a.year != null && year != null && a.year === year) -
          Number(b.year != null && year != null && b.year === year),
    )[0];

  const rows = await upcomingOf(source.id, now);
  if (canonical) {
    log(`move ${rows.length} screening(s) of "${source.title}" (${source.id}) onto "${to}" (${canonical.id})`);
    for (const screening of rows) {
      log(`  screening ${screening.id} ${screening.cinemaId} ${screening.datetime.toISOString()}`);
      if (!execute) continue;
      try {
        await db
          .update(screenings)
          .set({
            filmId: canonical.id,
            ...(screening.eventDescription || !note ? {} : { eventDescription: note }),
            updatedAt: now,
          })
          .where(eq(screenings.id, screening.id));
      } catch (error) {
        const code =
          (error as { cause?: { code?: string }; code?: string }).cause?.code ??
          (error as { code?: string }).code;
        if (code !== "23505") throw error;
        log(`  screening ${screening.id} already exists on the destination; deleting the extra`);
        await db.delete(screenings).where(eq(screenings.id, screening.id));
      }
    }
    return;
  }

  const directors = splitDirectorCredit(source.directors?.length === 1 ? source.directors[0] : undefined);
  const nextDirectors = directors.length > 1 ? directors : (source.directors ?? []);
  log(`rename film ${source.id} "${source.title}" → "${to}"`);
  if (!execute) return;
  await db
    .update(films)
    .set({ title: to, directors: nextDirectors, updatedAt: now })
    .where(eq(films.id, source.id));
  if (!note) return;
  const untitled = rows.filter((screening) => !screening.eventDescription).map((screening) => screening.id);
  if (untitled.length > 0) {
    await db
      .update(screenings)
      .set({ eventDescription: note, updatedAt: now })
      .where(inArray(screenings.id, untitled));
  }
}

async function repairKnownTitles(now: Date): Promise<void> {
  for (const repair of TITLE_REPAIRS) {
    const sources = await db.select().from(films).where(eq(films.title, repair.from));
    if (sources.length === 0) {
      log(`title "${repair.from}": no film row`);
      continue;
    }
    for (const source of sources) {
      await moveOrRename(source, repair.to, repair.note, now, repair.year);
    }
  }
}

async function repairLdndocs(now: Date): Promise<void> {
  const sources = await db.select().from(films).where(like(films.title, "LDNDOCS%"));
  for (const source of sources) {
    const to = cleanFilmTitle(source.title);
    if (!to || to === source.title) continue;
    // A peeled LDNDOCS title must not land on the silent namesake.
    await moveOrRename(source, to, listingEventNote(source.title), now, undefined, new Date().getFullYear() - 3);
  }
}

async function repairBritishShorts(now: Date): Promise<void> {
  const sources = await db.select().from(films).where(eq(films.title, "British Shorts (Block 1)"));
  for (const source of sources) {
    const rows = await upcomingOf(source.id, now);
    const block2 = rows.filter((screening) => screening.bookingUrl.toLowerCase().includes("block-2"));
    if (block2.length === 0) continue;
    const existing = await db.select().from(films).where(eq(films.title, "British Shorts (Block 2)"));
    let destinationId = existing[0]?.id;
    log(`move ${block2.length} Block 2 screening(s) off "${source.title}" (${source.id})`);
    if (!destinationId && execute) {
      destinationId = uuidv4();
      await db.insert(films).values({
        id: destinationId,
        title: "British Shorts (Block 2)",
        directors: [],
      });
    }
    for (const screening of block2) {
      log(`  screening ${screening.id} ${screening.bookingUrl}`);
      if (!execute || !destinationId) continue;
      await db
        .update(screenings)
        .set({ filmId: destinationId, updatedAt: now })
        .where(eq(screenings.id, screening.id));
    }
  }
}

async function repairGreatExperiment(now: Date): Promise<void> {
  const sources = await db
    .select()
    .from(films)
    .where(and(eq(films.title, "The Great Experiment"), eq(films.year, 1915)));
  for (const source of sources) {
    const rows = (await upcomingOf(source.id, now)).filter(
      (screening) => screening.cinemaId === "bertha-dochouse",
    );
    if (rows.length === 0) continue;
    const candidates = await db.select().from(films).where(eq(films.title, "The Great Experiment"));
    let destination = candidates.find(
      (film) =>
        film.id !== source.id &&
        (film.year == null || film.year >= 2020) &&
        !(film.directors ?? []).includes("Tom Santschi"),
    );
    log(`move ${rows.length} DocHouse screening(s) off the 1915 film ${source.id}`);
    if (!destination && execute) {
      const id = uuidv4();
      await db.insert(films).values({
        id,
        title: "The Great Experiment",
        runtime: 100,
        directors: ["Stephen Maing", "Eric Daniel Metzgar"],
        posterUrl: source.posterUrl,
        isRepertory: false,
      });
      destination = { ...source, id, year: null, tmdbId: null, directors: ["Stephen Maing", "Eric Daniel Metzgar"] };
    }
    if (!destination) {
      log("  no current film yet; left for the next DocHouse scrape");
      continue;
    }
    for (const screening of rows) {
      log(`  screening ${screening.id} ${screening.datetime.toISOString()}`);
      if (!execute) continue;
      try {
        await db
          .update(screenings)
          .set({ filmId: destination.id, updatedAt: now })
          .where(eq(screenings.id, screening.id));
      } catch (error) {
        const code =
          (error as { cause?: { code?: string }; code?: string }).cause?.code ??
          (error as { code?: string }).code;
        if (code !== "23505") throw error;
        await db.delete(screenings).where(eq(screenings.id, screening.id));
      }
    }
  }
}

async function moveNamesake(
  cinemaId: string,
  title: string,
  fromYear: number,
  toYear: number,
  now: Date,
): Promise<void> {
  const sources = await db
    .select()
    .from(films)
    .where(and(eq(films.title, title), eq(films.year, fromYear)));
  const destinations = await db
    .select()
    .from(films)
    .where(and(eq(films.title, title), eq(films.year, toYear)));
  const destination = destinations.find((film) => film.tmdbId) ?? destinations[0];
  if (!destination) {
    log(`${title} ${toYear}: no film row yet; ${cinemaId} screenings stay until the next scrape`);
    return;
  }
  for (const source of sources) {
    const rows = (await upcomingOf(source.id, now)).filter((screening) => screening.cinemaId === cinemaId);
    if (rows.length === 0) continue;
    log(`move ${rows.length} ${cinemaId} screening(s) of ${title} (${fromYear}) onto ${destination.id} (${toYear})`);
    for (const screening of rows) {
      if (!execute) continue;
      try {
        await db
          .update(screenings)
          .set({ filmId: destination.id, updatedAt: now })
          .where(eq(screenings.id, screening.id));
      } catch (error) {
        const code =
          (error as { cause?: { code?: string }; code?: string }).cause?.code ??
          (error as { code?: string }).code;
        if (code !== "23505") throw error;
        await db.delete(screenings).where(eq(screenings.id, screening.id));
      }
    }
  }
}

async function splitGluedDirectors(now: Date): Promise<void> {
  // Only the credit verified on the Phoenix page. A shared surname
  // ("Joel and Ethan Coen") does not split, and other films are left alone.
  const glued = "Alex Huston Fischer and Eleanor Wilson";
  const rows = await db.select().from(films).where(eq(films.title, "Wicker"));
  for (const film of rows) {
    if (film.tmdbId) continue;
    if ((film.directors ?? []).join("|") !== glued) continue;
    const split = splitDirectorCredit(glued);
    log(`directors on ${film.id} "${film.title}": ${JSON.stringify(film.directors)} → ${JSON.stringify(split)}`);
    if (!execute) continue;
    await db.update(films).set({ directors: split, updatedAt: now }).where(eq(films.id, film.id));
  }
}

async function main(): Promise<void> {
  const now = new Date();
  await repairKnownTitles(now);
  await repairLdndocs(now);
  await repairBritishShorts(now);
  await repairGreatExperiment(now);
  await moveNamesake("prince-charles", "Tenet", 2026, 2020, now);
  await moveNamesake("prince-charles", "Blue Velvet", 2011, 1986, now);
  await splitGluedDirectors(now);
  log(execute ? "done" : "dry run only");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
