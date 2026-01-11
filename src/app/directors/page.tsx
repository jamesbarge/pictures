/**
 * Directors Page
 * Lists all directors who have seasons/retrospectives at London cinemas
 */

export const dynamic = "force-dynamic";

import { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Film, Calendar } from "lucide-react";
import { db } from "@/db";
import { seasons, seasonFilms } from "@/db/schema";
import { eq, isNotNull, count, sql, desc } from "drizzle-orm";
import { getTMDBClient, TMDBClient } from "@/lib/tmdb";
import { ItemListSchema, BreadcrumbSchema } from "@/components/seo/json-ld";

const BASE_URL = "https://pictures.london";

export const metadata: Metadata = {
  title: "Directors | Pictures",
  description:
    "Browse director retrospectives and seasons at London cinemas. Find films by Kurosawa, Hitchcock, Spielberg and more at BFI, Barbican, and independent venues.",
  alternates: {
    canonical: "/directors",
  },
  openGraph: {
    title: "Directors | Pictures",
    description:
      "Director retrospectives and seasons at London cinemas.",
    url: `${BASE_URL}/directors`,
    type: "website",
  },
};

interface DirectorWithSeasons {
  directorName: string;
  directorTmdbId: number;
  seasonCount: number;
  activeSeasonCount: number;
  profileUrl: string | null;
}

export default async function DirectorsPage() {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // Fetch distinct directors with TMDB IDs and their season counts
  const directorsData = await db
    .select({
      directorName: seasons.directorName,
      directorTmdbId: seasons.directorTmdbId,
      seasonCount: count(seasons.id),
      // Count active seasons (ongoing or upcoming)
      activeSeasonCount: sql<number>`COUNT(CASE WHEN ${seasons.endDate} >= ${today} THEN 1 END)`,
    })
    .from(seasons)
    .where(isNotNull(seasons.directorTmdbId))
    .groupBy(seasons.directorName, seasons.directorTmdbId)
    .orderBy(desc(sql`COUNT(CASE WHEN ${seasons.endDate} >= ${today} THEN 1 END)`));

  // Fetch profile photos from TMDB for directors with active seasons
  const client = getTMDBClient();
  const directorsWithProfiles: DirectorWithSeasons[] = await Promise.all(
    directorsData.map(async (director) => {
      let profileUrl: string | null = null;

      // Only fetch TMDB data for directors with active seasons to save API calls
      if (director.activeSeasonCount > 0 && director.directorTmdbId) {
        try {
          const details = await client.getPersonDetails(director.directorTmdbId);
          profileUrl = TMDBClient.getProfileUrl(details.profile_path, "w185");
        } catch {
          // Silently fail - we'll just show without photo
        }
      }

      return {
        directorName: director.directorName!,
        directorTmdbId: director.directorTmdbId!,
        seasonCount: director.seasonCount,
        activeSeasonCount: director.activeSeasonCount,
        profileUrl,
      };
    })
  );

  // Split into active and past directors
  const activeDirectors = directorsWithProfiles.filter(
    (d) => d.activeSeasonCount > 0
  );
  const pastDirectors = directorsWithProfiles.filter(
    (d) => d.activeSeasonCount === 0
  );

  // ItemList schema for SEO
  const listItems = activeDirectors.map((director, index) => ({
    name: director.directorName,
    url: `/directors/${director.directorTmdbId}`,
    position: index + 1,
  }));

  // Breadcrumbs
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Directors", url: "/directors" },
  ];

  return (
    <div className="min-h-screen bg-background-primary pb-12">
      {/* Structured Data */}
      <ItemListSchema
        name="Film Directors"
        description="Directors with retrospectives at London cinemas"
        items={listItems}
      />
      <BreadcrumbSchema items={breadcrumbs} />

      {/* Back Navigation */}
      <div className="sticky top-0 z-50 bg-background-primary/95 backdrop-blur-sm border-b border-border-subtle">
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
            <span className="text-text-primary">Directors</span>
          </nav>

          <h1 className="text-3xl font-display text-text-primary mb-2">
            Directors
          </h1>
          <p className="text-text-secondary">
            Browse director retrospectives and seasons at London cinemas.
            {activeDirectors.length > 0 && (
              <span className="text-accent-success">
                {" "}
                {activeDirectors.length} director
                {activeDirectors.length !== 1 ? "s" : ""} with active seasons.
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Directors with Active Seasons */}
      <div className="max-w-4xl mx-auto px-4 mt-8">
        {activeDirectors.length === 0 ? (
          <p className="text-text-secondary text-center py-12">
            No director seasons currently running. Check back soon for upcoming
            retrospectives.
          </p>
        ) : (
          <>
            <h2 className="text-lg font-display text-text-primary mb-4">
              Currently Showing
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {activeDirectors.map((director) => (
                <DirectorCard key={director.directorTmdbId} director={director} />
              ))}
            </div>
          </>
        )}

        {/* Past Directors (collapsed) */}
        {pastDirectors.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-display text-text-tertiary mb-4">
              Past Seasons
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 opacity-60">
              {pastDirectors.map((director) => (
                <DirectorCard
                  key={director.directorTmdbId}
                  director={director}
                  muted
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface DirectorCardProps {
  director: DirectorWithSeasons;
  muted?: boolean;
}

function DirectorCard({ director, muted }: DirectorCardProps) {
  return (
    <Link
      href={`/directors/${director.directorTmdbId}`}
      className={`flex items-center gap-4 bg-background-card border border-border-subtle rounded-lg p-4 hover:border-border-default transition-colors ${
        muted ? "opacity-70" : ""
      }`}
    >
      {/* Profile Photo */}
      {director.profileUrl ? (
        <div className="w-16 h-16 flex-shrink-0 rounded-full overflow-hidden bg-background-tertiary">
          <img
            src={director.profileUrl}
            alt={director.directorName}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-16 h-16 flex-shrink-0 rounded-full bg-background-tertiary flex items-center justify-center">
          <span className="text-2xl font-display text-text-tertiary">
            {director.directorName.charAt(0)}
          </span>
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-display text-text-primary truncate">
          {director.directorName}
        </h3>
        <div className="flex items-center gap-3 text-sm text-text-tertiary mt-1">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {director.activeSeasonCount > 0 ? (
              <span className="text-accent-success">
                {director.activeSeasonCount} active
              </span>
            ) : (
              <span>{director.seasonCount} season{director.seasonCount !== 1 ? "s" : ""}</span>
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}
