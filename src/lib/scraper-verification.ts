import { eq, gte, and } from "drizzle-orm";

import { db } from "@/db";
import { screenings } from "@/db/schema";
import { scraperRuns } from "@/db/schema/admin";
import { films } from "@/db/schema/films";
import { generateText, stripCodeFences } from "@/lib/deepseek";

/** A single issue surfaced by the post-scrape verification check. */
export interface VerificationIssue {
  type: string;
  severity: "error" | "warn" | "info";
  detail: string;
}

/** Aggregate result of verifying a cinema's scraper output. */
export interface VerificationResult {
  cinemaId: string;
  verdict: "pass" | "warn" | "fail";
  issues: VerificationIssue[];
  checkedAt: string;
}

/**
 * Run AI-powered verification on a cinema's recent scraper output.
 *
 * Compares recent screenings, films, and scraper-run metadata against
 * expected patterns and returns a pass/warn/fail verdict with issues.
 *
 * Uses DeepSeek-V4-Flash (cheap, JSON-mode) for the analysis. Migrated
 * from Gemini as part of the local-scraping rebuild.
 */
export async function verifyScraperOutput(params: {
  cinemaId: string;
  cinemaName: string;
  scraperRunId?: string;
}): Promise<VerificationResult> {
  const now = new Date();
  const recentScreenings = await db
    .select({
      title: films.title,
      datetime: screenings.datetime,
      bookingUrl: screenings.bookingUrl,
    })
    .from(screenings)
    .innerJoin(films, eq(screenings.filmId, films.id))
    .where(and(
      eq(screenings.cinemaId, params.cinemaId),
      gte(screenings.datetime, now),
    ))
    .orderBy(screenings.datetime)
    .limit(50);

  if (recentScreenings.length === 0) {
    return {
      cinemaId: params.cinemaId,
      verdict: "warn",
      issues: [{ type: "no_screenings", severity: "warn", detail: "No future screenings found after scrape" }],
      checkedAt: now.toISOString(),
    };
  }

  const screeningLines = recentScreenings.map((s: { title: string; datetime: Date; bookingUrl: string }) => {
    let domain = "none";
    try { domain = new URL(s.bookingUrl).hostname; } catch { /* invalid URL */ }
    return `${s.title} | ${s.datetime.toISOString()} | ${domain}`;
  });

  const prompt = `You are a cinema data quality checker for "${params.cinemaName}".

Analyze these scraped screenings for anomalies. Check for:
- Titles that look like HTML, navigation text, or non-film content
- Dates that are in the past or suspiciously far in the future (>6 months)
- Booking URL domains that don't match the cinema
- Duplicate titles at the same time
- Encoding issues (mojibake, HTML entities)
- Titles that are clearly TV shows, exhibitions, or non-film events mislabeled

Screenings (title | datetime | booking domain):
${screeningLines.join("\n")}

Return JSON with verdict (pass|warn|fail) and an issues array of {type, severity, detail}. If everything looks normal, verdict=pass with empty issues.`;

  let retries = 0;
  const maxRetries = 2;
  const TIMEOUT_MS = 15_000;

  while (retries <= maxRetries) {
    try {
      const raw = await Promise.race([
        generateText(prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Verification timed out after 15s")), TIMEOUT_MS)
        ),
      ]);

      const parsed = JSON.parse(stripCodeFences(raw));

      const result: VerificationResult = {
        cinemaId: params.cinemaId,
        verdict: parsed.verdict,
        issues: parsed.issues ?? [],
        checkedAt: now.toISOString(),
      };

      // Store verification in the specific scraper run
      if (params.scraperRunId) {
        await storeVerification(params.scraperRunId, result).catch(() => {});
      }

      return result;
    } catch (err) {
      retries++;
      if (retries > maxRetries) {
        return {
          cinemaId: params.cinemaId,
          verdict: "warn",
          issues: [{
            type: "verification_error",
            severity: "warn",
            detail: `Verification failed after ${maxRetries + 1} attempts: ${err instanceof Error ? err.message : String(err)}`,
          }],
          checkedAt: now.toISOString(),
        };
      }
      await new Promise((r) => setTimeout(r, 1000 * retries * (0.5 + Math.random())));
    }
  }

  return { cinemaId: params.cinemaId, verdict: "warn", issues: [], checkedAt: now.toISOString() };
}

async function storeVerification(scraperRunId: string, result: VerificationResult): Promise<void> {
  const [run] = await db
    .select({ id: scraperRuns.id, metadata: scraperRuns.metadata })
    .from(scraperRuns)
    .where(eq(scraperRuns.id, scraperRunId))
    .limit(1);

  if (!run) return;

  const existingMeta = (run.metadata ?? {}) as Record<string, unknown>;
  await db
    .update(scraperRuns)
    .set({
      metadata: { ...existingMeta, verification: result } as typeof scraperRuns.$inferInsert["metadata"],
    })
    .where(eq(scraperRuns.id, run.id));
}
