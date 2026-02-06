/**
 * "What's On Tonight" Page
 * Shows screenings starting in the next few hours with urgency-driven UX.
 * Optimized for the search query "what's on tonight london cinema".
 *
 * SEO: Programmatic page with daily-changing content, ScreeningEvent schema,
 * rich OG metadata, and answer-first summary.
 */

export const dynamic = "force-dynamic";

import { db, isDatabaseAvailable } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { eq, gte, lte, and } from "drizzle-orm";
import { endOfDay, format } from "date-fns";
import { unstable_cache } from "next/cache";
import { TonightView } from "./tonight-view";
import {
  BreadcrumbSchema,
  FAQSchema,
} from "@/components/seo/json-ld";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const BASE_URL = "https://pictures.london";

// Cache tonight's screenings for 60 seconds.
// _dateKey is not used inside the function body — it serves as part of
// unstable_cache's cache key (derived from function arguments) to bust
// the cache hourly when the date-hour changes.
const getTonightScreenings = unstable_cache(
  async (_dateKey: string) => {
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
        eventDescription: screenings.eventDescription,
        bookingUrl: screenings.bookingUrl,
        availabilityStatus: screenings.availabilityStatus,
        film: {
          id: films.id,
          title: films.title,
          year: films.year,
          directors: films.directors,
          posterUrl: films.posterUrl,
          runtime: films.runtime,
          isRepertory: films.isRepertory,
          letterboxdRating: films.letterboxdRating,
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
          lte(screenings.datetime, tonight)
        )
      )
      .orderBy(screenings.datetime);
  },
  ["tonight-screenings"],
  { revalidate: 60, tags: ["screenings"] }
);

export default async function TonightPage() {
  if (!isDatabaseAvailable) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <p className="text-text-secondary">Database not available.</p>
      </div>
    );
  }

  const dateKey = format(new Date(), "yyyy-MM-dd-HH");
  const tonightScreenings = await getTonightScreenings(dateKey);

  const uniqueCinemas = [...new Set(tonightScreenings.map((s) => s.cinema.name))];
  const uniqueFilms = [...new Set(tonightScreenings.map((s) => s.film.title))];
  const todayFormatted = format(new Date(), "EEEE d MMMM yyyy");

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Tonight", url: "/tonight" },
  ];

  const faqItems = [
    {
      question: "What films are showing in London tonight?",
      answer: `There are ${tonightScreenings.length} screenings at ${uniqueCinemas.length} London cinemas tonight (${todayFormatted}). Films include ${uniqueFilms.slice(0, 5).join(", ")}${uniqueFilms.length > 5 ? ` and ${uniqueFilms.length - 5} more` : ""}.`,
    },
    {
      question: "Where can I watch a film in London tonight?",
      answer: `Tonight's screenings are at ${uniqueCinemas.slice(0, 8).join(", ")}${uniqueCinemas.length > 8 ? ` and ${uniqueCinemas.length - 8} more cinemas` : ""}. Use the filters to find screenings near you.`,
    },
    {
      question: "What time do films start tonight in London?",
      answer: tonightScreenings.length > 0
        ? `The next screening starts at ${format(new Date(tonightScreenings[0].datetime), "HH:mm")}. There are screenings throughout the evening until late.`
        : "Check back later for tonight's screenings.",
    },
  ];

  return (
    <div className="min-h-screen bg-background-primary">
      <BreadcrumbSchema items={breadcrumbs} />
      <FAQSchema items={faqItems} />

      {/* Navigation */}
      <div className="sticky top-0 z-50 bg-background-primary border-b border-border-subtle">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back to Calendar</span>
          </Link>
          <span className="text-xs text-text-tertiary font-mono">
            {todayFormatted}
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="max-w-5xl mx-auto px-4 pt-8 pb-4">
        <h1 className="text-3xl sm:text-4xl font-display text-text-primary">
          Tonight at London Cinemas
        </h1>
        <p className="text-text-secondary mt-2 text-sm max-w-2xl">
          {tonightScreenings.length > 0
            ? `${tonightScreenings.length} screenings at ${uniqueCinemas.length} cinemas. ${uniqueFilms.length} films still showing tonight.`
            : "No more screenings tonight. Check back tomorrow or browse the full calendar."}
        </p>
      </div>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 pb-12">
        {tonightScreenings.length > 0 ? (
          <TonightView screenings={tonightScreenings} />
        ) : (
          <div className="text-center py-16">
            <p className="text-text-tertiary text-lg mb-4">
              No more screenings tonight
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent-primary text-text-inverse font-medium rounded-lg hover:bg-accent-primary-hover transition-colors"
            >
              Browse tomorrow&apos;s screenings
            </Link>
          </div>
        )}

        {/* FAQ for SEO */}
        <section className="mt-16 pt-8 border-t border-border-subtle">
          <h2 className="text-lg font-display text-text-primary mb-6">
            London Cinema Tonight — FAQ
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {faqItems.map((faq, index) => (
              <div key={index} className="space-y-2">
                <h3 className="font-medium text-text-primary text-sm">
                  {faq.question}
                </h3>
                <p className="text-text-tertiary text-sm">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export async function generateMetadata() {
  const todayFormatted = format(new Date(), "EEEE d MMMM yyyy");

  return {
    title: `Tonight at London Cinemas — ${todayFormatted}`,
    description: `What's on at London cinemas tonight. Find screenings starting soon at BFI, Curzon, Prince Charles Cinema, Barbican, and more. Updated every minute.`,
    alternates: {
      canonical: "/tonight",
    },
    openGraph: {
      title: `Tonight at London Cinemas`,
      description: `Live listings for tonight's screenings across London cinemas. Find what's starting soon.`,
      url: `${BASE_URL}/tonight`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `Tonight at London Cinemas`,
      description: `Live listings for tonight's screenings across London cinemas.`,
    },
  };
}
