/**
 * Cinema Config API
 * Get and update cinema baseline configuration
 *
 * GET /api/admin/cinemas/[id]/config - Fetch config
 * PUT /api/admin/cinemas/[id]/config - Update config
 */

import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { cinemaBaselines, cinemas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { BadRequestError, handleApiError } from "@/lib/api-errors";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Zod schema for PUT - update cinema config
const cinemaConfigSchema = z.object({
  tier: z.enum(["top", "standard"]).optional(),
  tolerancePercent: z.number().min(10).max(100).optional(),
  weekdayAvg: z.number().nullable().optional(),
  weekendAvg: z.number().nullable().optional(),
  manualOverride: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  scrapeHorizonDays: z.number().min(7).max(365).optional(),
  maxScrapeDate: z.string().datetime().nullable().optional(),
});

// Default config for cinemas without baselines
const DEFAULT_CONFIG = {
  tier: "standard" as const,
  tolerancePercent: 30,
  weekdayAvg: null,
  weekendAvg: null,
  manualOverride: false,
  notes: null,
  scrapeHorizonDays: 60,
  maxScrapeDate: null,
};

export async function GET(request: Request, { params }: RouteParams) {
  // Verify admin auth
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    return admin;
  }

  const { id: cinemaId } = await params;

  try {
    // Verify cinema exists
    const [cinema] = await db
      .select({ id: cinemas.id })
      .from(cinemas)
      .where(eq(cinemas.id, cinemaId))
      .limit(1);

    if (!cinema) {
      return Response.json({ error: "Cinema not found" }, { status: 404 });
    }

    // Fetch baseline config
    const [baseline] = await db
      .select()
      .from(cinemaBaselines)
      .where(eq(cinemaBaselines.cinemaId, cinemaId))
      .limit(1);

    if (baseline) {
      return Response.json({
        tier: baseline.tier,
        tolerancePercent: baseline.tolerancePercent,
        weekdayAvg: baseline.weekdayAvg,
        weekendAvg: baseline.weekendAvg,
        manualOverride: baseline.manualOverride,
        notes: baseline.notes,
        scrapeHorizonDays: baseline.scrapeHorizonDays,
        maxScrapeDate: baseline.maxScrapeDate,
      });
    }

    // Return defaults if no baseline exists
    return Response.json(DEFAULT_CONFIG);
  } catch (error) {
    console.error("Error fetching cinema config:", error);
    return Response.json(
      { error: "Failed to fetch config" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    // Verify admin auth
    const admin = await requireAdmin();
    if (admin instanceof Response) {
      return admin;
    }

    const { id: cinemaId } = await params;

    // Validate request body with Zod
    const parseResult = cinemaConfigSchema.safeParse(await request.json());
    if (!parseResult.success) {
      throw new BadRequestError("Invalid request body", parseResult.error.flatten());
    }
    const body = parseResult.data;
    const maxScrapeDate = body.maxScrapeDate
      ? new Date(body.maxScrapeDate)
      : null;

    // Verify cinema exists
    const [cinema] = await db
      .select({ id: cinemas.id })
      .from(cinemas)
      .where(eq(cinemas.id, cinemaId))
      .limit(1);

    if (!cinema) {
      return Response.json({ error: "Cinema not found" }, { status: 404 });
    }

    // Check if baseline exists
    const [existing] = await db
      .select({ cinemaId: cinemaBaselines.cinemaId })
      .from(cinemaBaselines)
      .where(eq(cinemaBaselines.cinemaId, cinemaId))
      .limit(1);

    const configData = {
      tier: body.tier ?? "standard",
      tolerancePercent: body.tolerancePercent ?? 30,
      weekdayAvg: body.weekdayAvg ?? null,
      weekendAvg: body.weekendAvg ?? null,
      manualOverride: body.manualOverride ?? false,
      notes: body.notes ?? null,
      scrapeHorizonDays: body.scrapeHorizonDays ?? 60,
      maxScrapeDate,
      updatedAt: new Date(),
    };

    if (existing) {
      // Update existing baseline
      await db
        .update(cinemaBaselines)
        .set(configData)
        .where(eq(cinemaBaselines.cinemaId, cinemaId));
    } else {
      // Insert new baseline
      await db.insert(cinemaBaselines).values({
        cinemaId,
        ...configData,
      });
    }

    return Response.json({
      success: true,
      message: "Config saved",
    });
  } catch (error) {
    return handleApiError(error, "PUT /api/admin/cinemas/[id]/config");
  }
}
