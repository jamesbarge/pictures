/**
 * Admin Festival Reverse-Tag API
 * POST /api/admin/festivals/reverse-tag
 *
 * Manually triggers the festival reverse-tagger to tag existing screenings.
 * Optionally accepts a festivalSlug to tag a single festival.
 */

import { withAdminAuth } from "@/lib/auth";
import { db } from "@/db";
import { festivals } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  reverseTagFestivals,
  reverseTagFestival,
} from "@/scrapers/festivals/reverse-tagger";

export const POST = withAdminAuth(async (request, _admin) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { festivalSlug } = body as { festivalSlug?: string };

    if (festivalSlug) {
      // Tag a specific festival
      const [festival] = await db
        .select({
          id: festivals.id,
          slug: festivals.slug,
          name: festivals.name,
          shortName: festivals.shortName,
          startDate: festivals.startDate,
          endDate: festivals.endDate,
          venues: festivals.venues,
        })
        .from(festivals)
        .where(eq(festivals.slug, festivalSlug))
        .limit(1);

      if (!festival) {
        return Response.json(
          { error: `Festival not found: ${festivalSlug}` },
          { status: 404 }
        );
      }

      const result = await reverseTagFestival(festival);
      return Response.json({ success: true, results: [result] });
    }

    // Tag all active festivals within their watch windows
    const results = await reverseTagFestivals();
    return Response.json({ success: true, results });
  } catch (error) {
    console.error("Error running festival reverse-tagger:", error);
    return Response.json(
      { error: "Failed to run reverse-tagger" },
      { status: 500 }
    );
  }
});
