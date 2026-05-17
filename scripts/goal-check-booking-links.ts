/**
 * End-condition #3: Zero broken booking links.
 *
 * Samples up to N future screenings per active cinema and checks each
 * `booking_url` over HTTP (HEAD, GET fallback). Reports per-cinema stats.
 *
 * Passes when:
 *   - Hard 404/410 rate is 0% across the sample
 *   - Total non-2xx rate is < 5%
 *
 * Cinemas in `bookingLinkExclusions` are skipped (e.g. SPAs that always
 * 200 on a static shell — those should be verified by end-condition #6
 * via PostHog booking_click data instead).
 *
 * Output: JSON to stdout. Exit code 0 if pass, 1 if fail.
 * Usage:  npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-booking-links.ts
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { cinemas } from "@/db/schema/cinemas";
import { screenings } from "@/db/schema/screenings";

const SAMPLE_PER_CINEMA = 25;
const HARD_FAIL_STATUSES = new Set([404, 410]);
const CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 8_000;
const TOTAL_NON_2XX_BUDGET = 0.05; // 5%

// Cinemas whose booking SPAs always return 200 — exclude from HTTP check.
// Trust PostHog booking_click data (end-condition #6) instead.
const bookingLinkExclusions = new Set<string>([
  // Add slugs here if a cinema's booking page is provably SPA-200-always.
]);

interface Probe {
  url: string;
  status: number | "timeout" | "error";
  cinemaId: string;
}

async function fetchWithTimeout(
  url: string,
  method: "HEAD" | "GET",
): Promise<{ status: number } | { timeout: true } | { error: string }> {
  // Fresh AbortController per request — sharing one across HEAD and a GET
  // retry causes the retry to inherit an already-expired (or already-fired)
  // signal whenever HEAD ran close to the deadline.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "pictures.london goal-check/1.0" },
    });
    return { status: resp.status };
  } catch (err) {
    const msg = String(err);
    return msg.includes("aborted") ? { timeout: true } : { error: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function probeOne(url: string, cinemaId: string): Promise<Probe> {
  const first = await fetchWithTimeout(url, "HEAD");
  // Some sites reject HEAD; retry with GET on its own fresh timeout budget.
  if ("status" in first && (first.status === 405 || first.status === 501)) {
    const second = await fetchWithTimeout(url, "GET");
    if ("status" in second) return { url, status: second.status, cinemaId };
    if ("timeout" in second) return { url, status: "timeout", cinemaId };
    return { url, status: "error", cinemaId };
  }
  if ("status" in first) return { url, status: first.status, cinemaId };
  if ("timeout" in first) return { url, status: "timeout", cinemaId };
  return { url, status: "error", cinemaId };
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  const runners: Promise<void>[] = [];
  for (let c = 0; c < concurrency; c++) {
    runners.push(
      (async () => {
        while (i < items.length) {
          const myIndex = i++;
          results[myIndex] = await worker(items[myIndex]);
        }
      })(),
    );
  }
  await Promise.all(runners);
  return results;
}

async function main() {
  const activeCinemas = await db
    .select({ id: cinemas.id, name: cinemas.name })
    .from(cinemas)
    .where(eq(cinemas.isActive, true));

  const now = new Date();
  const probes: Probe[] = [];
  const perCinemaCounts = new Map<string, { name: string; checked: number; nonOk: number; hardFail: number }>();

  for (const c of activeCinemas) {
    if (bookingLinkExclusions.has(c.id)) {
      perCinemaCounts.set(c.id, { name: c.name, checked: 0, nonOk: 0, hardFail: 0 });
      continue;
    }

    // Pull a sample of distinct future booking URLs for this cinema.
    const rows = await db
      .select({ url: screenings.bookingUrl })
      .from(screenings)
      .where(
        and(
          eq(screenings.cinemaId, c.id),
          gte(screenings.datetime, now),
        ),
      )
      .groupBy(screenings.bookingUrl)
      .orderBy(sql`min(${screenings.datetime})`)
      .limit(SAMPLE_PER_CINEMA);

    const urls = rows.map((r) => r.url).filter((u): u is string => Boolean(u));
    perCinemaCounts.set(c.id, { name: c.name, checked: urls.length, nonOk: 0, hardFail: 0 });

    const cinemaProbes = await runWithConcurrency(
      urls,
      (url) => probeOne(url, c.id),
      CONCURRENCY,
    );
    probes.push(...cinemaProbes);
  }

  let totalChecked = 0;
  let totalNonOk = 0;
  let totalHardFail = 0;
  for (const p of probes) {
    totalChecked++;
    const ok = typeof p.status === "number" && p.status >= 200 && p.status < 400;
    const hard = typeof p.status === "number" && HARD_FAIL_STATUSES.has(p.status);
    if (!ok) totalNonOk++;
    if (hard) totalHardFail++;
    const counts = perCinemaCounts.get(p.cinemaId);
    if (counts) {
      if (!ok) counts.nonOk++;
      if (hard) counts.hardFail++;
    }
  }

  const nonOkRate = totalChecked === 0 ? 0 : totalNonOk / totalChecked;
  const hardFailRate = totalChecked === 0 ? 0 : totalHardFail / totalChecked;
  const pass = totalHardFail === 0 && nonOkRate < TOTAL_NON_2XX_BUDGET;

  const worstCinemas = Array.from(perCinemaCounts.entries())
    .map(([id, v]) => ({ id, ...v, nonOkRate: v.checked ? v.nonOk / v.checked : 0 }))
    .filter((c) => c.hardFail > 0 || c.nonOkRate > 0.2)
    .sort((a, b) => b.hardFail - a.hardFail || b.nonOkRate - a.nonOkRate);

  console.log(
    JSON.stringify(
      {
        condition: "booking-links",
        pass,
        totalChecked,
        totalNonOk,
        totalHardFail,
        nonOkRate: Math.round(nonOkRate * 10000) / 100,
        hardFailRate: Math.round(hardFailRate * 10000) / 100,
        worstCinemas: worstCinemas.slice(0, 10),
      },
      null,
      2,
    ),
  );
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.log(JSON.stringify({ condition: "booking-links", pass: false, error: String(err) }));
  process.exit(1);
});
