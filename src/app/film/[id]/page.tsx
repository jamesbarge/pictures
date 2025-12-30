/**
 * Film Detail Page
 * Shows film information and all upcoming screenings
 * Enhanced with Movie schema and SEO optimizations for GEO
 */

// ISR: Revalidate every 5 minutes - film data rarely changes
export const revalidate = 300;

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { films, screenings, cinemas } from "@/db/schema";
import { eq, gte, and } from "drizzle-orm";
import { FilmHeader } from "@/components/film/film-header";
import { FilmScreenings } from "@/components/film/film-screenings";
import { StatusToggle } from "@/components/film/status-toggle";
import { FilmViewTracker } from "@/components/film/film-view-tracker";
import { MovieSchema, BreadcrumbSchema } from "@/components/seo/json-ld";
import type { Film } from "@/types/film";

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

  // Get unique cinema names for FAQ
  const uniqueCinemas = [
    ...new Set(upcomingScreenings.map((s) => s.cinema.name)),
  ];

  // Convert filmData to Film type for schema
  const filmForSchema: Film = {
    ...filmData,
    cast: filmData.cast || [],
    genres: filmData.genres as Film["genres"],
    countries: filmData.countries || [],
    languages: filmData.languages || [],
    isRepertory: filmData.isRepertory ?? false,
    releaseStatus: filmData.releaseStatus as Film["releaseStatus"],
    createdAt: filmData.createdAt,
    updatedAt: filmData.updatedAt,
  };

  // Breadcrumb data
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Films", url: "/" },
    { name: filmData.title, url: `/film/${filmData.id}` },
  ];

  return (
    <div className="min-h-screen bg-background-primary pb-8">
      {/* Structured Data for SEO */}
      <MovieSchema film={filmForSchema} />
      <BreadcrumbSchema items={breadcrumbs} />

      {/* Analytics - track film view */}
      <FilmViewTracker
        filmId={filmData.id}
        filmTitle={filmData.title}
        filmYear={filmData.year}
        isRepertory={filmData.isRepertory ?? undefined}
        genres={filmData.genres}
        directors={filmData.directors}
      />

      {/* Back Navigation */}
      <div className="sticky top-0 z-50 bg-background-primary/95 backdrop-blur-sm border-b border-border-subtle">
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

      {/* Answer-first summary for GEO */}
      {upcomingScreenings.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 mt-8">
          <p className="text-text-secondary text-sm">
            <strong>{filmData.title}</strong> is showing at{" "}
            {uniqueCinemas.length} London cinema
            {uniqueCinemas.length !== 1 ? "s" : ""} with{" "}
            {upcomingScreenings.length} upcoming screening
            {upcomingScreenings.length !== 1 ? "s" : ""}.
          </p>
        </div>
      )}

      {/* Screenings Section */}
      <div className="max-w-4xl mx-auto px-4 mt-12">
        <h2 className="text-xl font-display text-text-primary mb-6 flex items-center gap-2">
          Upcoming Screenings
          <span className="text-sm font-mono text-text-tertiary">
            ({upcomingScreenings.length})
          </span>
        </h2>

        <FilmScreenings screenings={upcomingScreenings} film={{ id: filmData.id, title: filmData.title }} />
      </div>
    </div>
  );
}

// Generate metadata with OG tags for rich sharing
export async function generateMetadata({ params }: FilmPageProps) {
  const { id } = await params;
  const BASE_URL = "https://postboxd.co.uk";

  const film = await db.select().from(films).where(eq(films.id, id)).limit(1);

  if (film.length === 0) {
    return { title: "Film Not Found" };
  }

  const f = film[0];
  const title = `${f.title}${f.year ? ` (${f.year})` : ""}`;

  // Build a rich description including directors and synopsis
  let description = `Find screenings of ${f.title}`;
  if (f.directors && f.directors.length > 0) {
    description += ` directed by ${f.directors.slice(0, 2).join(" and ")}`;
  }
  description += ` at London's independent cinemas.`;
  if (f.synopsis) {
    // Truncate synopsis for description
    const synopsisPreview = f.synopsis.slice(0, 150);
    description += ` ${synopsisPreview}${f.synopsis.length > 150 ? "..." : ""}`;
  }

  return {
    title,
    description,
    alternates: {
      canonical: `/film/${id}`,
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/film/${id}`,
      type: "video.movie",
      images: f.posterUrl
        ? [
            {
              url: f.posterUrl,
              width: 500,
              height: 750,
              alt: `${f.title} poster`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: f.posterUrl ? [f.posterUrl] : undefined,
    },
  };
}
