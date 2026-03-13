/**
 * Screening Card Skeleton
 * Loading placeholder for screening cards with shimmer animation
 *
 * IMPORTANT: This skeleton MUST match the exact structure of ScreeningCard
 * to prevent Cumulative Layout Shift (CLS). Any changes to ScreeningCard
 * layout should be reflected here.
 */

import { cn } from "@/lib/cn";

interface ScreeningCardSkeletonProps {
  className?: string;
}

/** Shimmer loading placeholder matching ScreeningCard layout to prevent CLS. */
export function ScreeningCardSkeleton({ className }: ScreeningCardSkeletonProps) {
  return (
    <article
      className={cn(
        // Match exact structure of ScreeningCard
        "group relative flex flex-col rounded-lg overflow-hidden h-full",
        "bg-background-secondary border border-border-subtle",
        className
      )}
      aria-hidden="true"
    >
      {/* Poster area - matches ScreeningCard poster container */}
      <div className="relative aspect-[2/3] w-full overflow-hidden">
        <div className="absolute inset-0 skeleton" />
      </div>

      {/* Content - matches ScreeningCard content structure */}
      <div className="flex flex-col flex-1 p-2">
        {/* Time and Cinema row */}
        <div className="flex items-center gap-2 mb-1">
          <div className="h-3 w-10 rounded skeleton" />
          <div className="h-2 w-1 rounded skeleton" />
          <div className="h-3 w-16 rounded skeleton" />
        </div>

        {/* Title */}
        <div className="h-4 w-full rounded skeleton" />

        {/* Director */}
        <div className="h-3 w-2/3 rounded skeleton mt-0.5" />
      </div>
    </article>
  );
}

/**
 * Multiple skeleton cards for loading state
 * Uses same grid layout as DaySection for consistency
 */
export function ScreeningCardSkeletonList({ count = 12 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 py-6"
      role="status"
      aria-label="Loading screenings"
    >
      {Array.from({ length: count }).map((_, i) => (
        <ScreeningCardSkeleton key={i} />
      ))}
      <span className="sr-only">Loading screenings...</span>
    </div>
  );
}
