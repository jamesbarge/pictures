"use client";

/**
 * FestivalCard Component
 * Displays a festival with key dates, status, and follow button
 */

import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FollowButton } from "./follow-button";
import { Calendar, MapPin, Ticket, Clock } from "lucide-react";
import { format, formatDistanceToNow, isPast, isFuture, isWithinInterval } from "date-fns";
import Link from "next/link";

export interface FestivalCardProps {
  festival: {
    id: string;
    name: string;
    slug: string;
    shortName: string | null;
    year: number;
    description: string | null;
    websiteUrl: string | null;
    logoUrl: string | null;
    startDate: string;
    endDate: string;
    memberSaleDate: string | null;
    publicSaleDate: string | null;
    genreFocus: string[] | null;
    venues: string[] | null;
    status: "upcoming" | "ongoing" | "past";
    ticketStatus: "not_announced" | "member_sale" | "public_sale" | "on_sale" | null;
    isFollowing: boolean;
    interestLevel: string | null;
  };
}

export function FestivalCard({ festival }: FestivalCardProps) {
  const startDate = new Date(festival.startDate);
  const endDate = new Date(festival.endDate);
  const now = new Date();

  // Format date range
  const formatDateRange = () => {
    const startMonth = format(startDate, "MMM");
    const endMonth = format(endDate, "MMM");
    const startDay = format(startDate, "d");
    const endDay = format(endDate, "d");
    const year = format(startDate, "yyyy");

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay}-${endDay}, ${year}`;
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
  };

  // Get status badge config
  const getStatusBadge = () => {
    switch (festival.status) {
      case "ongoing":
        return { variant: "success" as const, text: "Now On" };
      case "upcoming":
        const daysUntil = formatDistanceToNow(startDate, { addSuffix: true });
        return { variant: "primary" as const, text: `Starts ${daysUntil}` };
      case "past":
        return { variant: "default" as const, text: "Ended" };
    }
  };

  // Get ticket status badge
  const getTicketBadge = () => {
    switch (festival.ticketStatus) {
      case "on_sale":
        return { variant: "success" as const, text: "Tickets On Sale" };
      case "member_sale":
        return { variant: "warning" as const, text: "Member Sale" };
      case "public_sale":
        return { variant: "primary" as const, text: "Public Sale Soon" };
      case "not_announced":
        return null;
      default:
        return null;
    }
  };

  const statusBadge = getStatusBadge();
  const ticketBadge = getTicketBadge();

  return (
    <Card variant="interactive" className="group">
      <Link href={`/festivals/${festival.slug}`} className="block">
        {/* Header with logo/name */}
        <CardHeader
          heading={
            <span className="group-hover:text-accent-primary transition-colors">
              {festival.name}
            </span>
          }
          subtitle={formatDateRange()}
          action={
            <div className="flex items-center gap-2">
              <Badge variant={statusBadge.variant} size="sm">
                {statusBadge.text}
              </Badge>
            </div>
          }
        />

        {/* Content */}
        <CardContent>
          {/* Description */}
          {festival.description && (
            <p className="text-sm text-text-secondary line-clamp-2 mb-3">
              {festival.description}
            </p>
          )}

          {/* Meta info row */}
          <div className="flex flex-wrap gap-3 text-xs text-text-tertiary">
            {/* Venues */}
            {festival.venues && festival.venues.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {festival.venues.length === 1
                  ? festival.venues[0]
                  : `${festival.venues.length} venues`}
              </span>
            )}

            {/* Genre focus */}
            {festival.genreFocus && festival.genreFocus.length > 0 && (
              <span className="inline-flex items-center gap-1 capitalize">
                {festival.genreFocus.slice(0, 2).join(", ")}
                {festival.genreFocus.length > 2 && ` +${festival.genreFocus.length - 2}`}
              </span>
            )}
          </div>

          {/* Ticket status */}
          {ticketBadge && (
            <div className="mt-3 flex items-center gap-2">
              <Ticket className="w-4 h-4 text-text-tertiary" />
              <Badge variant={ticketBadge.variant} size="sm">
                {ticketBadge.text}
              </Badge>
              {festival.publicSaleDate && festival.ticketStatus !== "on_sale" && (
                <span className="text-xs text-text-tertiary">
                  Public: {format(new Date(festival.publicSaleDate), "MMM d")}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Link>

      {/* Footer with follow button */}
      <CardFooter>
        <div className="flex items-center gap-2">
          {festival.genreFocus?.slice(0, 3).map((genre) => (
            <Badge key={genre} variant="outline" size="sm" className="capitalize">
              {genre}
            </Badge>
          ))}
        </div>
        <FollowButton
          festivalId={festival.id}
          festivalName={festival.name}
          festivalSlug={festival.slug}
          isFollowing={festival.isFollowing}
        />
      </CardFooter>
    </Card>
  );
}

// Skeleton for loading state
export function FestivalCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader
        heading={<div className="h-5 bg-background-tertiary rounded w-48 skeleton" />}
        subtitle={<div className="h-4 bg-background-tertiary rounded w-32 skeleton mt-1" />}
      />
      <CardContent>
        <div className="space-y-2">
          <div className="h-4 bg-background-tertiary rounded w-full skeleton" />
          <div className="h-4 bg-background-tertiary rounded w-3/4 skeleton" />
        </div>
        <div className="flex gap-2 mt-3">
          <div className="h-5 bg-background-tertiary rounded w-16 skeleton" />
          <div className="h-5 bg-background-tertiary rounded w-20 skeleton" />
        </div>
      </CardContent>
      <CardFooter>
        <div className="h-6 bg-background-tertiary rounded w-24 skeleton" />
        <div className="h-8 bg-background-tertiary rounded w-20 skeleton" />
      </CardFooter>
    </Card>
  );
}
