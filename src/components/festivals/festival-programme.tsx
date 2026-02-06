import { db } from "@/db";
import { festivals, festivalScreenings, screenings, films, cinemas } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { format } from "date-fns";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin } from "lucide-react";

// Blur placeholder for poster images to prevent CLS
const POSTER_BLUR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAPCAYAAADd/14OAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAKklEQVQoz2Nk+M/AQAxgZGBg+M9AB2BkYGBgZGRgYGCgF2D4T7wexAAGABPmAhHXnXDuAAAAAElFTkSuQmCC";

interface FestivalProgrammeProps {
  festivalId: string;
}

export async function FestivalProgramme({ festivalId }: FestivalProgrammeProps) {
  // Fetch all screenings for this festival
  const results = await db
    .select({
      screening: screenings,
      film: films,
      cinema: cinemas,
      festivalData: festivalScreenings,
    })
    .from(festivalScreenings)
    .innerJoin(screenings, eq(festivalScreenings.screeningId, screenings.id))
    .innerJoin(films, eq(screenings.filmId, films.id))
    .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
    .where(eq(festivalScreenings.festivalId, festivalId))
    .orderBy(asc(screenings.datetime));

  if (results.length === 0) {
    return (
      <div className="bg-background-secondary border border-border-subtle rounded-lg p-8 text-center mt-8">
        <p className="text-text-secondary">
          No screenings announced yet. Check back soon!
        </p>
      </div>
    );
  }

  // Group by date
  const byDate = new Map<string, typeof results>();
  for (const item of results) {
    const dateKey = format(item.screening.datetime, "yyyy-MM-dd");
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, []);
    }
    byDate.get(dateKey)!.push(item);
  }

  return (
    <div className="space-y-12 mt-8">
      {Array.from(byDate.entries()).map(([dateKey, items]) => {
        const date = new Date(dateKey);
        return (
          <section key={dateKey}>
            <div className="flex items-center gap-3 mb-6 sticky top-16 bg-background-primary/95 backdrop-blur py-3 z-10 border-b border-border-subtle">
              <div className="w-12 text-center">
                <div className="text-xs uppercase text-text-tertiary font-bold">
                  {format(date, "MMM")}
                </div>
                <div className="text-xl font-bold text-text-primary">
                  {format(date, "d")}
                </div>
              </div>
              <h3 className="text-xl font-display text-text-secondary">
                {format(date, "EEEE")}
              </h3>
              <Badge variant="secondary" className="ml-auto">
                {items.length} Screenings
              </Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(({ screening, film, cinema, festivalData }) => (
                <div
                  key={screening.id}
                  className="group relative bg-background-secondary border border-border-subtle rounded-lg overflow-hidden hover:border-border-emphasis transition-colors"
                >
                  <div className="aspect-[2/3] relative bg-background-tertiary">
                    {film.posterUrl && !film.posterUrl.includes('poster-placeholder') ? (
                      <Image
                        src={film.posterUrl}
                        alt={film.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        placeholder="blur"
                        blurDataURL={POSTER_BLUR}
                      />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/api/poster-placeholder?title=${encodeURIComponent(film.title)}${film.year ? `&year=${film.year}` : ""}`}
                        alt={film.title}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    
                    {/* Premiere Badge */}
                    {festivalData.isPremiere && (
                      <div className="absolute top-2 right-2">
                        <Badge variant="gold" className="shadow-lg">
                          Premiere
                        </Badge>
                      </div>
                    )}
                    
                    {/* Section Badge */}
                    {festivalData.festivalSection && (
                      <div className="absolute top-2 left-2">
                         <Badge variant="secondary" className="shadow-lg backdrop-blur-md bg-black/50 text-white border-transparent">
                          {festivalData.festivalSection}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <h4 className="font-bold text-text-primary line-clamp-1 mb-1">
                      {film.title}
                    </h4>
                    <div className="flex items-center gap-2 text-sm text-text-secondary mb-3">
                      <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                      {format(screening.datetime, "HH:mm")}
                      <span className="text-text-tertiary">•</span>
                      <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="truncate">{cinema.shortName}</span>
                    </div>
                    
                    <a
                      href={screening.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-center py-2 px-4 bg-background-secondary hover:bg-background-hover border border-border-default rounded text-sm font-medium transition-colors"
                    >
                      Book Ticket
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
