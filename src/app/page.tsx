import { db, isDatabaseAvailable } from "@/db";
import { screenings, films, cinemas, seasons } from "@/db/schema";
import { eq, gte, lte, and, countDistinct, count } from "drizzle-orm";
import { endOfDay, addDays, format } from "date-fns";
import { unstable_cache } from "next/cache";
import { CalendarViewWithLoader } from "@/components/calendar/calendar-view-loader";
import { Header } from "@/components/layout/header";
import { FeatureDiscoveryBanner } from "@/components/discovery/feature-discovery-banner";
import { WebSiteSchema, FAQSchema } from "@/components/seo/json-ld";
import { isFeatureEnabled } from "@/lib/features";

// Dynamic rendering with data-layer caching
// Force-dynamic prevents build timeout, unstable_cache provides 60s data caching
export const dynamic = "force-dynamic";

// Cache screenings query for 60 seconds (keyed by date to bust cache at midnight)
// Load all screenings for 3 days (~2500) - never hide films that are showing
const getCachedScreenings = unstable_cache(
  async (_dateKey: string) => {
    void _dateKey;
    const now = new Date();
    const endDate = endOfDay(addDays(now, 3)); // 3 days instead of 7

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
          lte(screenings.datetime, endDate)
        )
      )
      .orderBy(screenings.datetime);
      // No limit - date range constraint ensures reasonable size (~2500 for 3 days)
  },
  ["home-screenings-v2"], // New cache key
  { revalidate: 60, tags: ["screenings"] }
);

// Cache cinemas list (changes rarely) - only active cinemas
const getCachedCinemas = unstable_cache(
  async () => db.select().from(cinemas).where(eq(cinemas.isActive, true)),
  ["all-cinemas-active"],
  { revalidate: 3600, tags: ["cinemas"] }
);

// Cache active seasons (ongoing and upcoming)
const getCachedActiveSeasons = unstable_cache(
  async () => {
    const today = new Date().toISOString().split("T")[0];
    return db
      .select({
        id: seasons.id,
        name: seasons.name,
        slug: seasons.slug,
        directorName: seasons.directorName,
      })
      .from(seasons)
      .where(
        and(
          eq(seasons.isActive, true),
          gte(seasons.endDate, today) // Only seasons that haven't ended
        )
      );
  },
  ["active-seasons"],
  { revalidate: 3600, tags: ["seasons"] }
);

// Cache stats for SEO display (how many screenings, films, cinemas)
const getCachedStats = unstable_cache(
  async () => {
    const now = new Date();
    const [screeningStats, cinemaCount] = await Promise.all([
      db
        .select({
          totalScreenings: count(screenings.id),
          uniqueFilms: countDistinct(screenings.filmId),
        })
        .from(screenings)
        .where(gte(screenings.datetime, now)),
      db
        .select({ count: count(cinemas.id) })
        .from(cinemas)
        .where(eq(cinemas.isActive, true)),
    ]);
    return {
      totalScreenings: screeningStats[0]?.totalScreenings || 0,
      uniqueFilms: screeningStats[0]?.uniqueFilms || 0,
      cinemaCount: cinemaCount[0]?.count || 0,
    };
  },
  ["home-stats"],
  { revalidate: 300, tags: ["screenings", "cinemas"] }
);

export default async function Home() {
  // Use date key to bust cache at midnight (ensures fresh data each day)
  const dateKey = format(new Date(), "yyyy-MM-dd");

  // Early return with fallback data if no database (CI/test environments)
  if (!isDatabaseAvailable) {
    const fallbackFaq = [
      { question: "What cinemas are in London?", answer: "Database not available in this environment." },
      { question: "How do I find film screenings in London?", answer: "Database not available in this environment." },
      { question: "What films are showing in London today?", answer: "Database not available in this environment." },
    ];
    return (
      <div className="min-h-screen bg-background-primary">
        <WebSiteSchema />
        <FAQSchema items={fallbackFaq} />
        <Header cinemas={[]} seasons={[]} availableFormats={[]} />
        <div className="px-4 sm:px-6 lg:px-8 pt-6">
          <h1 className="sr-only">London Cinema Listings - Independent & Art House Films</h1>
          <p className="text-sm text-text-tertiary mb-4 max-w-2xl">
            Find screenings at London cinemas. Database not available in CI/test environment.
          </p>
        </div>
        <main className="px-4 sm:px-6 lg:px-8 pb-6">
          <div className="p-6 bg-background-secondary/50 border border-border-subtle rounded-lg text-center">
            <p className="text-text-secondary">
              No screenings available. Database not connected.
            </p>
          </div>
          <section className="mt-12 pt-8 border-t border-border-subtle">
            <h2 className="text-lg font-display text-text-primary mb-6">
              Frequently Asked Questions
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {fallbackFaq.map((faq, index) => (
                <div key={index} className="space-y-2">
                  <h3 className="font-medium text-text-primary text-sm">{faq.question}</h3>
                  <p className="text-text-tertiary text-sm">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  // Fetch cached data (60s cache for screenings, 1hr for cinemas/seasons, 5min for stats)
  const [initialScreenings, allCinemas, activeSeasons, stats] = await Promise.all([
    getCachedScreenings(dateKey),
    getCachedCinemas(),
    getCachedActiveSeasons(),
    getCachedStats(),
  ]);

  // Extract unique formats from screenings (for format filter)
  const availableFormats = [...new Set(
    initialScreenings
      .map(s => s.format)
      .filter((f): f is NonNullable<typeof f> => f !== null)
  )];

  // Generate FAQ items for GEO (AI citations)
  const faqItems = [
    {
      question: "What cinemas are in London?",
      answer: `Pictures tracks ${stats.cinemaCount} cinemas across London, including BFI Southbank, Prince Charles Cinema, Curzon, Picturehouse, ICA, Barbican, Odeon, and more. These venues show everything from blockbusters to art house, repertory, and independent films.`,
    },
    {
      question: "How do I find film screenings in London?",
      answer: `Pictures aggregates listings from ${stats.cinemaCount} London cinemas into one calendar. Currently showing ${stats.uniqueFilms} films with ${stats.totalScreenings} upcoming screenings. Filter by cinema, date, format, or use the map to find screenings near you.`,
    },
    {
      question: "What films are showing in London today?",
      answer: `Pictures shows ${stats.uniqueFilms} unique films currently screening at London cinemas. Check the calendar above for today's listings, filtered by your preferred cinemas.`,
    },
  ];

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Structured Data for SEO */}
      <WebSiteSchema />
      <FAQSchema items={faqItems} />

      {/* Unified Header with Filters */}
      <Header
        cinemas={allCinemas.map(c => ({ id: c.id, name: c.name, shortName: c.shortName, chain: c.chain }))}
        seasons={isFeatureEnabled("seasons") ? activeSeasons : []}
        availableFormats={availableFormats}
      />

      {/* Feature Discovery Banner - dismissible once features are visited */}
      <FeatureDiscoveryBanner />

      {/* SEO H1 and Answer-First Summary */}
      <div className="px-4 sm:px-6 lg:px-8 pt-6">
        <h1 className="sr-only">
          London Cinema Listings - Independent & Art House Films
        </h1>
        {/* Answer-first summary for GEO - visible but subtle */}
        <p className="text-sm text-text-tertiary mb-4 max-w-2xl">
          Find screenings at {stats.cinemaCount} London cinemas.{" "}
          {stats.uniqueFilms} films with {stats.totalScreenings} upcoming screenings. Updated daily.
        </p>
      </div>

      {/* Main Content - Full Width */}
      <main className="px-4 sm:px-6 lg:px-8 pb-6">
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

        {/* FAQ Section - helps with GEO */}
        <section className="mt-12 pt-8 border-t border-border-subtle">
          <h2 className="text-lg font-display text-text-primary mb-6">
            Frequently Asked Questions
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
