import { db } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { eq, gte, lte, and } from "drizzle-orm";
import { endOfDay, addDays, startOfDay, format } from "date-fns";
import { unstable_cache } from "next/cache";
import { CalendarViewWithLoader } from "@/components/calendar/calendar-view-loader";
import { Header } from "@/components/layout/header";

// Dynamic rendering with data-layer caching
// Force-dynamic prevents build timeout, unstable_cache provides 60s data caching
export const dynamic = "force-dynamic";

// Cache screenings query for 60 seconds (keyed by date to bust cache at midnight)
const getCachedScreenings = unstable_cache(
  async (dateKey: string) => {
    const now = new Date();
    const endDate = endOfDay(addDays(now, 7));

    return db
      .select({
        id: screenings.id,
        datetime: screenings.datetime,
        format: screenings.format,
        screen: screenings.screen,
        eventType: screenings.eventType,
        eventDescription: screenings.eventDescription,
        isSpecialEvent: screenings.isSpecialEvent,
        bookingUrl: screenings.bookingUrl,
        film: {
          id: films.id,
          title: films.title,
          year: films.year,
          directors: films.directors,
          posterUrl: films.posterUrl,
          runtime: films.runtime,
          isRepertory: films.isRepertory,
          genres: films.genres,
          decade: films.decade,
        },
        cinema: {
          id: cinemas.id,
          name: cinemas.name,
          shortName: cinemas.shortName,
        },
      })
      .from(screenings)
      .innerJoin(films, eq(screenings.filmId, films.id))
      .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
      .where(
        and(
          gte(screenings.datetime, startOfDay(now)),
          lte(screenings.datetime, endDate)
        )
      )
      .orderBy(screenings.datetime)
      .limit(3000);
  },
  ["home-screenings"],
  { revalidate: 60, tags: ["screenings"] }
);

// Cache cinemas list (changes rarely)
const getCachedCinemas = unstable_cache(
  async () => db.select().from(cinemas),
  ["all-cinemas"],
  { revalidate: 3600, tags: ["cinemas"] }
);

export default async function Home() {
  // Use date key to bust cache at midnight (ensures fresh data each day)
  const dateKey = format(new Date(), "yyyy-MM-dd");

  // Fetch cached data (60s cache for screenings, 1hr for cinemas)
  const [initialScreenings, allCinemas] = await Promise.all([
    getCachedScreenings(dateKey),
    getCachedCinemas(),
  ]);

  // Prepare cinemas with coordinates for map filtering
  const cinemasWithCoords = allCinemas.map(c => ({
    id: c.id,
    name: c.name,
    shortName: c.shortName,
    coordinates: c.coordinates,
  }));

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Unified Header with Filters */}
      <Header cinemas={allCinemas.map(c => ({ id: c.id, name: c.name, shortName: c.shortName }))} />

      {/* Main Content - Full Width */}
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Calendar View with Load More */}
        <CalendarViewWithLoader initialScreenings={initialScreenings} cinemas={cinemasWithCoords} />

        {/* Empty State Helper */}
        {initialScreenings.length === 0 && (
          <div className="mt-8 p-6 bg-background-secondary/50 border border-border-subtle rounded-lg text-center">
            <p className="text-text-secondary mb-4">
              No screenings yet. Seed some test data to see the calendar in
              action:
            </p>
            <code className="block bg-background-tertiary text-text-primary text-sm px-4 py-3 rounded-lg font-mono">
              npm run db:seed-screenings
            </code>
          </div>
        )}
      </main>

    </div>
  );
}
