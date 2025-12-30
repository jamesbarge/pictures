import { MetadataRoute } from "next";
import { db } from "@/db";
import { films, cinemas, festivals } from "@/db/schema";
import { eq, isNotNull } from "drizzle-orm";

const BASE_URL = "https://postboxd.co.uk";

/**
 * Dynamic sitemap for Postboxd
 *
 * Includes:
 * - Static pages (home, map, festivals, watchlist)
 * - All film pages with screenings
 * - All cinema pages
 * - All festival pages
 *
 * Priority strategy:
 * - 1.0: Home page (main entry point)
 * - 0.9: Cinema pages (high-value local SEO)
 * - 0.8: Festival pages (timely content)
 * - 0.7: Film pages (individual content)
 * - 0.6: Static feature pages
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/festivals`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/cinemas`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/map`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/reachable`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.6,
    },
  ];

  // Fetch all films with TMDB data (enriched films)
  const allFilms = await db
    .select({
      id: films.id,
      updatedAt: films.updatedAt,
    })
    .from(films)
    .where(isNotNull(films.tmdbId));

  const filmPages: MetadataRoute.Sitemap = allFilms.map((film) => ({
    url: `${BASE_URL}/film/${film.id}`,
    lastModified: film.updatedAt || now,
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  // Fetch all active cinemas
  const allCinemas = await db
    .select({
      id: cinemas.id,
      updatedAt: cinemas.updatedAt,
    })
    .from(cinemas)
    .where(eq(cinemas.isActive, true));

  const cinemaPages: MetadataRoute.Sitemap = allCinemas.map((cinema) => ({
    url: `${BASE_URL}/cinemas/${cinema.id}`,
    lastModified: cinema.updatedAt || now,
    changeFrequency: "daily" as const,
    priority: 0.9,
  }));

  // Fetch all active festivals
  const allFestivals = await db
    .select({
      slug: festivals.slug,
      updatedAt: festivals.updatedAt,
    })
    .from(festivals)
    .where(eq(festivals.isActive, true));

  const festivalPages: MetadataRoute.Sitemap = allFestivals.map((festival) => ({
    url: `${BASE_URL}/festivals/${festival.slug}`,
    lastModified: festival.updatedAt || now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...cinemaPages, ...festivalPages, ...filmPages];
}
