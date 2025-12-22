/**
 * Watchlist Page
 * Shows films the user has marked as "want to see"
 * Split into "Currently Showing" and "Not Currently Playing"
 */

import { db } from "@/db";
import { films, screenings, cinemas } from "@/db/schema";
import { eq, gte, sql } from "drizzle-orm";
import { WatchlistView } from "@/components/watchlist/watchlist-view";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function WatchlistPage() {
  const now = new Date();

  // Fetch all films with their upcoming screening counts and next screening time
  const filmsWithScreenings = await db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      directors: films.directors,
      posterUrl: films.posterUrl,
      runtime: films.runtime,
      genres: films.genres,
      // Aggregate: count of upcoming screenings
      upcomingCount: sql<number>`count(${screenings.id})::int`.as("upcoming_count"),
      // Aggregate: next screening datetime
      nextScreening: sql<Date>`min(${screenings.datetime})`.as("next_screening"),
    })
    .from(films)
    .leftJoin(
      screenings,
      sql`${screenings.filmId} = ${films.id} AND ${screenings.datetime} >= ${now.toISOString()}`
    )
    .groupBy(films.id)
    .orderBy(films.title);

  // Also fetch upcoming screenings with cinema info for the detail view
  const upcomingScreenings = await db
    .select({
      id: screenings.id,
      filmId: screenings.filmId,
      datetime: screenings.datetime,
      format: screenings.format,
      screen: screenings.screen,
      bookingUrl: screenings.bookingUrl,
      cinema: {
        id: cinemas.id,
        name: cinemas.name,
        shortName: cinemas.shortName,
      },
    })
    .from(screenings)
    .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
    .where(gte(screenings.datetime, now))
    .orderBy(screenings.datetime);

  // Group screenings by film ID for easy lookup
  const screeningsByFilm = upcomingScreenings.reduce((acc, s) => {
    if (!acc[s.filmId]) {
      acc[s.filmId] = [];
    }
    acc[s.filmId].push(s);
    return acc;
  }, {} as Record<string, typeof upcomingScreenings>);

  return (
    <div className="min-h-screen bg-background-primary pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background-primary/95 backdrop-blur-sm border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back to Calendar</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-display text-text-primary mb-2">
          Watchlist
        </h1>
        <p className="text-text-secondary mb-8">
          Films you want to see on the big screen
        </p>

        <WatchlistView
          films={filmsWithScreenings}
          screeningsByFilm={screeningsByFilm}
        />
      </div>
    </div>
  );
}

export const metadata = {
  title: "Watchlist | Postboxd",
  description: "Your cinema watchlist - films you want to see",
};
