/**
 * Screening Card Skeleton
 * Loading placeholder for screening cards with shimmer animation
 */

import { cn } from "@/lib/cn";

interface ScreeningCardSkeletonProps {
  className?: string;
}

export function ScreeningCardSkeleton({ className }: ScreeningCardSkeletonProps) {
  return (
    <article
      className={cn(
        "flex gap-4 p-4 rounded-lg",
        "bg-background-secondary/50 border border-border-subtle",
        className
      )}
      aria-hidden="true"
    >
      {/* Poster skeleton */}
      <div className="shrink-0 w-20 h-28 sm:w-24 sm:h-36 rounded-md skeleton" />

      {/* Content skeleton */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* Title */}
        <div className="h-6 w-3/4 rounded skeleton" />

        {/* Director */}
        <div className="h-4 w-1/2 rounded skeleton" />

        {/* Time & Cinema */}
        <div className="flex items-center gap-2 mt-1">
          <div className="h-4 w-12 rounded skeleton" />
          <div className="h-4 w-16 rounded skeleton" />
          <div className="h-4 w-14 rounded skeleton" />
        </div>

        {/* Badges */}
        <div className="flex gap-1.5 mt-1">
          <div className="h-5 w-12 rounded skeleton" />
          <div className="h-5 w-16 rounded skeleton" />
        </div>

        {/* Button */}
        <div className="mt-auto pt-2">
          <div className="h-8 w-20 rounded-lg skeleton" />
        </div>
      </div>
    </article>
  );
}

/**
 * Multiple skeleton cards for loading state
 */
export function ScreeningCardSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading screenings">
      {Array.from({ length: count }).map((_, i) => (
        <ScreeningCardSkeleton key={i} />
      ))}
      <span className="sr-only">Loading screenings...</span>
    </div>
  );
}
