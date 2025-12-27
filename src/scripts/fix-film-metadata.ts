/**
 * Fix Film Metadata
 * Fetches correct metadata from TMDB for manually corrected films
 */

import postgres from "postgres";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL not set");
}

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  runtime: number;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  genres: Array<{ id: number; name: string }>;
  production_countries: Array<{ iso_3166_1: string; name: string }>;
  credits?: {
    crew: Array<{ job: string; name: string }>;
    cast: Array<{ name: string; character: string; order: number }>;
  };
}

async function fetchAndUpdateFilm(
  sql: postgres.Sql,
  tmdbId: number
): Promise<void> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    console.error("TMDB_API_KEY not set");
    return;
  }

  const response = await fetch(
    `${TMDB_BASE}/movie/${tmdbId}?api_key=${apiKey}&append_to_response=credits`
  );

  if (!response.ok) {
    console.error(`Failed to fetch TMDB ${tmdbId}: ${response.status}`);
    return;
  }

  const data: TMDBMovie = await response.json();

  // Extract directors from credits
  const directors =
    data.credits?.crew
      ?.filter((c) => c.job === "Director")
      ?.map((c) => c.name) || [];

  // Extract top cast
  const cast =
    data.credits?.cast?.slice(0, 10)?.map((c) => ({
      name: c.name,
      character: c.character,
      order: c.order,
    })) || [];

  const year = data.release_date
    ? parseInt(data.release_date.split("-")[0])
    : null;

  const posterUrl = data.poster_path
    ? `${TMDB_IMAGE_BASE}${data.poster_path}`
    : null;

  const backdropUrl = data.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`
    : null;

  const genres = data.genres?.map((g) => g.name) || [];
  const countries = data.production_countries?.map((c) => c.iso_3166_1) || [];

  // Update scalar fields (array fields already set during initial fix)
  await sql`
    UPDATE films SET
      title = ${data.title},
      original_title = ${data.original_title},
      year = ${year},
      runtime = ${data.runtime},
      synopsis = ${data.overview},
      poster_url = ${posterUrl},
      backdrop_url = ${backdropUrl},
      tmdb_rating = ${data.vote_average},
      updated_at = NOW()
    WHERE tmdb_id = ${tmdbId}
  `;

  console.log(
    `✓ Updated: "${data.title}" (${year}) - Directors: ${directors.join(", ")}`
  );
  console.log(`  Poster: ${posterUrl ? "Yes" : "No"}`);
  console.log(`  Synopsis: ${data.overview?.slice(0, 80)}...`);
}

async function main() {
  const sql = postgres(connectionString, { max: 1 });

  console.log("Fetching correct metadata from TMDB...\n");

  // Fix Ten (Kiarostami, 2002)
  await fetchAndUpdateFilm(sql, 14633);

  // Fix Evolution (Hadžihalilović, 2015)
  await fetchAndUpdateFilm(sql, 330770);

  await sql.end();
  console.log("\nDone!");
}

main().catch(console.error);
