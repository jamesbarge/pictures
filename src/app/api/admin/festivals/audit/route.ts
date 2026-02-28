/**
 * Admin Festival Audit API
 * GET /api/admin/festivals/audit
 *
 * Shows untagged screenings at festival venues during festival windows.
 * Helps identify screenings that might need manual tagging.
 */

import { withAdminAuth } from "@/lib/auth";
import { db } from "@/db";
import {
  festivals,
  festivalScreenings,
  screenings,
  films,
} from "@/db/schema";
import { eq, and, gte, lte, inArray, notInArray } from "drizzle-orm";

export const GET = withAdminAuth(async (request, _admin) => {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  // Load target festivals
  const targetFestivals = slug
    ? await db
        .select()
        .from(festivals)
        .where(eq(festivals.slug, slug))
        .limit(1)
    : await db
        .select()
        .from(festivals)
        .where(eq(festivals.isActive, true));

  const auditResults = [];

  for (const festival of targetFestivals) {
    const venueList = festival.venues ?? [];
    if (venueList.length === 0) continue;

    const festivalStart = new Date(festival.startDate);
    const festivalEnd = new Date(festival.endDate);
    festivalEnd.setHours(23, 59, 59, 999);

    // Get IDs of already-tagged screenings for this festival
    const taggedRows = await db
      .select({ screeningId: festivalScreenings.screeningId })
      .from(festivalScreenings)
      .where(eq(festivalScreenings.festivalId, festival.id));

    const taggedIds = taggedRows.map((r) => r.screeningId);

    // Get untagged screenings at festival venues during window
    const query = db
      .select({
        screeningId: screenings.id,
        filmTitle: films.title,
        cinemaId: screenings.cinemaId,
        datetime: screenings.datetime,
        bookingUrl: screenings.bookingUrl,
      })
      .from(screenings)
      .innerJoin(films, eq(screenings.filmId, films.id))
      .where(
        and(
          inArray(screenings.cinemaId, venueList),
          gte(screenings.datetime, festivalStart),
          lte(screenings.datetime, festivalEnd),
          ...(taggedIds.length > 0
            ? [notInArray(screenings.id, taggedIds)]
            : [])
        )
      )
      .orderBy(screenings.datetime)
      .limit(100);

    const untagged = await query;

    if (untagged.length > 0 || taggedIds.length > 0) {
      auditResults.push({
        festival: {
          slug: festival.slug,
          name: festival.name,
          startDate: festival.startDate,
          endDate: festival.endDate,
          venues: venueList,
        },
        taggedCount: taggedIds.length,
        untaggedCount: untagged.length,
        untaggedScreenings: untagged.map((s) => ({
          id: s.screeningId,
          filmTitle: s.filmTitle,
          cinemaId: s.cinemaId,
          datetime: s.datetime,
          bookingUrl: s.bookingUrl,
        })),
      });
    }
  }

  return Response.json({ audit: auditResults });
});
