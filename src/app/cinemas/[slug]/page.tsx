/**
 * Individual Cinema Page
 * Shows cinema details and upcoming screenings
 * Optimized for local SEO with MovieTheater schema
 */

import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, MapPin, ExternalLink, Clock, Film } from "lucide-react";
import { db } from "@/db";
import { cinemas, screenings, films } from "@/db/schema";
import { eq, gte, and } from "drizzle-orm";
import { format } from "date-fns";
import {
  MovieTheaterSchema,
  FAQSchema,
  BreadcrumbSchema,
} from "@/components/seo/json-ld";
import type { Cinema } from "@/types/cinema";

export const dynamic = "force-dynamic"; // Avoid build timeout on DB connection

interface CinemaPageProps {
  params: Promise<{ slug: string }>;
}

export default async function CinemaPage({ params }: CinemaPageProps) {
  const { slug } = await params;

  // Fetch cinema
  const cinema = await db
    .select()
    .from(cinemas)
    .where(eq(cinemas.id, slug))
    .limit(1);

  if (cinema.length === 0) {
    notFound();
  }

  const cinemaData = cinema[0];

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
      film: {
        id: films.id,
        title: films.title,
        year: films.year,
        posterUrl: films.posterUrl,
        runtime: films.runtime,
        directors: films.directors,
      },
    })
    .from(screenings)
    .innerJoin(films, eq(screenings.filmId, films.id))
    .where(
      and(eq(screenings.cinemaId, slug), gte(screenings.datetime, now))
    )
    .orderBy(screenings.datetime)
    .limit(50);

  // Get unique films count
  const uniqueFilms = new Set(upcomingScreenings.map((s) => s.film.id)).size;

  // Convert to Cinema type for schema
  const cinemaForSchema: Cinema = {
    ...cinemaData,
    features: cinemaData.features as Cinema["features"],
    programmingFocus: cinemaData.programmingFocus as Cinema["programmingFocus"],
    dataSourceType: cinemaData.dataSourceType as Cinema["dataSourceType"],
    createdAt: cinemaData.createdAt,
    updatedAt: cinemaData.updatedAt,
  };

  // Generate FAQ items
  const faqItems = [
    {
      question: `What films are showing at ${cinemaData.name}?`,
      answer:
        upcomingScreenings.length > 0
          ? `${cinemaData.name} currently has ${upcomingScreenings.length} upcoming screenings of ${uniqueFilms} different films, including ${upcomingScreenings
              .slice(0, 3)
              .map((s) => s.film.title)
              .join(", ")}.`
          : `${cinemaData.name} does not have any upcoming screenings listed at the moment. Check back later for new listings.`,
    },
    {
      question: `Where is ${cinemaData.name} located?`,
      answer: cinemaData.address
        ? `${cinemaData.name} is located at ${cinemaData.address.street}, ${cinemaData.address.area}, ${cinemaData.address.postcode}, London.`
        : `${cinemaData.name} is a cinema in London.`,
    },
    {
      question: `How do I book tickets at ${cinemaData.name}?`,
      answer: `You can book tickets for ${cinemaData.name} through their website at ${cinemaData.website}. Click on any screening below to go directly to the booking page.`,
    },
  ];

  // Breadcrumbs
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Cinemas", url: "/cinemas" },
    { name: cinemaData.name, url: `/cinemas/${slug}` },
  ];

  // Group screenings by date
  const screeningsByDate = upcomingScreenings.reduce(
    (acc, screening) => {
      const dateKey = format(screening.datetime, "yyyy-MM-dd");
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(screening);
      return acc;
    },
    {} as Record<string, typeof upcomingScreenings>
  );

  return (
    <div className="min-h-screen bg-background-primary pb-12">
      {/* Structured Data */}
      <MovieTheaterSchema cinema={cinemaForSchema} />
      <FAQSchema items={faqItems} />
      <BreadcrumbSchema items={breadcrumbs} />

      {/* Back Navigation */}
      <div className="sticky top-0 z-50 bg-background-primary border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <Link
            href="/cinemas"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>All Cinemas</span>
          </Link>
        </div>
      </div>

      {/* Cinema Header */}
      <div className="bg-background-secondary border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* H1 - critical for local SEO */}
          <h1 className="text-3xl font-display text-text-primary mb-2 text-balance">
            {cinemaData.name}
          </h1>

          {/* Address for local SEO */}
          {cinemaData.address && (
            <p className="text-text-secondary flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5" />
              {cinemaData.address.street}, {cinemaData.address.area},{" "}
              {cinemaData.address.postcode}
            </p>
          )}

          {/* Answer-first summary for GEO */}
          <p className="text-text-secondary mb-4">
            {cinemaData.name} is showing {uniqueFilms} film
            {uniqueFilms !== 1 ? "s" : ""} with {upcomingScreenings.length}{" "}
            upcoming screening
            {upcomingScreenings.length !== 1 ? "s" : ""} in London.
          </p>

          {/* Description */}
          {cinemaData.description && (
            <p className="text-text-tertiary text-sm mb-4">
              {cinemaData.description}
            </p>
          )}

          {/* Features */}
          <div className="flex flex-wrap gap-2 mb-4">
            {cinemaData.programmingFocus.map((focus) => (
              <span
                key={focus}
                className="text-xs px-2 py-1 bg-background-primary rounded text-text-secondary"
              >
                {focus}
              </span>
            ))}
            {cinemaData.features.map((feature) => (
              <span
                key={feature}
                className="text-xs px-2 py-1 bg-background-tertiary rounded text-text-secondary"
              >
                {feature}
              </span>
            ))}
            {cinemaData.screens && (
              <span className="text-xs px-2 py-1 bg-background-tertiary rounded text-text-secondary">
                {cinemaData.screens} screen
                {cinemaData.screens !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Website link */}
          <a
            href={cinemaData.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-accent-primary hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            Visit Website
          </a>
        </div>
      </div>

      {/* Screenings */}
      <div className="max-w-4xl mx-auto px-4 mt-8">
        <h2 className="text-xl font-display text-text-primary mb-6 flex items-center gap-2">
          What&apos;s On
          <span className="text-sm font-mono text-text-tertiary">
            ({upcomingScreenings.length} screenings)
          </span>
        </h2>

        {upcomingScreenings.length === 0 ? (
          <p className="text-text-secondary">
            No upcoming screenings listed. Check the cinema website for the
            latest schedule.
          </p>
        ) : (
          <div className="space-y-8">
            {Object.entries(screeningsByDate).map(([dateKey, dayScreenings]) => (
              <div key={dateKey}>
                <h3 className="text-lg font-medium text-text-primary mb-4 sticky top-14 bg-background-primary py-2 border-b border-border-subtle">
                  {format(new Date(dateKey), "EEEE, d MMMM")}
                </h3>
                <div className="space-y-3">
                  {dayScreenings.map((screening) => (
                    <a
                      key={screening.id}
                      href={screening.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-background-secondary border border-border-subtle rounded-lg p-4 hover:border-border-default transition-colors"
                    >
                      <div className="flex gap-4">
                        {/* Time */}
                        <div className="text-center min-w-[60px]">
                          <div className="text-lg font-mono text-text-primary">
                            {format(screening.datetime, "HH:mm")}
                          </div>
                          {screening.format && screening.format !== "unknown" && (
                            <div className="text-xs text-text-tertiary uppercase">
                              {screening.format}
                            </div>
                          )}
                        </div>

                        {/* Film Info */}
                        <div className="flex-1">
                          <span className="text-text-primary font-medium">
                            {screening.film.title}
                            {screening.film.year && (
                              <span className="text-text-tertiary ml-2">
                                ({screening.film.year})
                              </span>
                            )}
                          </span>

                          {screening.film.directors &&
                            screening.film.directors.length > 0 && (
                              <p className="text-sm text-text-tertiary">
                                Dir. {screening.film.directors.slice(0, 2).join(", ")}
                              </p>
                            )}

                          <div className="flex items-center gap-4 mt-1 text-xs text-text-tertiary">
                            {screening.film.runtime && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {screening.film.runtime} min
                              </span>
                            )}
                            {screening.screen && (
                              <span>Screen {screening.screen}</span>
                            )}
                            {screening.eventType && (
                              <span className="text-accent-primary">
                                {screening.eventType.replace(/_/g, " ")}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Book button */}
                        <div className="flex items-center">
                          <span className="text-xs text-accent-primary">
                            Book →
                          </span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAQ Section */}
      <div className="max-w-4xl mx-auto px-4 mt-12">
        <h2 className="text-lg font-display text-text-primary mb-4">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {faqItems.map((faq, index) => (
            <div key={index} className="border-b border-border-subtle pb-4">
              <h3 className="font-medium text-text-primary mb-2">
                {faq.question}
              </h3>
              <p className="text-text-secondary text-sm">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Generate metadata
export async function generateMetadata({
  params,
}: CinemaPageProps): Promise<Metadata> {
  const { slug } = await params;
  const BASE_URL = "https://pictures.london";

  const cinema = await db
    .select()
    .from(cinemas)
    .where(eq(cinemas.id, slug))
    .limit(1);

  if (cinema.length === 0) {
    return { title: "Cinema Not Found" };
  }

  const c = cinema[0];
  const title = `${c.name} - London Cinema Listings`;
  const description = c.description
    ? `${c.description.slice(0, 150)}... Find showtimes and book tickets.`
    : `Find showtimes and book tickets at ${c.name}, ${c.address?.area || "London"}. View upcoming screenings and films.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/cinemas/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/cinemas/${slug}`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

// Note: generateStaticParams removed to avoid build timeout on DB connection
// Pages are now rendered dynamically with caching at the edge
