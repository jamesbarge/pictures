/**
 * Fix the Boy and the World (Brazilian 2012 animation, TMDB 226383) film link.
 * The DB row 960847a6-d5ec-4ab7-bed5-4b54e93e0464 currently has an incorrect
 * TMDB ID that resolves to a film titled "Rumblestrips".
 */

import { db } from "@/db";
import { films } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTMDBClient } from "@/lib/tmdb";

const FILM_ID = "960847a6-d5ec-4ab7-bed5-4b54e93e0464";
const CORRECT_TMDB_ID = 223706;

async function main() {
  const apply = process.argv.includes("--apply");
  const tmdb = getTMDBClient();

  // Verify the target TMDB ID actually is Boy and the World
  const data = await tmdb.getFullFilmData(CORRECT_TMDB_ID);
  console.log(`TMDB ${CORRECT_TMDB_ID}:`);
  console.log(`  title:           ${data.details.title}`);
  console.log(`  original_title:  ${data.details.original_title}`);
  console.log(`  release_date:    ${data.details.release_date}`);
  console.log(`  runtime:         ${data.details.runtime}`);
  console.log(`  directors:       ${data.directors.join(", ")}`);

  const titleOk = data.details.title === "Boy & the World" || data.details.title === "Boy and the World";
  const origOk = data.details.original_title === "O Menino e o Mundo";
  if (!titleOk && !origOk) {
    console.error(`\nTMDB ${CORRECT_TMDB_ID} does NOT match expected film. Aborting.`);
    process.exit(1);
  }

  // Read current DB row
  const [current] = await db.select().from(films).where(eq(films.id, FILM_ID));
  if (!current) {
    console.error(`Film ${FILM_ID} not found in DB`);
    process.exit(1);
  }
  console.log(`\nCurrent DB row:`);
  console.log(`  title:    ${current.title}`);
  console.log(`  year:     ${current.year}`);
  console.log(`  tmdb_id:  ${current.tmdbId}`);
  console.log(`  runtime:  ${current.runtime}`);
  console.log(`  directors:${JSON.stringify(current.directors)}`);

  const tmdbYear = data.details.release_date ? parseInt(data.details.release_date.slice(0, 4), 10) : null;

  if (!apply) {
    console.log(`\n[DRY-RUN] Would set:`);
    console.log(`  tmdb_id   = ${CORRECT_TMDB_ID}`);
    console.log(`  year      = ${tmdbYear}`);
    console.log(`  runtime   = ${data.details.runtime}`);
    console.log(`  directors = ${JSON.stringify(data.directors)}`);
    console.log(`  poster_url= [from TMDB]`);
    console.log(`  synopsis  = ${(data.details.overview ?? "").slice(0, 80)}…`);
    console.log(`  is_repertory = true  (2012 film screening in 2026)`);
    console.log(`\nRe-run with --apply.`);
    process.exit(0);
  }

  const posterUrl = data.details.poster_path
    ? `https://image.tmdb.org/t/p/w500${data.details.poster_path}`
    : null;

  await db
    .update(films)
    .set({
      tmdbId: CORRECT_TMDB_ID,
      year: tmdbYear,
      runtime: data.details.runtime ?? null,
      directors: data.directors,
      posterUrl,
      synopsis: data.details.overview ?? null,
      isRepertory: true,
      updatedAt: new Date(),
    })
    .where(eq(films.id, FILM_ID));

  console.log(`\nUpdated ${FILM_ID}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
