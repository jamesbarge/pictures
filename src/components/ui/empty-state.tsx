/**
 * Empty State Component
 * Displays friendly messages when no content is available
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Film, Search, Calendar, MapPin } from "lucide-react";

type EmptyStateVariant = "no-results" | "no-screenings" | "no-films" | "no-cinemas";

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

const defaultContent: Record<EmptyStateVariant, { icon: ReactNode; title: string; description: string }> = {
  "no-results": {
    icon: <Search className="w-10 h-10" />,
    title: "No results found",
    description: "Try adjusting your search or filters to find what you're looking for.",
  },
  "no-screenings": {
    icon: <Calendar className="w-10 h-10" />,
    title: "No screenings available",
    description: "There are no screenings scheduled for your selected dates. Try expanding your date range.",
  },
  "no-films": {
    icon: <Film className="w-10 h-10" />,
    title: "No films found",
    description: "We couldn't find any films matching your criteria. Check back later for new listings.",
  },
  "no-cinemas": {
    icon: <MapPin className="w-10 h-10" />,
    title: "No cinemas selected",
    description: "Select one or more cinemas to see their screenings.",
  },
};

export function EmptyState({
  variant = "no-results",
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  const defaults = defaultContent[variant];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center",
        className
      )}
      role="status"
    >
      {/* Icon */}
      <div className="mb-4 text-text-muted">
        {icon || defaults.icon}
      </div>

      {/* Title */}
      <h3 className="text-lg font-medium text-text-primary mb-2">
        {title || defaults.title}
      </h3>

      {/* Description */}
      <p className="text-sm text-text-secondary max-w-sm mb-6">
        {description || defaults.description}
      </p>

      {/* Action */}
      {action && (
        <div className="mt-2">
          {action}
        </div>
      )}
    </div>
  );
}

/**
 * Search-specific empty state with query display
 */
export function SearchEmptyState({
  query,
  onClear,
}: {
  query: string;
  onClear?: () => void;
}) {
  return (
    <EmptyState
      variant="no-results"
      title={`No results for "${query}"`}
      description="Try a different search term or check your spelling."
      action={
        onClear && (
          <button
            onClick={onClear}
            className="text-sm text-accent-primary hover:text-accent-primary-hover transition-colors"
          >
            Clear search
          </button>
        )
      }
    />
  );
}

/**
 * Date-specific empty state
 */
export function DateEmptyState({
  dateRange,
  onExpandRange,
}: {
  dateRange?: string;
  onExpandRange?: () => void;
}) {
  return (
    <EmptyState
      variant="no-screenings"
      title="No screenings on this date"
      description={dateRange ? `No screenings found for ${dateRange}.` : "No screenings scheduled for your selected dates."}
      action={
        onExpandRange && (
          <button
            onClick={onExpandRange}
            className="text-sm text-accent-primary hover:text-accent-primary-hover transition-colors"
          >
            View next 7 days
          </button>
        )
      }
    />
  );
}
