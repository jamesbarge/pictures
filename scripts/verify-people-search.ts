/**
 * Verification for feat/people-search (READ-ONLY).
 * Proves the people-search group query and the /api/people/[name] query
 * both return sensible results against the live DB.
 * Run: npx tsx --env-file=.env.local scripts/verify-people-search.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";

function rows<T>(r: unknown): T[] {
  return Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []);
}

async function peopleSearch(q: string) {
  return rows<{ name: string; filmCount: number }>(await db.execute(sql`
    SELECT d.name AS name, count(DISTINCT f.id)::int AS "filmCount"
    FROM films f
    JOIN screenings s ON s.film_id = f.id
    CROSS JOIN LATERAL unnest(f.directors) AS d(name)
    WHERE s.datetime > now() AND f.content_type = 'film'
      AND (d.name ILIKE '%' || ${q} || '%' OR d.name % ${q})
    GROUP BY d.name
    ORDER BY (lower(d.name) = lower(${q}))::int DESC,
             (d.name ILIKE ${q} || '%')::int DESC,
             count(DISTINCT f.id) DESC, d.name ASC
    LIMIT 5
  `));
}

async function personFilms(name: string) {
  const castProbe = JSON.stringify([{ name }]);
  return rows<{ title: string; isDirector: boolean; isCast: boolean; screeningCount: number }>(
    await db.execute(sql`
      SELECT f.title,
             (${name} = ANY(f.directors)) AS "isDirector",
             (f.cast @> ${castProbe}::jsonb) AS "isCast",
             count(s.id)::int AS "screeningCount"
      FROM films f
      JOIN screenings s ON s.film_id = f.id AND s.datetime > now()
      WHERE f.content_type = 'film'
        AND (${name} = ANY(f.directors) OR f.cast @> ${castProbe}::jsonb)
      GROUP BY f.id ORDER BY min(s.datetime) ASC LIMIT 100
    `));
}

async function main() {
  // Pick a real director with the most upcoming films as the probe.
  const top = rows<{ name: string; n: number }>(await db.execute(sql`
    SELECT d.name AS name, count(DISTINCT f.id)::int AS n
    FROM films f JOIN screenings s ON s.film_id = f.id
    CROSS JOIN LATERAL unnest(f.directors) AS d(name)
    WHERE s.datetime > now() AND f.content_type = 'film' AND d.name <> ''
    GROUP BY d.name ORDER BY n DESC, d.name ASC LIMIT 5
  `));
  console.log("\n🎬 Top upcoming directors:");
  top.forEach((d) => console.log(`   • ${d.name} — ${d.n} film(s)`));

  if (top.length === 0) { console.log("No directors found — abort."); process.exit(1); }

  // Probe 1: search by a substring of the top director's name.
  const probe = top[0].name;
  const surname = probe.split(" ").slice(-1)[0];
  const ps = await peopleSearch(surname);
  console.log(`\n🔎 people-search query="${surname}":`);
  ps.forEach((p) => console.log(`   • ${p.name} (${p.filmCount} films)`));
  const found = ps.some((p) => p.name.toLowerCase() === probe.toLowerCase());
  console.log(found ? `   ✅ "${probe}" surfaced by surname search.` : `   ⚠️ "${probe}" not in results.`);

  // Probe 2: typo tolerance — drop a letter.
  if (surname.length > 4) {
    const typo = surname.slice(0, -1);
    const pst = await peopleSearch(typo);
    console.log(`\n🔎 typo query="${typo}": ${pst.map((p) => p.name).join(", ") || "(none)"}`);
  }

  // Probe 3: person-films for the full name.
  const pf = await personFilms(probe);
  console.log(`\n🎞️  /api/people/${probe} → ${pf.length} upcoming films:`);
  pf.slice(0, 6).forEach((f) =>
    console.log(`   • ${f.title} [${f.isDirector ? "director" : ""}${f.isCast ? " cast" : ""}] ${f.screeningCount} screening(s)`));
  console.log(pf.length > 0 ? "   ✅ person-films query returns rows with role flags." : "   ⚠️ no films.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
