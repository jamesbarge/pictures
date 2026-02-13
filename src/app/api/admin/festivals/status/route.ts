/**
 * Admin Festival Status API
 * GET /api/admin/festivals/status
 *
 * Returns all festivals with tagged screening counts and coverage info.
 */

import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { festivals, festivalScreenings, screenings } from "@/db/schema";
import { eq, and, gte, lte, inArray, count } from "drizzle-orm";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  const activeFestivals = await db
    .select()
    .from(festivals)
    .where(eq(festivals.isActive, true))
    .orderBy(festivals.startDate);

  const results = await Promise.all(
    activeFestivals.map(async (festival) => {
      // Count tagged screenings
      const [taggedResult] = await db
        .select({ count: count() })
        .from(festivalScreenings)
        .where(eq(festivalScreenings.festivalId, festival.id));

      // Count total screenings at festival venues during window
      const venueList = festival.venues ?? [];
      let totalAtVenues = 0;
      if (venueList.length > 0) {
        const festivalStart = new Date(festival.startDate);
        const festivalEnd = new Date(festival.endDate);
        festivalEnd.setHours(23, 59, 59, 999);

        const [totalResult] = await db
          .select({ count: count() })
          .from(screenings)
          .where(
            and(
              inArray(screenings.cinemaId, venueList),
              gte(screenings.datetime, festivalStart),
              lte(screenings.datetime, festivalEnd)
            )
          );
        totalAtVenues = totalResult.count;
      }

      const now = new Date();
      const start = new Date(festival.startDate);
      const end = new Date(festival.endDate);

      let status: "upcoming" | "active" | "past";
      if (now < start) status = "upcoming";
      else if (now > end) status = "past";
      else status = "active";

      return {
        id: festival.id,
        slug: festival.slug,
        name: festival.name,
        shortName: festival.shortName,
        startDate: festival.startDate,
        endDate: festival.endDate,
        venues: festival.venues,
        status,
        taggedScreenings: taggedResult.count,
        totalScreeningsAtVenues: totalAtVenues,
        coveragePercent:
          totalAtVenues > 0
            ? Math.round((taggedResult.count / totalAtVenues) * 100)
            : 0,
        programmAnnouncedDate: festival.programmAnnouncedDate,
        scrapedAt: festival.scrapedAt,
      };
    })
  );

  return Response.json({ festivals: results });
}
