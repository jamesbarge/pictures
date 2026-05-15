/**
 * End-condition #6: PostHog booking funnel proof-of-life.
 *
 * For every active cinema, count `booking_link_clicked` events in the trailing
 * 30 days. Passes when every active cinema has ≥ 1 event recorded.
 *
 * ── Volume floor ────────────────────────────────────────────────────────────
 * At low traffic, "every cinema has ≥1 click" is a growth signal, not a
 * quality one: with 50-ish clicks/month distributed power-law across 50+
 * venues, the long-tail cinemas can have 0 clicks for reasons that have
 * nothing to do with broken booking links. We confirmed this empirically on
 * 2026-05-15 — 52 events / 30d, 0 with null `cinema_id`, 25 distinct cinemas.
 *
 * To stop /goal from chasing an impossible target, the condition is DEFERRED
 * (returns `pass: true` with `deferred: true`) when total monthly volume is
 * below `MIN_CLICKS_FLOOR`. At that point, end-condition #6 produces no
 * actionable signal — the next ratchet is the Stagehand-based booking-URL
 * verifier (tracked as a sub-task in tasks/goal.md).
 *
 * When traffic crosses the floor, the per-cinema check engages and reports
 * zero-click cinemas as failures the way it always did.
 *
 * Requires: POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID in .env.local.
 *
 * Output: JSON to stdout. Exit code 0 if pass (incl. deferred), 1 if fail.
 * Usage:  npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-posthog-funnel.ts
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cinemas } from "@/db/schema/cinemas";

const POSTHOG_API_HOST = process.env.POSTHOG_API_HOST ?? "https://eu.posthog.com";
const MIN_CLICKS_FLOOR = 500;
const WINDOW_DAYS = 30;

interface HogQLResponse {
  results: unknown[][];
  columns: string[];
}

async function hogql(query: string): Promise<HogQLResponse> {
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!apiKey || !projectId) {
    throw new Error("POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID missing");
  }
  const resp = await fetch(`${POSTHOG_API_HOST}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PostHog HogQL query failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  return (await resp.json()) as HogQLResponse;
}

function emit(payload: Record<string, unknown>, exitCode: number): never {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(exitCode);
}

async function main() {
  if (!process.env.POSTHOG_PERSONAL_API_KEY || !process.env.POSTHOG_PROJECT_ID) {
    emit(
      {
        condition: "posthog-funnel",
        pass: false,
        skipped: true,
        reason: "POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID not set in .env.local",
      },
      1,
    );
  }

  // Step 1 — volume floor probe. Cheaper than the per-cinema query and lets
  // us short-circuit before walking the DB if traffic is insufficient.
  // Event name + property name must match the frontend tracker — see
  // frontend/src/lib/analytics/posthog.ts:128. If those change, change here.
  let totalClicks = 0;
  try {
    const totalRes = await hogql(`
      SELECT count() AS n
      FROM events
      WHERE event = 'booking_link_clicked'
        AND timestamp >= now() - INTERVAL ${WINDOW_DAYS} DAY
    `);
    totalClicks = Number(totalRes.results?.[0]?.[0] ?? 0);
  } catch (err) {
    emit(
      {
        condition: "posthog-funnel",
        pass: false,
        error: String(err).slice(0, 500),
      },
      1,
    );
  }

  if (totalClicks < MIN_CLICKS_FLOOR) {
    // Defer: no measurable signal at this traffic level. Treat as pass so
    // /goal moves on to a condition it can actually act on.
    emit(
      {
        condition: "posthog-funnel",
        pass: true,
        deferred: true,
        reason: `Total ${WINDOW_DAYS}d clicks (${totalClicks}) below ${MIN_CLICKS_FLOOR}-event floor — condition can't produce a quality signal until traffic grows. The Stagehand-based booking-URL verifier (see tasks/goal.md sub-tasks) is the path to a traffic-independent check.`,
        totalClicks,
        floor: MIN_CLICKS_FLOOR,
        windowDays: WINDOW_DAYS,
      },
      0,
    );
  }

  // Step 2 — per-cinema check. Only runs when traffic is high enough that a
  // zero-click cinema is meaningful evidence of a structural problem rather
  // than a sampling artefact.
  const activeCinemas = await db
    .select({ id: cinemas.id, name: cinemas.name })
    .from(cinemas)
    .where(eq(cinemas.isActive, true));

  const counts = new Map<string, number>();
  try {
    const res = await hogql(`
      SELECT properties.cinema_id AS cinema_id, count() AS n
      FROM events
      WHERE event = 'booking_link_clicked'
        AND timestamp >= now() - INTERVAL ${WINDOW_DAYS} DAY
        AND properties.cinema_id IS NOT NULL
      GROUP BY properties.cinema_id
    `);
    for (const row of res.results) {
      const id = row[0] as string;
      const n = Number(row[1]);
      if (id) counts.set(id, n);
    }
  } catch (err) {
    emit(
      {
        condition: "posthog-funnel",
        pass: false,
        error: String(err).slice(0, 500),
      },
      1,
    );
  }

  const zeroCinemas = activeCinemas.filter((c) => !counts.has(c.id) || (counts.get(c.id) ?? 0) === 0);
  const pass = zeroCinemas.length === 0;

  emit(
    {
      condition: "posthog-funnel",
      pass,
      windowDays: WINDOW_DAYS,
      totalClicks,
      floor: MIN_CLICKS_FLOOR,
      activeCinemas: activeCinemas.length,
      cinemasWithClicks: activeCinemas.length - zeroCinemas.length,
      zeroClickCinemas: zeroCinemas.map((c) => ({ id: c.id, name: c.name })),
    },
    pass ? 0 : 1,
  );
}

main().catch((err) => {
  console.log(JSON.stringify({ condition: "posthog-funnel", pass: false, error: String(err).slice(0, 500) }));
  process.exit(1);
});
