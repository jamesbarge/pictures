import { db } from '../src/db';
import { screenings, films, cinemas } from '../src/db/schema';
import { count, gte, sql } from 'drizzle-orm';

async function checkDb() {
  const cinemaCount = await db.select({ count: count() }).from(cinemas);
  const filmCount = await db.select({ count: count() }).from(films);
  const screeningCount = await db.select({ count: count() }).from(screenings);

  console.log('Cinemas:', cinemaCount[0].count);
  console.log('Films:', filmCount[0].count);
  console.log('Screenings:', screeningCount[0].count);

  // Get all cinema IDs from DB
  const allCinemas = await db.select({ id: cinemas.id, name: cinemas.name }).from(cinemas);
  console.log('\n=== ALL CINEMA IDS ===');
  allCinemas.forEach(c => console.log('  ', c.id, '|', c.name));

  // Get FUTURE screenings by cinema
  const now = new Date();
  console.log('\n=== FUTURE SCREENINGS (after', now.toISOString(), ') ===');

  const futureBycinema = await db.select({
    cinemaId: screenings.cinemaId,
    count: count()
  }).from(screenings)
    .where(gte(screenings.datetime, now))
    .groupBy(screenings.cinemaId);

  futureBycinema.sort((a, b) => Number(b.count) - Number(a.count));
  futureBycinema.forEach(c => console.log('  ', c.cinemaId, ':', c.count));

  const totalFuture = futureBycinema.reduce((sum, c) => sum + Number(c.count), 0);
  console.log('\nTotal future screenings:', totalFuture);

  // Check for cinema IDs with 0 future screenings
  const cinemasWithScreenings = new Set(futureBycinema.map(c => c.cinemaId));
  const cinemasWithoutFuture = allCinemas.filter(c => !cinemasWithScreenings.has(c.id));

  console.log('\n=== CINEMAS WITH ZERO FUTURE SCREENINGS ===');
  cinemasWithoutFuture.forEach(c => console.log('  ', c.id, '|', c.name));

  process.exit(0);
}

checkDb();
