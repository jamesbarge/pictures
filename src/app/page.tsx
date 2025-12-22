import { db } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { eq, gte, lte, and } from "drizzle-orm";
import { endOfDay, addDays } from "date-fns";
import { CalendarViewWithLoader } from "@/components/calendar/calendar-view-loader";
import { Header } from "@/components/layout/header";

// ISR: Revalidate every 5 minutes for fast cached loads
// Data only changes when scrapers run (weekly)
export const revalidate = 300;

export default async function Home() {
  // Fetch only 7 days initially for fast load
  // Additional days are loaded on-demand via the API
  const now = new Date();
  const endDate = endOfDay(addDays(now, 7)); // Only 7 days initially

  const initialScreenings = await db
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
        gte(screenings.datetime, now),
        lte(screenings.datetime, endDate)
      )
    )
    .orderBy(screenings.datetime)
    .limit(300); // Safety cap

  // Get cinema count for stats
  const allCinemas = await db.select().from(cinemas);

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Unified Header with Filters */}
      <Header cinemas={allCinemas.map(c => ({ id: c.id, name: c.name, shortName: c.shortName }))} />

      {/* Main Content - Full Width */}
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Calendar View with Load More */}
        <CalendarViewWithLoader initialScreenings={initialScreenings} />

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
