/**
 * Admin Cinemas Page
 * Configure cinema tiers and baselines for anomaly detection
 */

import { db } from "@/db";
import { cinemas, screenings } from "@/db/schema";
import { eq, gte, count, and } from "drizzle-orm";
import { CinemaCardWithConfig } from "./components/cinema-card-with-config";

export const dynamic = "force-dynamic";

// Independent cinemas are top tier
const INDEPENDENT_CHAINS = ["independent", null];

export default async function AdminCinemasPage() {
  const now = new Date();

  // Fetch all active cinemas with screening counts
  const cinemasWithStats = await db
    .select({
      id: cinemas.id,
      name: cinemas.name,
      shortName: cinemas.shortName,
      chain: cinemas.chain,
      website: cinemas.website,
      lastScrapedAt: cinemas.lastScrapedAt,
      dataSourceType: cinemas.dataSourceType,
      screeningCount: count(screenings.id),
    })
    .from(cinemas)
    .leftJoin(
      screenings,
      and(
        eq(screenings.cinemaId, cinemas.id),
        gte(screenings.datetime, now)
      )
    )
    .where(eq(cinemas.isActive, true))
    .groupBy(cinemas.id)
    .orderBy(cinemas.name);

  // Group by tier
  const topTier = cinemasWithStats.filter(c => INDEPENDENT_CHAINS.includes(c.chain));
  const standardTier = cinemasWithStats.filter(c => !INDEPENDENT_CHAINS.includes(c.chain));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-text-primary">Cinemas</h1>
          <p className="text-text-secondary mt-1">
            Configure cinema tiers and baseline expectations
          </p>
        </div>
      </div>

      {/* Top Tier Cinemas */}
      <div>
        <h2 className="text-lg font-display text-text-primary mb-4 flex items-center gap-2">
          <span className="px-2 py-0.5 bg-accent-primary/10 text-accent-primary text-xs rounded">
            Top Tier
          </span>
          Independent Cinemas ({topTier.length})
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {topTier.map(cinema => (
            <CinemaCardWithConfig
              key={cinema.id}
              cinema={{
                ...cinema,
                lastScrapedAt: cinema.lastScrapedAt?.toISOString() ?? null,
              }}
              tier="top"
            />
          ))}
        </div>
      </div>

      {/* Standard Tier Cinemas */}
      <div>
        <h2 className="text-lg font-display text-text-primary mb-4 flex items-center gap-2">
          <span className="px-2 py-0.5 bg-background-tertiary text-text-secondary text-xs rounded">
            Standard
          </span>
          Chain Cinemas ({standardTier.length})
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {standardTier.map(cinema => (
            <CinemaCardWithConfig
              key={cinema.id}
              cinema={{
                ...cinema,
                lastScrapedAt: cinema.lastScrapedAt?.toISOString() ?? null,
              }}
              tier="standard"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
