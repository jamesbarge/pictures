/**
 * Festival Detail Page
 * Shows festival information, key dates, venues, and programme
 */

// Force dynamic for user-specific follow status
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { db } from "@/db";
import { festivals, userFestivalInterests, cinemas } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/auth";
import { FestivalHeader } from "@/components/festivals/festival-header";
import { FestivalKeyDates } from "@/components/festivals/festival-key-dates";
import { FestivalVenues } from "@/components/festivals/festival-venues";
import { FollowButton } from "@/components/festivals/follow-button";
import { FestivalProgramme } from "@/components/festivals/festival-programme";

interface FestivalPageProps {
  params: Promise<{ slug: string }>;
}

export default async function FestivalPage({ params }: FestivalPageProps) {
  const { slug } = await params;
  const userId = await getCurrentUserId();

  // Fetch festival with optional follow status
  let result;

  if (userId) {
    const results = await db
      .select({
        festival: festivals,
        isFollowing: sql<boolean>`${userFestivalInterests.userId} IS NOT NULL`,
        interestLevel: userFestivalInterests.interestLevel,
      })
      .from(festivals)
      .leftJoin(
        userFestivalInterests,
        and(
          eq(userFestivalInterests.festivalId, festivals.id),
          eq(userFestivalInterests.userId, userId)
        )
      )
      .where(eq(festivals.slug, slug))
      .limit(1);

    result = results[0];
  } else {
    const results = await db
      .select({
        festival: festivals,
        isFollowing: sql<boolean>`false`,
        interestLevel: sql<string | null>`null`,
      })
      .from(festivals)
      .where(eq(festivals.slug, slug))
      .limit(1);

    result = results[0];
  }

  if (!result) {
    notFound();
  }

  const { festival, isFollowing } = result;

  // Compute status
  const now = new Date();
  const startDate = new Date(festival.startDate);
  const endDate = new Date(festival.endDate);

  let status: "upcoming" | "ongoing" | "past";
  if (now < startDate) {
    status = "upcoming";
  } else if (now > endDate) {
    status = "past";
  } else {
    status = "ongoing";
  }

  // Fetch venue details if venues are specified
  let venueDetails: Array<{
    id: string;
    name: string;
    shortName: string | null;
    address: { area?: string } | null;
  }> = [];

  if (festival.venues && festival.venues.length > 0) {
    venueDetails = await db
      .select({
        id: cinemas.id,
        name: cinemas.name,
        shortName: cinemas.shortName,
        address: cinemas.address,
      })
      .from(cinemas)
      .where(inArray(cinemas.id, festival.venues));
  }

  return (
    <div className="min-h-screen bg-background-primary pb-24">
      {/* Back Navigation */}
      <div className="sticky top-0 z-50 bg-background-primary/95 backdrop-blur-sm border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/festivals"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>All Festivals</span>
          </Link>

          {festival.websiteUrl && (
            <a
              href={festival.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent-primary transition-colors"
            >
              <span>Official Site</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {/* Festival Header */}
      <FestivalHeader festival={festival} status={status} />

      {/* Action Bar */}
      <div className="max-w-4xl mx-auto px-4 mt-6">
        <div className="flex items-center gap-3">
          <FollowButton
            festivalId={festival.id}
            festivalName={festival.name}
            festivalSlug={festival.slug}
            isFollowing={isFollowing}
            size="md"
          />

          {festival.websiteUrl && (
            <a
              href={festival.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-background-secondary text-text-primary border border-border-default hover:bg-background-hover hover:border-border-emphasis transition-colors"
            >
              Visit Website
            </a>
          )}
        </div>
      </div>

      {/* Key Dates */}
      <div className="max-w-4xl mx-auto px-4 mt-10">
        <FestivalKeyDates
          startDate={festival.startDate}
          endDate={festival.endDate}
          programmAnnouncedDate={festival.programmAnnouncedDate}
          memberSaleDate={festival.memberSaleDate}
          publicSaleDate={festival.publicSaleDate}
          status={status}
        />
      </div>

      {/* Venues */}
      {venueDetails.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 mt-10">
          <FestivalVenues venues={venueDetails} />
        </div>
      )}

      {/* Programme */}
      <div className="max-w-4xl mx-auto px-4 mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display text-text-primary">
            Programme
          </h2>
          {status === "ongoing" && (
             <Link
              href={`/?festival=${festival.slug}`}
              className="text-sm text-accent-primary hover:text-accent-primary-hover flex items-center gap-1"
            >
              View in Calendar <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>
        
        {status === "upcoming" && !festival.programmAnnouncedDate ? (
           <div className="bg-background-secondary border border-border-subtle rounded-lg p-8 text-center text-text-secondary">
              Programme coming soon. Follow this festival to get notified when it's announced.
           </div>
        ) : (
          <FestivalProgramme festivalId={festival.id} />
        )}
      </div>
    </div>
  );
}

// Generate metadata
export async function generateMetadata({ params }: FestivalPageProps) {
  const { slug } = await params;

  const result = await db
    .select()
    .from(festivals)
    .where(eq(festivals.slug, slug))
    .limit(1);

  if (result.length === 0) {
    return { title: "Festival Not Found" };
  }

  const festival = result[0];
  return {
    title: `${festival.name} | Postboxd`,
    description:
      festival.description ||
      `${festival.name} - London film festival information and programme`,
  };
}
