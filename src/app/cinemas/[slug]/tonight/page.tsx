/**
 * Cinema Tonight Page
 * Programmatic SEO page for "what's on at [cinema] tonight"
 * Daily-changing content optimized for mid-funnel search intent.
 */

export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Clock, ExternalLink, MapPin } from "lucide-react";
import { db } from "@/db";
import { cinemas, screenings, films } from "@/db/schema";
import { eq, gte, lte, and } from "drizzle-orm";
import { endOfDay, format } from "date-fns";
import { unstable_cache } from "next/cache";
import {
  MovieTheaterSchema,
  BreadcrumbSchema,
  FAQSchema,
} from "@/components/seo/json-ld";
import type { Cinema } from "@/types/cinema";
import type { Metadata } from "next";

const BASE_URL = "https://pictures.london";

interface CinemaTonightPageProps {
  params: Promise<{ slug: string }>;
}

const getCinemaTonightScreenings = unstable_cache(
  async (slug: string, _dateKey: string) => {
    void _dateKey;
    const now = new Date();
    const tonight = endOfDay(now);

    return db
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
        and(
          eq(screenings.cinemaId, slug),
          gte(screenings.datetime, now),
          lte(screenings.datetime, tonight)
        )
      )
      .orderBy(screenings.datetime);
  },
  ["cinema-tonight"],
  { revalidate: 60, tags: ["screenings"] }
);

export default async function CinemaTonightPage({
  params,
}: CinemaTonightPageProps) {
  const { slug } = await params;

  const cinema = await db
    .select()
    .from(cinemas)
    .where(eq(cinemas.id, slug))
    .limit(1);

  if (cinema.length === 0) {
    notFound();
  }

  const cinemaData = cinema[0];
  const dateKey = format(new Date(), "yyyy-MM-dd-HH");
  const tonightScreenings = await getCinemaTonightScreenings(slug, dateKey);

  const uniqueFilms = [...new Set(tonightScreenings.map((s) => s.film.title))];
  const todayFormatted = format(new Date(), "EEEE d MMMM yyyy");

  const cinemaForSchema: Cinema = {
    ...cinemaData,
    features: cinemaData.features as Cinema["features"],
    programmingFocus: cinemaData.programmingFocus as Cinema["programmingFocus"],
    dataSourceType: cinemaData.dataSourceType as Cinema["dataSourceType"],
    createdAt: cinemaData.createdAt,
    updatedAt: cinemaData.updatedAt,
  };

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Cinemas", url: "/cinemas" },
    { name: cinemaData.name, url: `/cinemas/${slug}` },
    { name: "Tonight", url: `/cinemas/${slug}/tonight` },
  ];

  const faqItems = [
    {
      question: `What's on at ${cinemaData.name} tonight?`,
      answer:
        tonightScreenings.length > 0
          ? `${cinemaData.name} has ${tonightScreenings.length} screenings tonight (${todayFormatted}), including ${uniqueFilms.slice(0, 4).join(", ")}${uniqueFilms.length > 4 ? ` and ${uniqueFilms.length - 4} more` : ""}.`
          : `${cinemaData.name} has no more screenings scheduled for tonight. Check the full listings for upcoming shows.`,
    },
    {
      question: `How do I book tickets at ${cinemaData.name}?`,
      answer: `Click any screening below to go directly to the booking page at ${cinemaData.website}. Most screenings can be booked online right up until showtime.`,
    },
  ];

  return (
    <div className="min-h-screen bg-background-primary pb-12">
      <MovieTheaterSchema cinema={cinemaForSchema} />
      <BreadcrumbSchema items={breadcrumbs} />
      <FAQSchema items={faqItems} />

      {/* Navigation */}
      <div className="sticky top-0 z-50 bg-background-primary border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href={`/cinemas/${slug}`}
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>{cinemaData.name}</span>
          </Link>
          <span className="text-xs text-text-tertiary font-mono">
            {todayFormatted}
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="bg-background-secondary border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-display text-text-primary mb-2">
            {cinemaData.name} — Tonight
          </h1>
          {cinemaData.address && (
            <p className="text-text-secondary flex items-center gap-2 mb-3 text-sm">
              <MapPin className="w-4 h-4" />
              {cinemaData.address.street}, {cinemaData.address.area}
            </p>
          )}
          <p className="text-text-secondary text-sm">
            {tonightScreenings.length > 0
              ? `${tonightScreenings.length} screenings of ${uniqueFilms.length} films remaining tonight.`
              : "No more screenings tonight. Check the full schedule for upcoming shows."}
          </p>
        </div>
      </div>

      {/* Screenings */}
      <div className="max-w-4xl mx-auto px-4 mt-8">
        {tonightScreenings.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-tertiary mb-4">
              No more screenings tonight at {cinemaData.name}
            </p>
            <Link
              href={`/cinemas/${slug}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent-primary text-text-inverse font-medium rounded-lg hover:bg-accent-primary-hover transition-colors"
            >
              View all upcoming screenings
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {tonightScreenings.map((screening) => (
              <a
                key={screening.id}
                href={screening.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-background-secondary border border-border-subtle rounded-lg p-4 hover:border-accent-primary/30 transition-colors"
              >
                <div className="flex gap-4">
                  <div className="text-center min-w-[60px]">
                    <div className="text-xl font-mono text-accent-highlight font-semibold">
                      {format(new Date(screening.datetime), "HH:mm")}
                    </div>
                    {screening.format &&
                      screening.format !== "unknown" && (
                        <div className="text-xs text-text-tertiary uppercase mt-0.5">
                          {screening.format}
                        </div>
                      )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-display text-text-primary text-lg">
                      {screening.film.title}
                      {screening.film.year && (
                        <span className="text-text-tertiary font-body text-sm ml-2">
                          ({screening.film.year})
                        </span>
                      )}
                    </div>
                    {screening.film.directors.length > 0 && (
                      <p className="text-sm text-text-tertiary mt-0.5">
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
                        <span>{screening.screen}</span>
                      )}
                      {screening.eventType && (
                        <span className="text-accent-primary capitalize">
                          {screening.eventType.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center shrink-0">
                    <span className="px-3 py-1.5 text-sm font-medium text-text-inverse bg-accent-primary rounded-lg flex items-center gap-1.5">
                      Book
                      <ExternalLink className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* FAQ */}
      <div className="max-w-4xl mx-auto px-4 mt-12">
        <h2 className="text-lg font-display text-text-primary mb-4">FAQ</h2>
        <div className="space-y-4">
          {faqItems.map((faq, index) => (
            <div key={index} className="border-b border-border-subtle pb-4">
              <h3 className="font-medium text-text-primary mb-2 text-sm">
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

export async function generateMetadata({
  params,
}: CinemaTonightPageProps): Promise<Metadata> {
  const { slug } = await params;
  const todayFormatted = format(new Date(), "EEEE d MMMM");

  const cinema = await db
    .select({ name: cinemas.name, address: cinemas.address })
    .from(cinemas)
    .where(eq(cinemas.id, slug))
    .limit(1);

  if (cinema.length === 0) {
    return { title: "Cinema Not Found" };
  }

  const c = cinema[0];
  const title = `${c.name} Tonight — ${todayFormatted}`;
  const description = `What's on at ${c.name} tonight. See all screenings and book tickets for ${todayFormatted}.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/cinemas/${slug}/tonight`,
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/cinemas/${slug}/tonight`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}
