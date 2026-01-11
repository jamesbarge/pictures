/**
 * Season Detail Page
 * Shows season info, director details, and films in the season
 */

export const dynamic = "force-dynamic";

import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Calendar,
  MapPin,
  ExternalLink,
  Film,
  Clock,
} from "lucide-react";
import { db } from "@/db";
import { seasons, seasonFilms, films, screenings, cinemas } from "@/db/schema";
import { eq, and, gte, inArray } from "drizzle-orm";
import { format } from "date-fns";
import { BreadcrumbSchema } from "@/components/seo/json-ld";

const BASE_URL = "https://pictures.london";

interface SeasonPageProps {
  params: Promise<{ slug: string }>;
}

export default async function SeasonPage({ params }: SeasonPageProps) {
  const { slug } = await params;

  // Fetch season with films
  const seasonData = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, slug))
    .limit(1);

  if (seasonData.length === 0) {
    notFound();
  }

  const season = seasonData[0];

  // Fetch films in this season
  const seasonFilmsList = await db
    .select({
      film: {
        id: films.id,
        title: films.title,
        year: films.year,
        posterUrl: films.posterUrl,
        runtime: films.runtime,
        directors: films.directors,
        synopsis: films.synopsis,
      },
      orderIndex: seasonFilms.orderIndex,
    })
    .from(seasonFilms)
    .innerJoin(films, eq(seasonFilms.filmId, films.id))
    .where(eq(seasonFilms.seasonId, season.id))
    .orderBy(seasonFilms.orderIndex);

  // Get upcoming screenings for these films
  const filmIds = seasonFilmsList.map((sf) => sf.film.id);
  const now = new Date();

  let upcomingScreenings: {
    id: string;
    datetime: Date;
    cinemaId: string;
    filmId: string;
    format: string | null;
    bookingUrl: string;
  }[] = [];

  if (filmIds.length > 0) {
    upcomingScreenings = await db
      .select({
        id: screenings.id,
        datetime: screenings.datetime,
        cinemaId: screenings.cinemaId,
        filmId: screenings.filmId,
        format: screenings.format,
        bookingUrl: screenings.bookingUrl,
      })
      .from(screenings)
      .where(
        and(inArray(screenings.filmId, filmIds), gte(screenings.datetime, now))
      )
      .orderBy(screenings.datetime)
      .limit(50);
  }

  // Group screenings by film
  const screeningsByFilm = upcomingScreenings.reduce(
    (acc, screening) => {
      if (!acc[screening.filmId]) {
        acc[screening.filmId] = [];
      }
      acc[screening.filmId].push(screening);
      return acc;
    },
    {} as Record<string, typeof upcomingScreenings>
  );

  // Compute season status
  const startDate = new Date(season.startDate);
  const endDate = new Date(season.endDate);
  let status: "ongoing" | "upcoming" | "past";
  if (now < startDate) {
    status = "upcoming";
  } else if (now > endDate) {
    status = "past";
  } else {
    status = "ongoing";
  }

  // Format date range
  const dateRange =
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getFullYear() === endDate.getFullYear()
      ? `${format(startDate, "d")} - ${format(endDate, "d MMMM yyyy")}`
      : `${format(startDate, "d MMMM")} - ${format(endDate, "d MMMM yyyy")}`;

  // Breadcrumbs
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Seasons", url: "/seasons" },
    { name: season.name, url: `/seasons/${slug}` },
  ];

  return (
    <div className="min-h-screen bg-background-primary pb-12">
      {/* Structured Data */}
      <BreadcrumbSchema items={breadcrumbs} />

      {/* Back Navigation */}
      <div className="sticky top-0 z-50 bg-background-primary/95 backdrop-blur-sm border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <Link
            href="/seasons"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>All Seasons</span>
          </Link>
        </div>
      </div>

      {/* Season Header */}
      <div className="bg-background-secondary border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Status badge */}
          <div className="mb-4">
            {status === "ongoing" && (
              <span className="text-sm px-3 py-1 bg-accent-success/20 text-accent-success rounded-full">
                Now showing
              </span>
            )}
            {status === "upcoming" && (
              <span className="text-sm px-3 py-1 bg-accent-primary/20 text-accent-primary rounded-full">
                Coming soon
              </span>
            )}
            {status === "past" && (
              <span className="text-sm px-3 py-1 bg-background-tertiary text-text-tertiary rounded-full">
                Ended
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-3xl font-display text-text-primary mb-2">
            {season.name}
          </h1>

          {/* Director */}
          {season.directorName && (
            <p className="text-lg text-text-secondary mb-4">
              A retrospective of films by {season.directorName}
            </p>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap gap-4 text-text-tertiary mb-4">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {dateRange}
            </span>
            <span className="flex items-center gap-1">
              <Film className="w-4 h-4" />
              {seasonFilmsList.length} film
              {seasonFilmsList.length !== 1 ? "s" : ""}
            </span>
            {season.sourceCinemas && season.sourceCinemas.length > 0 && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {season.sourceCinemas
                  .map((slug) => formatCinemaName(slug))
                  .join(", ")}
              </span>
            )}
          </div>

          {/* Description */}
          {season.description && (
            <p className="text-text-secondary mb-4">{season.description}</p>
          )}

          {/* Website link */}
          {season.websiteUrl && (
            <a
              href={season.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-accent-primary hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              View on cinema website
            </a>
          )}
        </div>
      </div>

      {/* Films Grid */}
      <div className="max-w-4xl mx-auto px-4 mt-8">
        <h2 className="text-xl font-display text-text-primary mb-6">
          Films in this season
        </h2>

        {seasonFilmsList.length === 0 ? (
          <p className="text-text-secondary">
            No films have been linked to this season yet.
          </p>
        ) : (
          <div className="space-y-6">
            {seasonFilmsList.map(({ film }) => {
              const filmScreenings = screeningsByFilm[film.id] || [];

              return (
                <div
                  key={film.id}
                  className="bg-background-card border border-border-subtle rounded-lg overflow-hidden"
                >
                  <div className="flex">
                    {/* Poster */}
                    {film.posterUrl ? (
                      <div className="w-28 h-40 flex-shrink-0 bg-background-tertiary">
                        <img
                          src={film.posterUrl}
                          alt={film.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-28 h-40 flex-shrink-0 bg-background-tertiary flex items-center justify-center">
                        <Film className="w-8 h-8 text-text-tertiary" />
                      </div>
                    )}

                    {/* Film Info */}
                    <div className="flex-1 p-4">
                      <Link
                        href={`/film/${film.id}`}
                        className="hover:text-accent-primary transition-colors"
                      >
                        <h3 className="text-lg font-display text-text-primary">
                          {film.title}
                          {film.year && (
                            <span className="text-text-tertiary ml-2">
                              ({film.year})
                            </span>
                          )}
                        </h3>
                      </Link>

                      {film.directors && film.directors.length > 0 && (
                        <p className="text-sm text-text-secondary mt-1">
                          Dir. {film.directors.join(", ")}
                        </p>
                      )}

                      {film.runtime && (
                        <p className="text-sm text-text-tertiary flex items-center gap-1 mt-1">
                          <Clock className="w-3 h-3" />
                          {film.runtime} min
                        </p>
                      )}

                      {/* Upcoming screenings for this film */}
                      {filmScreenings.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-text-tertiary uppercase mb-2">
                            Upcoming screenings
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {filmScreenings.slice(0, 4).map((screening) => (
                              <a
                                key={screening.id}
                                href={screening.bookingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-2 py-1 bg-background-tertiary rounded hover:bg-background-primary transition-colors"
                              >
                                {format(screening.datetime, "EEE d MMM, HH:mm")}
                              </a>
                            ))}
                            {filmScreenings.length > 4 && (
                              <span className="text-xs text-text-tertiary px-2 py-1">
                                +{filmScreenings.length - 4} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Format cinema slug to readable name
 */
function formatCinemaName(slug: string): string {
  const nameMap: Record<string, string> = {
    "bfi-southbank": "BFI Southbank",
    "bfi-imax": "BFI IMAX",
    barbican: "Barbican",
    "prince-charles-cinema": "Prince Charles",
    ica: "ICA",
    "close-up-cinema": "Close-Up",
    rio: "Rio Cinema",
    genesis: "Genesis",
  };

  return (
    nameMap[slug] ||
    slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

// Generate metadata
export async function generateMetadata({
  params,
}: SeasonPageProps): Promise<Metadata> {
  const { slug } = await params;

  const seasonData = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, slug))
    .limit(1);

  if (seasonData.length === 0) {
    return { title: "Season Not Found" };
  }

  const season = seasonData[0];
  const title = `${season.name} | Pictures`;
  const description = season.description
    ? `${season.description.slice(0, 150)}...`
    : season.directorName
      ? `${season.name} - A retrospective of films by ${season.directorName} at London cinemas.`
      : `${season.name} - Film season at London cinemas.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/seasons/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/seasons/${slug}`,
      type: "website",
      images: season.posterUrl ? [{ url: season.posterUrl }] : undefined,
    },
  };
}
