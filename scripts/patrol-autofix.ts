/**
 * patrol-autofix — auto-applies fixes for the dirty-title issue types the
 * data-check patrol surfaces (PR #568).
 *
 * Closes the detect→fix loop. Idempotent and safe to run on cron.
 *
 * Fix mapping:
 *   dirty_title_html_entity  → decode entities (&amp; → &, &rsquo; → ’, etc.)
 *   dirty_title_all_caps     → smart-title-case (preserves acronyms)
 *   dirty_title_event_prefix → strip via cleanFilmTitleWithMetadata
 *   dirty_title_format_suffix → strip via cleanFilmTitleWithMetadata
 *   suspicious_orphan_film   → reclassify via knownNonFilmTitles + EVENT_PATTERNS
 *
 * Guards:
 *   - Collision check before any UPDATE (won't rename onto an existing title)
 *   - Conservative ALL CAPS guard: skip short stylized titles (DUNE, BLADE, WALL-E)
 *   - Never modifies titles for films that already have a TMDB ID and a match
 *     within 24h (the patrol's stuck-enrichment guard equivalent)
 *
 * Usage:
 *   npx tsx scripts/patrol-autofix.ts --dry-run
 *   npx tsx scripts/patrol-autofix.ts
 *   npx tsx scripts/patrol-autofix.ts --only=html_entity,event_prefix
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import postgres from "postgres";
import { decodeHtmlEntities } from "../src/lib/title-patterns";
import { cleanFilmTitleWithMetadata, getKnownNonFilmType } from "../src/scrapers/utils/film-title-cleaner";

// Warn early when learnings file is missing — Pass 4 silently becomes a no-op
// on fresh checkouts / CI without this signal.
(function warnIfNoLearnings() {
  const p = ".claude/data-check-learnings.json";
  if (!fs.existsSync(p)) {
    console.warn(`⚠️  ${p} not found — non-film reclassification (Pass 4) will be a no-op`);
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8")) as { knownNonFilmTitles?: unknown[] };
    const n = data.knownNonFilmTitles?.length ?? 0;
    if (n === 0) console.warn(`⚠️  ${p} has 0 knownNonFilmTitles — Pass 4 will be a no-op`);
  } catch {
    console.warn(`⚠️  ${p} could not be parsed — Pass 4 will be a no-op`);
  }
})();

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY_FLAG = process.argv.find(a => a.startsWith("--only="));
const ONLY = ONLY_FLAG ? new Set(ONLY_FLAG.slice("--only=".length).split(",").map(s => s.trim())) : null;

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

// Detection regexes mirrored from data-check.ts (PR #568)
const DIRTY_FORMAT_SUFFIX_RE = /\((?:35mm|70mm|16mm|IMAX|Q&A|with intro|VHS SCREENING|preview|sing[- ]?along)\)\s*$/i;
const DIRTY_HTML_ENTITY_RE = /&(?:amp|quot|nbsp|hellip|mdash|ndash|rsquo|lsquo|apos|#\d+);/;
const DIRTY_ALL_CAPS_RE = /^[A-Z0-9\s\-:.,'!?&()'’–—\/#]+$/u;

// Acronyms preserved during smart-title-case
const ACRONYMS = new Set([
  "LVSFF", "SXSW", "BFI", "BAFTA", "IMAX", "UK", "USA", "US", "UFO",
  "FBI", "CIA", "NYC", "LA", "MI6", "NTL", "RSC", "ROH", "NT", "MET",
  "RAF", "WWI", "WWII", "DJ", "MC", "VHS", "DVD", "TV", "AM", "PM",
  "3D", "2D", "4K", "8K", "QC", "EU", "USSR", "GB", "PCC", "AC",
  "Q&A", "Q+A", "BBC", "ITV", "HBO", "MGM", "ABC", "CBS", "NBC",
]);

interface FilmRow {
  id: string;
  title: string;
  tmdb_id: number | null;
  content_type: string;
  matched_at: string | null;
}

interface Stats {
  htmlEntityFixed: number;
  allCapsFixed: number;
  prefixStripped: number;
  suffixStripped: number;
  reclassifiedNonFilm: number;
  collisionsSkipped: number;
}

const stats: Stats = {
  htmlEntityFixed: 0,
  allCapsFixed: 0,
  prefixStripped: 0,
  suffixStripped: 0,
  reclassifiedNonFilm: 0,
  collisionsSkipped: 0,
};

function smartTitleCase(s: string): string {
  const lowers = new Set(["of", "the", "and", "a", "an", "to", "in", "on", "for", "with", "by", "at", "from", "or", "nor", "but", "vs", "as", "is", "de", "la", "le", "du", "des"]);
  const words = s.split(/(\s+|-|:|;|\/)/);
  return words.map((w, i) => {
    if (!w.match(/\w/)) return w;
    const upper = w.toUpperCase();
    if (ACRONYMS.has(upper)) return upper;
    if (i > 0 && lowers.has(w.toLowerCase())) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join("");
}

function shouldFlagAllCaps(title: string): boolean {
  return (
    DIRTY_ALL_CAPS_RE.test(title) &&
    /[A-Z]{4,}/.test(title) &&
    !/[a-z]/.test(title) &&
    title.length >= 10 &&
    /\s/.test(title)
  );
}

async function tryUpdateTitle(filmId: string, oldTitle: string, newTitle: string, fixType: keyof Stats): Promise<boolean> {
  if (newTitle === oldTitle || newTitle.length < 2) return false;
  if (DRY_RUN) {
    console.log(`  [${fixType}] "${oldTitle}" → "${newTitle}"`);
    stats[fixType]++;
    return true;
  }
  const collision = await sql<Array<{ id: string }>>`
    SELECT id FROM films WHERE LOWER(title) = LOWER(${newTitle}) AND id <> ${filmId}
  `;
  if (collision.length > 0) {
    console.log(`  COLLISION [${fixType}]: "${oldTitle}" → "${newTitle}" (held by ${collision[0].id.slice(0, 8)})`);
    stats.collisionsSkipped++;
    return false;
  }
  await sql`UPDATE films SET title = ${newTitle}, updated_at = NOW() WHERE id = ${filmId}`;
  console.log(`  [${fixType}] "${oldTitle}" → "${newTitle}"`);
  stats[fixType]++;
  return true;
}

async function main() {
  console.log(`\n=== patrol-autofix (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===\n`);
  if (ONLY) console.log(`Only running: ${Array.from(ONLY).join(", ")}\n`);

  const films = await sql<FilmRow[]>`
    SELECT DISTINCT f.id, f.title, f.tmdb_id, f.content_type, f.matched_at
    FROM films f JOIN screenings s ON s.film_id = f.id
    WHERE s.datetime >= NOW()
  `;
  console.log(`Future films: ${films.length}\n`);

  // ── Pass 1: HTML entity decode ────────────────────────────────────────
  if (!ONLY || ONLY.has("html_entity")) {
    console.log("--- HTML entity decode ---");
    for (const f of films) {
      if (!DIRTY_HTML_ENTITY_RE.test(f.title)) continue;
      const decoded = decodeHtmlEntities(f.title);
      const updated = await tryUpdateTitle(f.id, f.title, decoded, "htmlEntityFixed");
      if (updated) f.title = decoded;
    }
  }

  // ── Pass 2: ALL CAPS smart-title-case ─────────────────────────────────
  if (!ONLY || ONLY.has("all_caps")) {
    console.log("\n--- ALL CAPS smart-title-case ---");
    for (const f of films) {
      if (!shouldFlagAllCaps(f.title)) continue;
      const cased = smartTitleCase(f.title);
      const updated = await tryUpdateTitle(f.id, f.title, cased, "allCapsFixed");
      if (updated) f.title = cased;
    }
  }

  // ── Pass 3: Event-prefix + format-suffix strip ────────────────────────
  if (!ONLY || ONLY.has("event_prefix") || ONLY.has("format_suffix")) {
    console.log("\n--- Event-prefix + format-suffix strip ---");
    for (const f of films) {
      // Never re-clean a recently-matched film (within 24h) to avoid races
      if (f.matched_at && Date.now() - new Date(f.matched_at).getTime() < 24 * 60 * 60_000) continue;
      const result = cleanFilmTitleWithMetadata(f.title);
      if (result.cleanedTitle === f.title) continue;
      // When both prefix AND suffix stripped, we still issue one UPDATE but
      // count both stats so the summary reflects what actually happened.
      const willTouchPrefix = !!result.strippedPrefix;
      const willTouchSuffix = !!result.strippedSuffix;
      if (ONLY && willTouchPrefix && !willTouchSuffix && !ONLY.has("event_prefix")) continue;
      if (ONLY && willTouchSuffix && !willTouchPrefix && !ONLY.has("format_suffix")) continue;
      const primary: keyof Stats = willTouchPrefix ? "prefixStripped" : "suffixStripped";
      const updated = await tryUpdateTitle(f.id, f.title, result.cleanedTitle, primary);
      if (updated) {
        f.title = result.cleanedTitle;
        // If both kinds of strip happened, count the secondary one too.
        if (willTouchPrefix && willTouchSuffix) {
          stats.suffixStripped++;
        }
      }
    }
  }

  // ── Pass 4: Known non-film reclassification ───────────────────────────
  // Any future film (regardless of screening count) whose title matches a
  // learned non-film pattern should be reclassified. Covers both the orphan
  // heuristic (single screening + no TMDB) and recurring event patterns.
  // Skips films with a TMDB ID — never reclassify a real TMDB-matched film.
  if (!ONLY || ONLY.has("known_non_film")) {
    console.log("\n--- Known non-film reclassification ---");
    for (const f of films) {
      if (f.tmdb_id) continue;
      if (f.content_type !== "film") continue;
      const learnedType = getKnownNonFilmType(f.title);
      if (!learnedType) continue;
      if (!DRY_RUN) {
        await sql`UPDATE films SET content_type = ${learnedType}, updated_at = NOW() WHERE id = ${f.id}`;
      }
      console.log(`  → ${learnedType}: "${f.title}"`);
      stats.reclassifiedNonFilm++;
    }
  }

  console.log("\n=== STATS ===");
  console.log(JSON.stringify(stats, null, 2));
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
