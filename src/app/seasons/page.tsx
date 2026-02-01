/**
 * Seasons Page
 * Lists all director seasons and retrospectives running at London cinemas
 */

export const dynamic = "force-dynamic";

import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ChevronLeft, Calendar, Film, MapPin } from "lucide-react";
import { db } from "@/db";
import { seasons, seasonFilms } from "@/db/schema";
import { eq, count, asc } from "drizzle-orm";
import { format } from "date-fns";
import { ItemListSchema, BreadcrumbSchema } from "@/components/seo/json-ld";
import { isFeatureEnabled } from "@/lib/features";

const BASE_URL = "https://pictures.london";

export const metadata: Metadata = {
  title: "Film Seasons & Retrospectives | Pictures",
  description:
    "Discover director retrospectives and curated film seasons at London cinemas. Kurosawa, Hitchcock, and more at BFI, Barbican, Prince Charles Cinema, and ICA.",
  alternates: {
    canonical: "/seasons",
  },
  openGraph: {
    title: "Film Seasons & Retrospectives | Pictures",
    description:
      "Director retrospectives and curated film seasons at London cinemas.",
    url: `${BASE_URL}/seasons`,
    type: "website",
  },
};

type SeasonStatus = "ongoing" | "upcoming" | "past";

export default async function SeasonsPage() {
  if (!isFeatureEnabled("seasons")) {
    notFound();
  }

  const now = new Date();

  // Fetch all active seasons with film counts
  const seasonsWithStats = await db
    .select({
      id: seasons.id,
      name: seasons.name,
      slug: seasons.slug,
      description: seasons.description,
      directorName: seasons.directorName,
      directorTmdbId: seasons.directorTmdbId,
      startDate: seasons.startDate,
      endDate: seasons.endDate,
      posterUrl: seasons.posterUrl,
      websiteUrl: seasons.websiteUrl,
      sourceCinemas: seasons.sourceCinemas,
      isActive: seasons.isActive,
      filmCount: count(seasonFilms.filmId),
    })
    .from(seasons)
    .leftJoin(seasonFilms, eq(seasonFilms.seasonId, seasons.id))
    .where(eq(seasons.isActive, true))
    .groupBy(seasons.id)
    .orderBy(asc(seasons.startDate));

  // Compute status for each season and format data
  const seasonsWithStatus = seasonsWithStats.map((season) => {
    const startDate = new Date(season.startDate);
    const endDate = new Date(season.endDate);

    let status: SeasonStatus;
    if (now < startDate) {
      status = "upcoming";
    } else if (now > endDate) {
      status = "past";
    } else {
      status = "ongoing";
    }

    return {
      ...season,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      status,
    };
  });

  // Sort: ongoing first, then upcoming, then past
  const sortedSeasons = seasonsWithStatus.sort((a, b) => {
    const statusOrder = { ongoing: 0, upcoming: 1, past: 2 };
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    // Within same status, sort by start date
    return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  });

  // Filter to current and upcoming by default (hide past)
  const activeSeasons = sortedSeasons.filter(
    (s) => s.status !== "past" && s.filmCount > 0
  );

  // Count stats
  const ongoingCount = seasonsWithStatus.filter(
    (s) => s.status === "ongoing" && s.filmCount > 0
  ).length;
  const upcomingCount = seasonsWithStatus.filter(
    (s) => s.status === "upcoming" && s.filmCount > 0
  ).length;

  // ItemList schema for SEO
  const listItems = activeSeasons.map((season, index) => ({
    name: season.name,
    url: `/seasons/${season.slug}`,
    position: index + 1,
  }));

  // Breadcrumbs
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Seasons", url: "/seasons" },
  ];

  return (
    <div className="min-h-screen bg-background-primary pb-12">
      {/* Structured Data */}
      <ItemListSchema
        name="Film Seasons & Retrospectives"
        description="Director retrospectives and curated film seasons at London cinemas"
        items={listItems}
      />
      <BreadcrumbSchema items={breadcrumbs} />

      {/* Back Navigation */}
      <div className="sticky top-0 z-50 bg-background-primary border-b border-border-subtle">
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

      {/* Header */}
      <div className="bg-background-secondary border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Breadcrumb nav */}
          <nav className="text-sm text-text-tertiary mb-4">
            <Link href="/" className="hover:text-text-primary">
              Home
            </Link>
            <span className="mx-2">/</span>
            <span className="text-text-primary">Seasons</span>
          </nav>

          <h1 className="text-3xl font-display text-text-primary mb-2 text-balance">
            Film Seasons & Retrospectives
          </h1>
          <p className="text-text-secondary">
            Director retrospectives and curated film seasons at London cinemas.
            {ongoingCount > 0 && (
              <span className="text-accent-success">
                {" "}
                {ongoingCount} season{ongoingCount !== 1 ? "s" : ""} happening
                now.
              </span>
            )}
            {upcomingCount > 0 && (
              <span>
                {" "}
                {upcomingCount} upcoming.
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Seasons List */}
      <div className="max-w-4xl mx-auto px-4 mt-8">
        {activeSeasons.length === 0 ? (
          <p className="text-text-secondary text-center py-12">
            No seasons currently running. Check back soon for upcoming
            retrospectives.
          </p>
        ) : (
          <div className="grid gap-4">
            {activeSeasons.map((season) => (
              <SeasonCard key={season.id} season={season} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SeasonCardProps {
  season: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    directorName: string | null;
    startDate: string;
    endDate: string;
    posterUrl: string | null;
    sourceCinemas: string[] | null;
    filmCount: number;
    status: SeasonStatus;
  };
}

function SeasonCard({ season }: SeasonCardProps) {
  const startDate = new Date(season.startDate);
  const endDate = new Date(season.endDate);

  // Format date range
  const dateRange =
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getFullYear() === endDate.getFullYear()
      ? `${format(startDate, "d")} - ${format(endDate, "d MMM yyyy")}`
      : `${format(startDate, "d MMM")} - ${format(endDate, "d MMM yyyy")}`;

  return (
    <Link
      href={`/seasons/${season.slug}`}
      className="block bg-background-card border border-border-subtle rounded-lg overflow-hidden hover:border-border-default transition-colors"
    >
      <div className="flex">
        {/* Poster (if available) */}
        {season.posterUrl && (
          <div className="relative w-24 h-32 flex-shrink-0 bg-background-tertiary">
            <Image
              src={season.posterUrl}
              alt={season.name}
              fill
              sizes="96px"
              className="object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
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
              </div>

              {/* Title */}
              <h2 className="text-lg font-display text-text-primary mb-1">
                {season.name}
              </h2>

              {/* Director */}
              {season.directorName && (
                <p className="text-sm text-text-secondary mb-2">
                  Dir. {season.directorName}
                </p>
              )}

              {/* Date range */}
              <p className="text-sm text-text-tertiary flex items-center gap-1 mb-2">
                <Calendar className="w-4 h-4" />
                {dateRange}
              </p>

              {/* Venues */}
              {season.sourceCinemas && season.sourceCinemas.length > 0 && (
                <p className="text-sm text-text-tertiary flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {season.sourceCinemas
                    .map((slug) => formatCinemaName(slug))
                    .join(", ")}
                </p>
              )}
            </div>

            {/* Film count */}
            <div className="text-right">
              <div className="flex items-center gap-1 text-text-secondary">
                <Film className="w-4 h-4" />
                <span className="text-sm font-mono">{season.filmCount}</span>
              </div>
              <p className="text-xs text-text-tertiary">films</p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

/**
 * Format cinema slug to readable name
 */
function formatCinemaName(slug: string): string {
  // Common cinema name mappings
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
