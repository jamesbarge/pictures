import type { Metadata } from "next";
import { db, isDatabaseAvailable } from "@/db";
import { screenings, cinemas } from "@/db/schema";
import { eq, gte, count, countDistinct } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { LetterboxdImport } from "@/components/watchlist/letterboxd-import";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Letterboxd Watchlist — What's Screening in London | Pictures",
  description:
    "Enter your Letterboxd username and instantly see which of your watchlist films are screening across London cinemas.",
};

const getCachedStats = unstable_cache(
  async () => {
    const now = new Date();
    const [screeningStats, cinemaCount] = await Promise.all([
      db
        .select({
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
      uniqueFilms: screeningStats[0]?.uniqueFilms || 0,
      cinemaCount: cinemaCount[0]?.count || 0,
    };
  },
  ["letterboxd-stats"],
  { revalidate: 300, tags: ["screenings", "cinemas"] },
);

export default async function LetterboxdPage() {
  let filmCount = 0;
  let cinemaCount = 0;

  if (isDatabaseAvailable) {
    const stats = await getCachedStats();
    filmCount = stats.uniqueFilms;
    cinemaCount = stats.cinemaCount;
  }

  return (
    <>
      <nav className="border-b border-border-subtle px-4 py-4">
        <Link
          href="/"
          className="text-lg font-display text-text-primary hover:text-accent-primary transition-colors"
        >
          Pictures
        </Link>
      </nav>
      <main className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-display text-text-primary mb-4">
            Your Letterboxd watchlist, playing in London
          </h1>
          <p className="text-lg text-text-secondary max-w-lg mx-auto">
            Enter your Letterboxd username and instantly see which of your
            watchlist films are screening across {cinemaCount || "50+"} London
            cinemas.
          </p>
        </div>

        <LetterboxdImport />

        {(filmCount > 0 || cinemaCount > 0) && (
          <p className="text-center text-sm text-text-tertiary mt-12">
            Tracking {filmCount.toLocaleString()} films across {cinemaCount}{" "}
            London cinemas. Updated daily.
          </p>
        )}
      </main>
    </>
  );
}
