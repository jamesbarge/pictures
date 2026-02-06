import { requireAdmin } from "@/lib/auth";
import { db } from "@/db";
import { bfiImportRuns } from "@/db/schema";
import { desc } from "drizzle-orm";

function nextDailyChangesRun(now: Date): Date {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      10,
      0,
      0,
      0
    )
  );

  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

function nextWeeklyFullRun(now: Date): Date {
  const sunday = 0;
  const daysUntilSunday = (sunday - now.getUTCDay() + 7) % 7;
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysUntilSunday,
      6,
      0,
      0,
      0
    )
  );

  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 7);
  }

  return next;
}

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof Response) {
    return admin;
  }

  try {
    const [lastRun] = await db
      .select()
      .from(bfiImportRuns)
      .orderBy(desc(bfiImportRuns.finishedAt))
      .limit(1);

    const now = new Date();
    const nextChangesAt = nextDailyChangesRun(now);
    const nextFullAt = nextWeeklyFullRun(now);
    const nextScheduledRun =
      nextChangesAt.getTime() < nextFullAt.getTime() ? nextChangesAt : nextFullAt;

    return Response.json({
      lastRun: lastRun
        ? {
            id: lastRun.id,
            runType: lastRun.runType,
            status: lastRun.status,
            triggeredBy: lastRun.triggeredBy,
            startedAt: lastRun.startedAt.toISOString(),
            finishedAt: lastRun.finishedAt.toISOString(),
            durationMs: lastRun.durationMs,
            sourceStatus: lastRun.sourceStatus,
            screenings: {
              pdf: lastRun.pdfScreenings,
              programmeChanges: lastRun.changesScreenings,
              total: lastRun.totalScreenings,
              added: lastRun.added,
              updated: lastRun.updated,
              failed: lastRun.failed,
            },
            errorCodes: lastRun.errorCodes,
            errors: lastRun.errors,
          }
        : null,
      nextScheduledRun: nextScheduledRun.toISOString(),
      schedule: {
        nextFullImportAt: nextFullAt.toISOString(),
        nextProgrammeChangesAt: nextChangesAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[admin/bfi/status] Error:", error);
    return Response.json(
      {
        error: "Failed to load BFI status",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
