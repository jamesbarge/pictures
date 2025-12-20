import { db } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { eq, gte, lte, and } from "drizzle-orm";
import { startOfDay, endOfDay, addDays } from "date-fns";
import { CalendarView } from "@/components/calendar/calendar-view";
import { Header } from "@/components/layout/header";

export default async function Home() {
  // Fetch a wide date range - filtering happens client-side via the filter store
  const startDate = startOfDay(new Date());
  const endDate = endOfDay(addDays(startDate, 30)); // Next 30 days

  const allScreenings = await db
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
        gte(screenings.datetime, startDate),
        lte(screenings.datetime, endDate)
      )
    )
    .orderBy(screenings.datetime);

  // Get cinema count for stats
  const allCinemas = await db.select().from(cinemas);

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Unified Header with Filters */}
      <Header cinemas={allCinemas.map(c => ({ id: c.id, name: c.name, shortName: c.shortName }))} />

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats Bar */}
        <div className="flex items-center gap-4 mb-6 text-sm text-text-tertiary">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-accent-green rounded-full" />
            {allCinemas.length} cinemas
          </span>
          <span className="text-white/20">•</span>
          <span>{allScreenings.length} screenings</span>
        </div>

        {/* Calendar View */}
        <CalendarView screenings={allScreenings} />

        {/* Empty State Helper */}
        {allScreenings.length === 0 && (
          <div className="mt-8 p-6 bg-background-secondary/50 border border-white/5 rounded-lg text-center">
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
