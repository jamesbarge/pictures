/**
 * End-condition #6: PostHog booking funnel proof-of-life.
 *
 * For every active cinema, count `booking_click` events in the trailing 30
 * days. Passes when every active cinema has ≥ 1 event recorded.
 *
 * A cinema with 0 events is a structural booking failure even if HTTP returns
 * 200 — the URL exists but no real user has successfully clicked through it.
 *
 * Requires: POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID in .env.local.
 * If either is missing the script skips with a non-fatal warning and pass=false.
 *
 * Output: JSON to stdout. Exit code 0 if pass, 1 if fail.
 * Usage:  npx tsx --env-file=.env.local -r tsconfig-paths/register scripts/goal-check-posthog-funnel.ts
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cinemas } from "@/db/schema/cinemas";

const POSTHOG_API_HOST = process.env.POSTHOG_API_HOST ?? "https://eu.posthog.com";

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

async function main() {
  if (!process.env.POSTHOG_PERSONAL_API_KEY || !process.env.POSTHOG_PROJECT_ID) {
    console.log(
      JSON.stringify(
        {
          condition: "posthog-funnel",
          pass: false,
          skipped: true,
          reason: "POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID not set in .env.local",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const activeCinemas = await db
    .select({ id: cinemas.id, name: cinemas.name })
    .from(cinemas)
    .where(eq(cinemas.isActive, true));

  // HogQL: count distinct days the event fired per cinema_id property, last 30d.
  // We use `properties.cinema_id` which is what trackBookingClick attaches.
  const query = `
    SELECT properties.cinema_id AS cinema_id, count() AS n
    FROM events
    WHERE event = 'booking_click'
      AND timestamp >= now() - INTERVAL 30 DAY
      AND properties.cinema_id IS NOT NULL
    GROUP BY properties.cinema_id
  `;
  const counts = new Map<string, number>();
  try {
    const res = await hogql(query);
    for (const row of res.results) {
      const id = row[0] as string;
      const n = Number(row[1]);
      if (id) counts.set(id, n);
    }
  } catch (err) {
    console.log(
      JSON.stringify(
        {
          condition: "posthog-funnel",
          pass: false,
          error: String(err).slice(0, 500),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const zeroCinemas = activeCinemas.filter((c) => !counts.has(c.id) || (counts.get(c.id) ?? 0) === 0);
  const pass = zeroCinemas.length === 0;

  console.log(
    JSON.stringify(
      {
        condition: "posthog-funnel",
        pass,
        windowDays: 30,
        activeCinemas: activeCinemas.length,
        cinemasWithClicks: activeCinemas.length - zeroCinemas.length,
        zeroClickCinemas: zeroCinemas.map((c) => ({ id: c.id, name: c.name })),
      },
      null,
      2,
    ),
  );
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ condition: "posthog-funnel", pass: false, error: String(err).slice(0, 500) }));
  process.exit(1);
});
