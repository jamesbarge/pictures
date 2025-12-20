/**
 * Film Detail Page
 * Shows film information and all upcoming screenings
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { films, screenings, cinemas } from "@/db/schema";
import { eq, gte, and } from "drizzle-orm";
import { FilmHeader } from "@/components/film/film-header";
import { FilmScreenings } from "@/components/film/film-screenings";
import { StatusToggle } from "@/components/film/status-toggle";

interface FilmPageProps {
  params: Promise<{ id: string }>;
}

export default async function FilmPage({ params }: FilmPageProps) {
  const { id } = await params;

  // Fetch film
  const film = await db.select().from(films).where(eq(films.id, id)).limit(1);

  if (film.length === 0) {
    notFound();
  }

  const filmData = film[0];

  // Fetch upcoming screenings
  const now = new Date();
  const upcomingScreenings = await db
    .select({
      id: screenings.id,
      datetime: screenings.datetime,
      format: screenings.format,
      screen: screenings.screen,
      eventType: screenings.eventType,
      bookingUrl: screenings.bookingUrl,
      cinema: {
        id: cinemas.id,
        name: cinemas.name,
        shortName: cinemas.shortName,
        address: cinemas.address,
      },
    })
    .from(screenings)
    .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
    .where(
      and(
        eq(screenings.filmId, id),
        gte(screenings.datetime, now)
      )
    )
    .orderBy(screenings.datetime);

  return (
    <div className="min-h-screen bg-background-primary pb-8">
      {/* Back Navigation */}
      <div className="sticky top-0 z-50 bg-background-primary/95 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back to Calendar</span>
          </Link>
        </div>
      </div>

      {/* Film Header */}
      <FilmHeader film={filmData} />

      {/* Status Toggle */}
      <div className="max-w-4xl mx-auto px-4 mt-6">
        <StatusToggle filmId={id} />
      </div>

      {/* Screenings Section */}
      <div className="max-w-4xl mx-auto px-4 mt-12">
        <h2 className="text-xl font-display text-text-primary mb-6 flex items-center gap-2">
          Upcoming Screenings
          <span className="text-sm font-mono text-text-tertiary">
            ({upcomingScreenings.length})
          </span>
        </h2>

        <FilmScreenings screenings={upcomingScreenings} />
      </div>
    </div>
  );
}

// Generate metadata
export async function generateMetadata({ params }: FilmPageProps) {
  const { id } = await params;

  const film = await db.select().from(films).where(eq(films.id, id)).limit(1);

  if (film.length === 0) {
    return { title: "Film Not Found" };
  }

  const f = film[0];
  return {
    title: `${f.title}${f.year ? ` (${f.year})` : ""} | Postboxd`,
    description: f.synopsis || `Screenings for ${f.title} at London cinemas`,
  };
}
