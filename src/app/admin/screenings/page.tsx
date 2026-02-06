/**
 * Admin Screenings Page
 * Browse and manage all screenings with full CRUD capabilities
 */

import { db } from "@/db";
import { screenings, films, cinemas } from "@/db/schema";
import { eq, gte, lte, and, asc } from "drizzle-orm";
import { startOfDay, endOfDay, addDays, format, parseISO } from "date-fns";
import { Card } from "@/components/ui/card";
import { Film, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { ScreeningsHeader } from "./components/screenings-header";
import { ScreeningRow } from "./components/screening-row";

export const dynamic = "force-dynamic";

interface SearchParams {
  cinema?: string;
  date?: string;
  page?: string;
  search?: string;
}

const PAGE_SIZE = 50;

export default async function AdminScreeningsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const now = new Date();

  // Parse filters
  const selectedCinema = params.cinema || null;
  const selectedDate = params.date ? parseISO(params.date) : null;
  const page = parseInt(params.page || "1", 10);
  const offset = (page - 1) * PAGE_SIZE;

  // Build date range
  const dateStart = selectedDate ? startOfDay(selectedDate) : startOfDay(now);
  const dateEnd = selectedDate ? endOfDay(selectedDate) : endOfDay(addDays(now, 7));

  // Build where conditions
  const conditions = [
    gte(screenings.datetime, dateStart),
    lte(screenings.datetime, dateEnd),
  ];

  if (selectedCinema) {
    conditions.push(eq(screenings.cinemaId, selectedCinema));
  }

  // Fetch screenings with film and cinema info
  const results = await db
    .select({
      id: screenings.id,
      datetime: screenings.datetime,
      format: screenings.format,
      screen: screenings.screen,
      eventType: screenings.eventType,
      eventDescription: screenings.eventDescription,
      bookingUrl: screenings.bookingUrl,
      film: {
        id: films.id,
        title: films.title,
        year: films.year,
        posterUrl: films.posterUrl,
      },
      cinema: {
        id: cinemas.id,
        name: cinemas.name,
        shortName: cinemas.shortName,
      },
    })
    .from(screenings)
    .innerJoin(films, eq(screenings.filmId, films.id))
    .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
    .where(and(...conditions))
    .orderBy(asc(screenings.datetime))
    .limit(PAGE_SIZE)
    .offset(offset);

  // Fetch cinema list for filter and modal
  const allCinemas = await db
    .select({ id: cinemas.id, name: cinemas.name, shortName: cinemas.shortName })
    .from(cinemas)
    .where(eq(cinemas.isActive, true))
    .orderBy(cinemas.name);

  // Generate date options (today + next 7 days)
  const dateOptions = Array.from({ length: 8 }, (_, i) => {
    const date = addDays(now, i);
    return {
      value: format(date, "yyyy-MM-dd"),
      label: format(date, "EEE, MMM d"),
    };
  });

  // Build pagination URLs
  const buildUrl = (newPage: number) => {
    const searchParamsObj = new URLSearchParams();
    if (selectedCinema) searchParamsObj.set("cinema", selectedCinema);
    if (selectedDate) searchParamsObj.set("date", format(selectedDate, "yyyy-MM-dd"));
    searchParamsObj.set("page", String(newPage));
    return `/admin/screenings?${searchParamsObj.toString()}`;
  };

  // Serialize screening data for client components
  const serializedResults = results.map(r => ({
    ...r,
    datetime: r.datetime.toISOString(),
  }));

  return (
    <div className="space-y-6">
      {/* Header with Add button */}
      <ScreeningsHeader cinemas={allCinemas} />

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Cinema Filter */}
          <div className="flex-1 min-w-[200px]">
            <p className="text-xs text-text-tertiary block mb-1">Cinema</p>
            <div className="flex flex-wrap gap-2">
              <FilterLink
                href={`/admin/screenings${selectedDate ? `?date=${format(selectedDate, "yyyy-MM-dd")}` : ""}`}
                active={!selectedCinema}
              >
                All
              </FilterLink>
              {allCinemas.slice(0, 8).map((cinema) => (
                <FilterLink
                  key={cinema.id}
                  href={`/admin/screenings?cinema=${cinema.id}${selectedDate ? `&date=${format(selectedDate, "yyyy-MM-dd")}` : ""}`}
                  active={selectedCinema === cinema.id}
                >
                  {cinema.shortName || cinema.name}
                </FilterLink>
              ))}
            </div>
          </div>

          {/* Date Filter */}
          <div>
            <p className="text-xs text-text-tertiary block mb-1">Date</p>
            <div className="flex flex-wrap gap-2">
              <FilterLink
                href={`/admin/screenings${selectedCinema ? `?cinema=${selectedCinema}` : ""}`}
                active={!selectedDate}
              >
                Next 7 days
              </FilterLink>
              {dateOptions.slice(0, 5).map((opt) => (
                <FilterLink
                  key={opt.value}
                  href={`/admin/screenings?date=${opt.value}${selectedCinema ? `&cinema=${selectedCinema}` : ""}`}
                  active={!!selectedDate && format(selectedDate, "yyyy-MM-dd") === opt.value}
                >
                  {opt.label}
                </FilterLink>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Results */}
      <div className="space-y-2">
        <p className="text-sm text-text-tertiary">
          Showing {results.length} screenings
          {selectedCinema && ` at ${allCinemas.find(c => c.id === selectedCinema)?.name}`}
        </p>

        <div className="space-y-2">
          {serializedResults.map((screening) => (
            <ScreeningRow
              key={screening.id}
              screening={screening}
              cinemas={allCinemas}
            />
          ))}
        </div>

        {results.length === 0 && (
          <Card className="text-center py-12">
            <Film className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
            <p className="text-text-secondary">No screenings found</p>
            <p className="text-sm text-text-tertiary mt-1">
              Try adjusting your filters
            </p>
          </Card>
        )}
      </div>

      {/* Pagination */}
      {results.length === PAGE_SIZE && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={buildUrl(page - 1)}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-background-secondary rounded hover:bg-background-hover"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Link>
          )}
          <Link
            href={buildUrl(page + 1)}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-background-secondary rounded hover:bg-background-hover"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

// Filter Link Component
function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "px-3 py-1.5 text-xs rounded-full transition-colors",
        active
          ? "bg-accent-primary text-white"
          : "bg-background-tertiary text-text-secondary hover:bg-background-hover"
      )}
    >
      {children}
    </Link>
  );
}
