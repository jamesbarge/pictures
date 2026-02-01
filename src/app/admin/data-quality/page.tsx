/**
 * Admin Data Quality Dashboard
 * Shows film data completeness and allows triggering fallback enrichment
 */

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { auditFilmData } from "@/scripts/audit-film-data";
import {
  Film,
  ImageIcon,
  FileText,
  Star,
  Database,
  Users,
  Tag,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { DataQualityActions } from "./components/data-quality-actions";
import { GapTable } from "./components/gap-table";

export const dynamic = "force-dynamic";

function completeness(missing: number, total: number): number {
  if (total === 0) return 100;
  return ((total - missing) / total) * 100;
}

function completenessColor(pct: number): string {
  if (pct >= 90) return "text-green-600";
  if (pct >= 70) return "text-yellow-600";
  return "text-red-600";
}

function completenessBarColor(pct: number): string {
  if (pct >= 90) return "bg-green-500";
  if (pct >= 70) return "bg-yellow-500";
  return "bg-red-500";
}

interface MetricCardProps {
  label: string;
  icon: React.ReactNode;
  missing: number;
  missingUpcoming?: number;
  total: number;
}

function MetricCard({ label, icon, missing, missingUpcoming, total }: MetricCardProps) {
  const pctComplete = completeness(missing, total);
  const have = total - missing;

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-text-tertiary">{icon}</span>
          <span className="text-sm font-medium text-text-primary">{label}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-2xl font-bold", completenessColor(pctComplete))}>
            {pctComplete.toFixed(1)}%
          </span>
          <span className="text-xs text-text-tertiary">
            {have}/{total}
          </span>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-background-hover rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", completenessBarColor(pctComplete))}
            style={{ width: `${pctComplete}%` }}
          />
        </div>
        {missingUpcoming !== undefined && missingUpcoming > 0 && (
          <p className="text-xs text-text-tertiary mt-1.5">
            {missingUpcoming} upcoming films missing
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function DataQualityPage() {
  const result = await auditFilmData(false, 200);
  const { summary, gaps } = result;

  const upcomingGaps = gaps.filter((g) => g.hasUpcomingScreenings);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-text-primary">Data Quality</h1>
          <p className="text-text-secondary mt-1">
            Film metadata completeness and fallback enrichment
          </p>
        </div>
        <DataQualityActions />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="col-span-2 lg:col-span-4 bg-accent-primary/5 border-accent-primary/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-text-tertiary">Total films: </span>
                <span className="font-bold text-text-primary">{summary.totalFilms}</span>
              </div>
              <div>
                <span className="text-text-tertiary">With upcoming screenings: </span>
                <span className="font-bold text-text-primary">{summary.filmsWithUpcoming}</span>
              </div>
              <div>
                <span className="text-text-tertiary">Films with gaps (upcoming): </span>
                <span className="font-bold text-red-600">{upcomingGaps.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <MetricCard
          label="Poster"
          icon={<ImageIcon className="w-4 h-4" />}
          missing={summary.missingPoster}
          missingUpcoming={summary.missingPosterUpcoming}
          total={summary.totalFilms}
        />
        <MetricCard
          label="Synopsis"
          icon={<FileText className="w-4 h-4" />}
          missing={summary.missingSynopsis}
          missingUpcoming={summary.missingSynopsisUpcoming}
          total={summary.totalFilms}
        />
        <MetricCard
          label="Letterboxd"
          icon={<Star className="w-4 h-4" />}
          missing={summary.missingLetterboxdRating}
          missingUpcoming={summary.missingLetterboxdRatingUpcoming}
          total={summary.totalFilms}
        />
        <MetricCard
          label="TMDB Match"
          icon={<Database className="w-4 h-4" />}
          missing={summary.missingTmdbId}
          missingUpcoming={summary.missingTmdbIdUpcoming}
          total={summary.totalFilms}
        />
        <MetricCard
          label="Directors"
          icon={<Users className="w-4 h-4" />}
          missing={summary.missingDirectors}
          total={summary.totalFilms}
        />
        <MetricCard
          label="Genres"
          icon={<Tag className="w-4 h-4" />}
          missing={summary.missingGenres}
          total={summary.totalFilms}
        />
        <MetricCard
          label="Year"
          icon={<Film className="w-4 h-4" />}
          missing={summary.missingYear}
          total={summary.totalFilms}
        />
        <MetricCard
          label="Runtime"
          icon={<Clock className="w-4 h-4" />}
          missing={summary.missingRuntime}
          total={summary.totalFilms}
        />
      </div>

      {/* Gap table */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-text-primary">
            Films with Missing Data
          </h2>
          <p className="text-sm text-text-secondary">
            Sorted by upcoming screenings, then by number of missing fields
          </p>
        </CardHeader>
        <CardContent>
          <GapTable gaps={gaps} />
        </CardContent>
      </Card>
    </div>
  );
}
