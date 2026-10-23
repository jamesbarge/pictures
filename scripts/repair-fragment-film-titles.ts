/**
 * Rewrite film rows whose title is a fragment of the venue's event line.
 *
 * The 17 Oct 2026 listings QA stored titles such as "2026-27: Macbeth" and
 * "Series 3". The cleaner now produces the real name on the next scrape.
 * Where the screening source id does not include the title (Picturehouse,
 * BFI, Genesis), that scrape points the existing screening at the new film.
 * Where the source id includes the title (Garden, Barbican, ICA), the old
 * screening stays on the fragment row. This script rewrites that row in
 * place so the showing and the next scrape share one film.
 *
 * Dry-run unless --execute is passed. Updates title, and directors or year
 * only when the repair says so. It does not delete films or screenings.
 *
 *   npx tsx -r tsconfig-paths/register scripts/repair-fragment-film-titles.ts
 *   npx tsx -r tsconfig-paths/register scripts/repair-fragment-film-titles.ts --execute
 */

import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db, isDatabaseAvailable } from "@/db";
import { films, screenings } from "@/db/schema";
import {
  FRAGMENT_REPAIR_TITLES,
  repairFragmentFilm,
  type FragmentFilmRepair,
} from "@/scrapers/utils/film-title-cleaner";

const EXECUTE = process.argv.includes("--execute");

interface Candidate {
  id: string;
  title: string;
  directors: string[];
  year: number | null;
  bookingUrls: string[];
}

async function loadCandidates(): Promise<Candidate[]> {
  const rows = await db
    .select({
      id: films.id,
      title: films.title,
      directors: films.directors,
      year: films.year,
      bookingUrl: screenings.bookingUrl,
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(and(
      gte(screenings.datetime, new Date()),
      or(
        inArray(films.title, FRAGMENT_REPAIR_TITLES),
        sql`${films.directors}::text LIKE '%:%'`,
      ),
    ));

  const byId = new Map<string, Candidate>();
  for (const row of rows) {
    const existing = byId.get(row.id);
    if (existing) {
      if (!existing.bookingUrls.includes(row.bookingUrl)) existing.bookingUrls.push(row.bookingUrl);
      continue;
    }
    byId.set(row.id, {
      id: row.id,
      title: row.title,
      directors: row.directors,
      year: row.year,
      bookingUrls: [row.bookingUrl],
    });
  }
  return [...byId.values()];
}

function plan(candidate: Candidate): FragmentFilmRepair | null {
  const urls = candidate.bookingUrls.length > 0 ? candidate.bookingUrls : [null];
  for (const bookingUrl of urls) {
    const repair = repairFragmentFilm({
      title: candidate.title,
      directors: candidate.directors,
      year: candidate.year,
      bookingUrl,
    });
    if (repair) return repair;
  }
  return null;
}

async function main(): Promise<void> {
  if (!isDatabaseAvailable) {
    console.log("DATABASE_URL is not set. Nothing was read or written.");
    return;
  }

  const candidates = await loadCandidates();
  const repairs = candidates.flatMap((candidate) => {
    const repair = plan(candidate);
    return repair ? [{ candidate, repair }] : [];
  });

  console.log(`${EXECUTE ? "Applying" : "Dry run"}: ${repairs.length} film(s) of ${candidates.length} candidate(s).`);
  for (const { candidate, repair } of repairs) {
    console.log(`  "${candidate.title}" -> "${repair.title}" (${candidate.id})`);
    if (repair.directors.length !== candidate.directors.length) {
      console.log(`    directors ${JSON.stringify(candidate.directors)} -> ${JSON.stringify(repair.directors)}`);
    }
    if (repair.year !== candidate.year) {
      console.log(`    year ${candidate.year ?? "null"} -> ${repair.year ?? "null"}`);
    }
  }

  if (!EXECUTE) {
    console.log("Pass --execute to write these updates. No rows were changed.");
    return;
  }

  for (const { candidate, repair } of repairs) {
    await db
      .update(films)
      .set({
        title: repair.title,
        directors: repair.directors,
        year: repair.year,
        updatedAt: new Date(),
      })
      .where(eq(films.id, candidate.id));
  }
  console.log(`Updated ${repairs.length} film(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
