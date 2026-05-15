/**
 * End-condition #1: London independents covered.
 *
 * Reads the canonical target list from tasks/goal.md (the `coverage targets`
 * bullet list under "End Conditions → 1. London independents covered"), then
 * verifies each slug exists in `cinemas` with `is_active = true` AND has at
 * least one successful scraper_run with screening_count > 0 in the last 7 days.
 *
 * Output: JSON to stdout. Exit code 0 if pass, 1 if fail.
 * Usage:  npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-coverage.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, desc, eq, gt, gte } from "drizzle-orm";
import { db } from "@/db";
import { cinemas } from "@/db/schema/cinemas";
import { scraperRuns } from "@/db/schema/admin";

interface CinemaStatus {
  slug: string;
  exists: boolean;
  isActive: boolean;
  hasRecentSuccess: boolean;
  lastSuccessAt: string | null;
}

function parseTargetsFromGoalFile(): string[] {
  const path = resolve(process.cwd(), "tasks/goal.md");
  const text = readFileSync(path, "utf-8");
  // Section starts at "### 1. London independents covered" and we read the
  // bullets under "**Coverage targets**" until the next blank line / sub-tasks.
  const sectionMatch = text.match(
    /### 1\. London independents covered[\s\S]*?\*\*Coverage targets\*\*[^\n]*\n([\s\S]*?)\n\s*- \*\*Sub-tasks:\*\*/,
  );
  if (!sectionMatch) {
    throw new Error("Could not locate coverage-targets block in tasks/goal.md");
  }
  const block = sectionMatch[1];
  const targets: string[] = [];
  for (const line of block.split("\n")) {
    // Match e.g. "  - `cinema-museum`" optionally followed by a parenthetical note
    const m = line.match(/^\s*-\s+`([a-z0-9-]+)`/);
    if (m) targets.push(m[1]);
  }
  return targets;
}

async function checkOne(slug: string): Promise<CinemaStatus> {
  const cinemaRow = await db
    .select({ id: cinemas.id, isActive: cinemas.isActive })
    .from(cinemas)
    .where(eq(cinemas.id, slug))
    .limit(1);

  if (cinemaRow.length === 0) {
    return { slug, exists: false, isActive: false, hasRecentSuccess: false, lastSuccessAt: null };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = await db
    .select({ startedAt: scraperRuns.startedAt })
    .from(scraperRuns)
    .where(
      and(
        eq(scraperRuns.cinemaId, slug),
        eq(scraperRuns.status, "success"),
        gt(scraperRuns.screeningCount, 0),
        gte(scraperRuns.startedAt, sevenDaysAgo),
      ),
    )
    .orderBy(desc(scraperRuns.startedAt))
    .limit(1);

  return {
    slug,
    exists: true,
    isActive: cinemaRow[0].isActive,
    hasRecentSuccess: recent.length > 0,
    lastSuccessAt: recent[0]?.startedAt?.toISOString() ?? null,
  };
}

async function main() {
  const targets = parseTargetsFromGoalFile();
  if (targets.length === 0) {
    console.log(JSON.stringify({ condition: "coverage", pass: false, error: "no targets parsed from tasks/goal.md" }, null, 2));
    process.exit(1);
  }

  const statuses = await Promise.all(targets.map(checkOne));
  const missing = statuses.filter((s) => !s.exists);
  const inactive = statuses.filter((s) => s.exists && !s.isActive);
  const noRecent = statuses.filter((s) => s.exists && s.isActive && !s.hasRecentSuccess);
  const pass = missing.length === 0 && inactive.length === 0 && noRecent.length === 0;

  const payload = {
    condition: "coverage",
    pass,
    targetsTotal: targets.length,
    missing: missing.map((s) => s.slug),
    inactive: inactive.map((s) => s.slug),
    noRecentSuccess: noRecent.map((s) => s.slug),
    details: statuses,
  };

  console.log(JSON.stringify(payload, null, 2));
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ condition: "coverage", pass: false, error: String(err) }));
  process.exit(1);
});
