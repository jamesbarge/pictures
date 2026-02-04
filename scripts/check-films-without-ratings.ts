import { db } from '../src/db';
import { films, screenings } from '../src/db/schema';
import { eq, isNull, gte, and, sql } from 'drizzle-orm';

async function checkFilmsWithoutRatings() {
  const now = new Date();

  // Films with upcoming screenings that need Letterboxd ratings
  const filmsWithoutRating = await db
    .selectDistinct({
      id: films.id,
      title: films.title,
      year: films.year,
      contentType: films.contentType,
      tmdbId: films.tmdbId,
    })
    .from(films)
    .innerJoin(screenings, eq(films.id, screenings.filmId))
    .where(
      and(
        isNull(films.letterboxdRating),
        gte(screenings.datetime, now),
        eq(films.contentType, 'film') // Only actual films
      )
    );

  console.log(`Films without Letterboxd ratings: ${filmsWithoutRating.length}\n`);

  // Categorize them
  const withTmdb = filmsWithoutRating.filter(f => f.tmdbId);
  const withoutTmdb = filmsWithoutRating.filter(f => !f.tmdbId);

  console.log(`With TMDB ID (should be matchable): ${withTmdb.length}`);
  console.log(`Without TMDB ID (likely events/unknown): ${withoutTmdb.length}\n`);

  console.log('=== Sample films WITH TMDB ID (no LB rating) ===');
  withTmdb.slice(0, 20).forEach(f => {
    console.log(`  - ${f.title} (${f.year || '?'}) - TMDB: ${f.tmdbId}`);
  });

  console.log('\n=== Sample films WITHOUT TMDB ID ===');
  withoutTmdb.slice(0, 20).forEach(f => {
    console.log(`  - ${f.title} (${f.year || '?'})`);
  });

  process.exit(0);
}

checkFilmsWithoutRatings();
