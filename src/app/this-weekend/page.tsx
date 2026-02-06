/**
 * "This Weekend" Page
 * Programmatic SEO page for "cinema this weekend london"
 * Shows Saturday and Sunday screenings grouped by day and cinema.
 */

export const dynamic = "force-dynamic";

import { db, isDatabaseAvailable } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { eq, gte, lte, and } from "drizzle-orm";
import {
  format,
  nextSaturday,
  nextSunday,
  isSaturday,
  isSunday,
  startOfDay,
  endOfDay,
  isToday,
} from "date-fns";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { ChevronLeft, Clock, ExternalLink, Calendar } from "lucide-react";
import { BreadcrumbSchema, FAQSchema } from "@/components/seo/json-ld";
import type { Metadata } from "next";

const BASE_URL = "https://pictures.london";

function getWeekendDates() {
  const now = new Date();
  let weekendStart: Date;
  let weekendEnd: Date;

  if (isSaturday(now)) {
    weekendStart = startOfDay(now);
    weekendEnd = endOfDay(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  } else if (isSunday(now)) {
    // On Sunday, show just remaining Sunday screenings
    // (Saturday screenings are in the past and filtered by the query)
    weekendStart = startOfDay(now);
    weekendEnd = endOfDay(now);
  } else {
    weekendStart = startOfDay(nextSaturday(now));
    weekendEnd = endOfDay(nextSunday(now));
  }

  return { weekendStart, weekendEnd };
}

// _dateKey is not used inside the function body — it serves as part of
// unstable_cache's cache key (derived from function arguments) to ensure
// the cache busts daily when the date changes.
const getWeekendScreenings = unstable_cache(
  async (_dateKey: string) => {
    void _dateKey;
    const { weekendStart, weekendEnd } = getWeekendDates();

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
          directors: films.directors,
          posterUrl: films.posterUrl,
          runtime: films.runtime,
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
          gte(screenings.datetime, weekendStart),
          lte(screenings.datetime, weekendEnd)
        )
      )
      .orderBy(screenings.datetime);
  },
  ["weekend-screenings"],
  { revalidate: 300, tags: ["screenings"] }
);

export default async function ThisWeekendPage() {
  if (!isDatabaseAvailable) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <p className="text-text-secondary">Database not available.</p>
      </div>
    );
  }

  const dateKey = format(new Date(), "yyyy-MM-dd");
  const weekendScreenings = await getWeekendScreenings(dateKey);

  const { weekendStart, weekendEnd } = getWeekendDates();
  const weekendLabel = isSaturday(new Date()) || isSunday(new Date())
    ? "This Weekend"
    : `Weekend of ${format(weekendStart, "d")}–${format(weekendEnd, "d MMMM")}`;

  const uniqueCinemas = [...new Set(weekendScreenings.map((s) => s.cinema.name))];
  const uniqueFilms = [...new Set(weekendScreenings.map((s) => s.film.title))];

  // Group by date
  const byDate = new Map<string, typeof weekendScreenings>();
  for (const s of weekendScreenings) {
    const key = format(new Date(s.datetime), "yyyy-MM-dd");
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(s);
  }

  // Within each date, group by cinema
  function groupByCinema(dayScreenings: typeof weekendScreenings) {
    const map = new Map<string, { cinema: (typeof weekendScreenings)[0]["cinema"]; screenings: typeof weekendScreenings }>();
    for (const s of dayScreenings) {
      if (!map.has(s.cinema.id)) {
        map.set(s.cinema.id, { cinema: s.cinema, screenings: [] });
      }
      map.get(s.cinema.id)!.screenings.push(s);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.screenings.length - a.screenings.length
    );
  }

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "This Weekend", url: "/this-weekend" },
  ];

  const faqItems = [
    {
      question: "What's on at London cinemas this weekend?",
      answer: `There are ${weekendScreenings.length} screenings of ${uniqueFilms.length} films at ${uniqueCinemas.length} London cinemas this weekend (${format(weekendStart, "d MMMM")}–${format(weekendEnd, "d MMMM yyyy")}).`,
    },
    {
      question: "Which cinemas are showing films this weekend?",
      answer: `This weekend's screenings are at ${uniqueCinemas.slice(0, 10).join(", ")}${uniqueCinemas.length > 10 ? ` and ${uniqueCinemas.length - 10} more` : ""}.`,
    },
    {
      question: "How do I book weekend cinema tickets in London?",
      answer: "Click any screening below to book directly on the cinema's website. Weekend screenings tend to sell out, so booking in advance is recommended.",
    },
  ];

  return (
    <div className="min-h-screen bg-background-primary pb-12">
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
          <div className="flex items-center gap-2">
            <Link
              href="/tonight"
              className="text-xs text-accent-primary hover:underline"
            >
              Tonight
            </Link>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="max-w-5xl mx-auto px-4 pt-8 pb-4">
        <h1 className="text-3xl sm:text-4xl font-display text-text-primary">
          {weekendLabel} at London Cinemas
        </h1>
        <p className="text-text-secondary mt-2 text-sm max-w-2xl">
          {weekendScreenings.length > 0
            ? `${weekendScreenings.length} screenings of ${uniqueFilms.length} films at ${uniqueCinemas.length} cinemas.`
            : "No weekend screenings listed yet. Check back soon."}
        </p>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4">
        {weekendScreenings.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
            <p className="text-text-tertiary text-lg mb-4">
              Weekend screenings not yet listed
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent-primary text-text-inverse font-medium rounded-lg hover:bg-accent-primary-hover transition-colors"
            >
              Browse all screenings
            </Link>
          </div>
        ) : (
          <div className="space-y-12">
            {Array.from(byDate.entries()).map(([dateKey, dayScreenings]) => {
              const date = new Date(dateKey);
              const dayLabel = isToday(date)
                ? "Today"
                : format(date, "EEEE, d MMMM");
              const cinemaGroups = groupByCinema(dayScreenings);

              return (
                <section key={dateKey}>
                  <h2 className="text-2xl font-display text-text-primary mb-6 pb-2 border-b border-border-subtle">
                    {dayLabel}
                    <span className="text-sm font-mono text-text-tertiary ml-3">
                      {dayScreenings.length} screenings
                    </span>
                  </h2>

                  <div className="space-y-6">
                    {cinemaGroups.map(({ cinema, screenings: cinemaScreenings }) => (
                      <div
                        key={cinema.id}
                        className="bg-background-secondary rounded-lg border border-border-subtle overflow-hidden"
                      >
                        {/* Cinema header */}
                        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
                          <Link
                            href={`/cinemas/${cinema.id}`}
                            className="font-display text-text-primary hover:text-accent-primary transition-colors"
                          >
                            {cinema.name}
                          </Link>
                          <span className="text-xs text-text-tertiary font-mono">
                            {cinemaScreenings.length} shows
                          </span>
                        </div>

                        {/* Screenings */}
                        <div className="divide-y divide-border-subtle">
                          {cinemaScreenings.map((screening) => (
                            <a
                              key={screening.id}
                              href={screening.bookingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-4 px-4 py-3 hover:bg-surface-overlay-hover transition-colors"
                            >
                              <div className="w-16 shrink-0 text-center">
                                <div className="font-mono text-accent-highlight font-semibold">
                                  {format(new Date(screening.datetime), "HH:mm")}
                                </div>
                                {screening.format &&
                                  screening.format !== "unknown" && (
                                    <div className="text-[10px] text-text-tertiary uppercase">
                                      {screening.format}
                                    </div>
                                  )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="text-text-primary font-medium truncate">
                                  {screening.film.title}
                                  {screening.film.year && (
                                    <span className="text-text-tertiary text-sm ml-1.5">
                                      ({screening.film.year})
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-text-tertiary mt-0.5">
                                  {screening.film.directors.length > 0 && (
                                    <span>{screening.film.directors[0]}</span>
                                  )}
                                  {screening.film.runtime && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {screening.film.runtime}m
                                    </span>
                                  )}
                                  {screening.film.letterboxdRating &&
                                    screening.film.letterboxdRating >= 4.0 && (
                                      <span className="text-accent-success">
                                        {screening.film.letterboxdRating.toFixed(1)} LB
                                      </span>
                                    )}
                                </div>
                              </div>

                              <ExternalLink className="w-4 h-4 text-text-tertiary shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* FAQ */}
        <section className="mt-16 pt-8 border-t border-border-subtle">
          <h2 className="text-lg font-display text-text-primary mb-6">
            London Cinema This Weekend — FAQ
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

export async function generateMetadata(): Promise<Metadata> {
  const { weekendStart, weekendEnd } = getWeekendDates();
  const weekendStr = `${format(weekendStart, "d")}–${format(weekendEnd, "d MMMM yyyy")}`;

  return {
    title: `London Cinema This Weekend — ${weekendStr}`,
    description: `What's on at London cinemas this weekend (${weekendStr}). Browse screenings at BFI, Curzon, Prince Charles, Barbican, and venues across the city.`,
    alternates: {
      canonical: "/this-weekend",
    },
    openGraph: {
      title: `London Cinema This Weekend — ${weekendStr}`,
      description: `Weekend film screenings across London cinemas. Browse and book now.`,
      url: `${BASE_URL}/this-weekend`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `London Cinema This Weekend`,
      description: `Weekend screenings across London cinemas. Browse and book.`,
    },
  };
}
