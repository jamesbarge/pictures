/**
 * Director Detail Page
 * Shows director bio, their seasons, and upcoming screenings
 */

export const dynamic = "force-dynamic";

import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ChevronLeft,
  Calendar,
  MapPin,
  Film,
} from "lucide-react";
import { db } from "@/db";
import { seasons, seasonFilms, films, screenings } from "@/db/schema";
import { eq, and, gte, inArray, desc, asc } from "drizzle-orm";
import { format } from "date-fns";
import { getTMDBClient, TMDBClient } from "@/lib/tmdb";
import { BreadcrumbSchema } from "@/components/seo/json-ld";
import { isFeatureEnabled } from "@/lib/features";

const BASE_URL = "https://pictures.london";

interface DirectorPageProps {
  params: Promise<{ tmdbId: string }>;
}

export default async function DirectorPage({ params }: DirectorPageProps) {
  const { tmdbId } = await params;
  const tmdbIdNum = parseInt(tmdbId, 10);

  if (isNaN(tmdbIdNum)) {
    notFound();
  }

  // Fetch director's seasons from our database
  const directorSeasons = await db
    .select()
    .from(seasons)
    .where(eq(seasons.directorTmdbId, tmdbIdNum))
    .orderBy(desc(seasons.startDate));

  if (directorSeasons.length === 0) {
    notFound();
  }

  // Get director name from first season
  const directorName = directorSeasons[0].directorName || "Unknown Director";

  // Fetch TMDB data for bio and photo
  const client = getTMDBClient();
  let tmdbData: Awaited<ReturnType<typeof client.getDirectorData>> | null = null;

  try {
    tmdbData = await client.getDirectorData(tmdbIdNum);
  } catch {
    // Continue without TMDB data
  }

  const profileUrl = tmdbData?.details.profile_path
    ? TMDBClient.getProfileUrl(tmdbData.details.profile_path, "h632")
    : null;

  // Compute season statuses
  const now = new Date();
  const seasonsWithStatus = directorSeasons.map((season) => {
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

    return { ...season, status };
  });

  // Get all films from this director's seasons
  const seasonIds = directorSeasons.map((s) => s.id);
  let seasonFilmsList: { filmId: string; film: { id: string; title: string; year: number | null; posterUrl: string | null; runtime: number | null } }[] = [];

  if (seasonIds.length > 0) {
    seasonFilmsList = await db
      .select({
        filmId: seasonFilms.filmId,
        film: {
          id: films.id,
          title: films.title,
          year: films.year,
          posterUrl: films.posterUrl,
          runtime: films.runtime,
        },
      })
      .from(seasonFilms)
      .innerJoin(films, eq(seasonFilms.filmId, films.id))
      .where(inArray(seasonFilms.seasonId, seasonIds));
  }

  // Deduplicate films
  const uniqueFilms = Array.from(
    new Map(seasonFilmsList.map((sf) => [sf.film.id, sf.film])).values()
  );

  // Get upcoming screenings for these films
  const filmIds = uniqueFilms.map((f) => f.id);
  let upcomingScreenings: {
    id: string;
    datetime: Date;
    cinemaId: string;
    filmId: string;
    bookingUrl: string;
    filmTitle: string;
  }[] = [];

  if (filmIds.length > 0) {
    const screeningsData = await db
      .select({
        id: screenings.id,
        datetime: screenings.datetime,
        cinemaId: screenings.cinemaId,
        filmId: screenings.filmId,
        bookingUrl: screenings.bookingUrl,
        filmTitle: films.title,
      })
      .from(screenings)
      .innerJoin(films, eq(screenings.filmId, films.id))
      .where(
        and(inArray(screenings.filmId, filmIds), gte(screenings.datetime, now))
      )
      .orderBy(asc(screenings.datetime))
      .limit(20);

    upcomingScreenings = screeningsData;
  }

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

  // Breadcrumbs
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Directors", url: "/directors" },
    { name: directorName, url: `/directors/${tmdbId}` },
  ];

  // Count active seasons
  const activeSeasonCount = seasonsWithStatus.filter(
    (s) => s.status !== "past"
  ).length;

  return (
    <div className="min-h-screen bg-background-primary pb-12">
      {/* Structured Data */}
      <BreadcrumbSchema items={breadcrumbs} />

      {/* Back Navigation */}
      <div className="sticky top-0 z-50 bg-background-primary border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <Link
            href="/directors"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>All Directors</span>
          </Link>
        </div>
      </div>

      {/* Director Header */}
      <div className="bg-background-secondary border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex gap-6">
            {/* Profile Photo */}
            {profileUrl ? (
              <div className="relative w-32 h-40 flex-shrink-0 rounded-lg overflow-hidden bg-background-tertiary">
                <Image
                  src={profileUrl}
                  alt={directorName}
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-32 h-40 flex-shrink-0 rounded-lg bg-background-tertiary flex items-center justify-center">
                <span className="text-4xl font-display text-text-tertiary">
                  {directorName.charAt(0)}
                </span>
              </div>
            )}

            {/* Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-display text-text-primary mb-2 text-balance">
                {directorName}
              </h1>

              {/* Meta info */}
              <div className="flex flex-wrap gap-4 text-text-tertiary mb-4">
                {tmdbData?.details.birthday && (
                  <span>
                    Born {format(new Date(tmdbData.details.birthday), "d MMMM yyyy")}
                  </span>
                )}
                {tmdbData?.details.place_of_birth && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {tmdbData.details.place_of_birth}
                  </span>
                )}
              </div>

              {/* Stats */}
              <div className="flex gap-4 text-sm">
                {activeSeasonCount > 0 && (
                  <span className="text-accent-success">
                    {activeSeasonCount} active season
                    {activeSeasonCount !== 1 ? "s" : ""}
                  </span>
                )}
                <span className="text-text-tertiary">
                  {uniqueFilms.length} film{uniqueFilms.length !== 1 ? "s" : ""}{" "}
                  in seasons
                </span>
                {tmdbData && (
                  <span className="text-text-tertiary">
                    {tmdbData.totalFilms} films directed
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Biography */}
          {tmdbData?.details.biography && (
            <div className="mt-6">
              <p className="text-text-secondary text-sm leading-relaxed line-clamp-4 text-pretty">
                {tmdbData.details.biography}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Seasons (feature-flagged) */}
      {isFeatureEnabled("seasons") && (
        <div className="max-w-4xl mx-auto px-4 mt-8">
          <h2 className="text-xl font-display text-text-primary mb-4">
            Seasons at London Cinemas
          </h2>

          <div className="space-y-3">
            {seasonsWithStatus.map((season) => (
              <Link
                key={season.id}
                href={`/seasons/${season.slug}`}
                className="block bg-background-secondary border border-border-subtle rounded-lg p-4 hover:border-border-default transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    {/* Status badge */}
                    <div className="mb-2">
                      {season.status === "ongoing" && (
                        <span className="text-xs px-2 py-0.5 bg-accent-success/20 text-accent-success rounded">
                          Now showing
                        </span>
                      )}
                      {season.status === "upcoming" && (
                        <span className="text-xs px-2 py-0.5 bg-accent-primary/20 text-accent-primary rounded">
                          Coming soon
                        </span>
                      )}
                      {season.status === "past" && (
                        <span className="text-xs px-2 py-0.5 bg-background-tertiary text-text-tertiary rounded">
                          Ended
                        </span>
                      )}
                    </div>

                    <h3 className="font-display text-text-primary">
                      {season.name}
                    </h3>

                    <p className="text-sm text-text-tertiary flex items-center gap-1 mt-1">
                      <Calendar className="w-4 h-4" />
                      {format(new Date(season.startDate), "d MMM")} -{" "}
                      {format(new Date(season.endDate), "d MMM yyyy")}
                    </p>

                    {season.sourceCinemas && season.sourceCinemas.length > 0 && (
                      <p className="text-sm text-text-tertiary flex items-center gap-1 mt-1">
                        <MapPin className="w-4 h-4" />
                        {season.sourceCinemas
                          .map((slug) => formatCinemaName(slug))
                          .join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Screenings */}
      {upcomingScreenings.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 mt-12">
          <h2 className="text-xl font-display text-text-primary mb-4">
            Upcoming Screenings
          </h2>

          <div className="space-y-6">
            {Object.entries(screeningsByDate).map(([dateKey, dayScreenings]) => (
              <div key={dateKey}>
                <h3 className="text-sm font-medium text-text-tertiary mb-3">
                  {format(new Date(dateKey), "EEEE, d MMMM")}
                </h3>
                <div className="space-y-2">
                  {dayScreenings.map((screening) => (
                    <a
                      key={screening.id}
                      href={screening.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 bg-background-secondary border border-border-subtle rounded-lg p-3 hover:border-border-default transition-colors"
                    >
                      <div className="text-lg font-mono text-text-primary min-w-[50px]">
                        {format(screening.datetime, "HH:mm")}
                      </div>
                      <div className="flex-1">
                        <span className="text-text-primary">
                          {screening.filmTitle}
                        </span>
                        <span className="text-text-tertiary ml-2 text-sm">
                          at {formatCinemaName(screening.cinemaId)}
                        </span>
                      </div>
                      <span className="text-xs text-accent-primary">Book →</span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filmography from TMDB */}
      {tmdbData && tmdbData.directedFilms.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 mt-12">
          <h2 className="text-xl font-display text-text-primary mb-4">
            Filmography
            <span className="text-sm font-normal text-text-tertiary ml-2">
              ({tmdbData.totalFilms} films)
            </span>
          </h2>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {tmdbData.directedFilms.slice(0, 12).map((film) => (
              <div
                key={film.tmdbId}
                className="bg-background-secondary rounded overflow-hidden"
              >
                {film.posterPath ? (
                  <div className="relative w-full aspect-[2/3]">
                    <Image
                      src={TMDBClient.getPosterUrl(film.posterPath, "w154")!}
                      alt={film.title}
                      fill
                      sizes="154px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-full aspect-[2/3] bg-background-tertiary flex items-center justify-center">
                    <Film className="w-6 h-6 text-text-tertiary" />
                  </div>
                )}
                <div className="p-2">
                  <p className="text-xs text-text-primary truncate">
                    {film.title}
                  </p>
                  {film.releaseDate && (
                    <p className="text-xs text-text-tertiary">
                      {film.releaseDate.substring(0, 4)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {tmdbData.directedFilms.length > 12 && (
            <p className="text-sm text-text-tertiary mt-4">
              And {tmdbData.directedFilms.length - 12} more films...
            </p>
          )}
        </div>
      )}
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
}: DirectorPageProps): Promise<Metadata> {
  const { tmdbId } = await params;
  const tmdbIdNum = parseInt(tmdbId, 10);

  if (isNaN(tmdbIdNum)) {
    return { title: "Director Not Found" };
  }

  // Get director name from seasons
  const directorSeasons = await db
    .select({ directorName: seasons.directorName })
    .from(seasons)
    .where(eq(seasons.directorTmdbId, tmdbIdNum))
    .limit(1);

  if (directorSeasons.length === 0) {
    return { title: "Director Not Found" };
  }

  const directorName = directorSeasons[0].directorName || "Director";

  // Try to get bio from TMDB
  let description = `Films by ${directorName} at London cinemas.`;
  let imageUrl: string | undefined;

  try {
    const client = getTMDBClient();
    const details = await client.getPersonDetails(tmdbIdNum);
    if (details.biography) {
      description = details.biography.slice(0, 150) + "...";
    }
    if (details.profile_path) {
      imageUrl = TMDBClient.getProfileUrl(details.profile_path, "w185") || undefined;
    }
  } catch {
    // Continue without TMDB data
  }

  const title = `${directorName} - Films & Seasons | Pictures`;

  return {
    title,
    description,
    alternates: {
      canonical: `/directors/${tmdbId}`,
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/directors/${tmdbId}`,
      type: "profile",
      images: imageUrl ? [{ url: imageUrl }] : undefined,
    },
  };
}
