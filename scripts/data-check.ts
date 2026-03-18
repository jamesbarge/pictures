/**
 * Data Check v2 — Front-end-first data quality patrol with compounding intelligence
 *
 * Browses pictures.london with Playwright, cross-references the DB,
 * verifies screenings against cinema websites, validates TMDB matches,
 * enriches Letterboxd via IMDB bridge, and outputs structured JSON
 * for the slash command to analyze.
 *
 * v2 additions:
 * - Structured learnings JSON (machine-readable knowledge base)
 * - Cinema website verification (10 cinemas)
 * - TMDB match re-validation for low-confidence matches
 * - Letterboxd IMDB bridge enrichment
 * - DQS (Data Quality Score) per-run tracking
 * - Per-phase timing with hard timeouts
 *
 * Run: npx tsx scripts/data-check.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { chromium } from "playwright";
import postgres from "postgres";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { levenshteinDistance } from "../src/lib/levenshtein";

// ── Types ────────────────────────────────────────────────────────

interface FrontEndFilm {
  slug: string;
  title: string;
  posterUrl: string | null;
  letterboxdRating: number | null;
  screeningCount: number;
}

interface FrontEndScreening {
  filmSlug: string;
  filmTitle: string;
  cinemaName: string;
  datetime: string;
  bookingUrl: string;
  format: string | null;
}

type SeverityTier = "critical" | "high" | "medium" | "low";

interface Issue {
  type: string;
  filmId?: string;
  filmTitle: string;
  screeningId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  impactScore: number;
  severity: SeverityTier;
}

interface BookingCheckResult {
  url: string;
  filmTitle: string;
  cinemaName: string;
  status: number | "timeout" | "error";
  ok: boolean;
}

interface CursorState {
  cursorFilmTitle: string | null;
  cursorFilmId: string | null;
  filmsCheckedThisCycle: number;
  cycleNumber: number;
  batchSize: number;
  totalFilms: number;
  previousSuggestion: string | null;
}

// ── Types: Structured Learnings ─────────────────────────────────

interface WrongTmdbEntry {
  wrong: number;
  correct: number;
  year: number;
  usedCount: number;
}

interface NonFilmEntry {
  title?: string;
  pattern?: string;
  type: string;
  exact?: boolean;
  regex?: boolean;
}

interface CinemaQuirk {
  staleExpected?: boolean;
  largeStaleExpected?: boolean;
  reason: string;
}

interface LearningsJson {
  version: number;
  lastUpdated: string;
  wrongTmdbMatches: Record<string, WrongTmdbEntry>;
  knownNonFilmTitles: NonFilmEntry[];
  cinemaQuirks: Record<string, CinemaQuirk>;
  prefixesToStrip: string[];
  suffixesToStrip: string[];
  verifierCoverage: string[];
  dqsHistory: BatchDqs[];
  cycleSummaries: CycleSummary[];
}

// ── Types: Cinema Verification ──────────────────────────────────

type VerificationStatus = "confirmed" | "not_found_on_site" | "time_mismatch" | "fetch_error";

interface CinemaVerification {
  screeningId: string;
  filmId: string;
  filmTitle: string;
  cinemaId: string;
  cinemaName: string;
  datetime: string;
  status: VerificationStatus;
  detail?: string;
}

interface ScreeningToVerify {
  id: string;
  film_id: string;
  film_title: string;
  cinema_id: string;
  cinema_name: string;
  datetime: string;
  updated_at: string;
  screening_count: number;
}

// ── Types: Letterboxd Enrichment ────────────────────────────────

interface LetterboxdVerification {
  filmId: string;
  filmTitle: string;
  tmdbId: number;
  imdbId: string | null;
  letterboxdUrl: string | null;
  letterboxdRating: number | null;
  status: "resolved" | "no_imdb" | "no_redirect" | "title_mismatch" | "fetch_error";
}

// ── Types: TMDB Re-validation ───────────────────────────────────

interface TmdbRevalidation {
  filmId: string;
  filmTitle: string;
  tmdbId: number;
  matchConfidence: number | null;
  matchStrategy: string | null;
  yearMatch: boolean;
  directorMatch: boolean;
  status: "ok" | "suspect_wrong_tmdb" | "known_wrong_tmdb";
  detail?: string;
}

// ── Types: DQS ──────────────────────────────────────────────────

interface BatchDqs {
  timestamp: string;
  tmdbMatchRate: number;
  posterCoverage: number;
  letterboxdCoverage: number;
  synopsisCoverage: number;
  staleScreeningRate: number;
  verificationPassRate: number;
  compositeScore: number;
}

interface CycleSummary {
  cycleNumber: number;
  completedAt: string;
  issuesFound: number;
  fixesApplied: number;
  newLearnings: number;
  verificationHitRate: number;
}

// ── Types: Phase Timing ─────────────────────────────────────────

interface PhaseTiming {
  phase: string;
  startMs: number;
  endMs: number;
  durationMs: number;
}

// ── Types: Output ───────────────────────────────────────────────

interface DataCheckOutput {
  timestamp: string;
  cursor: CursorState;
  stats: {
    filmsOnHomepage: number;
    filmsBatchChecked: number;
    screeningsExtracted: number;
    bookingChecks: number;
    issuesFound: number;
    totalFilmsInDb: number;
  };
  issues: Issue[];
  bookingChecks: BookingCheckResult[];
  scraperHealth: ScraperHealthEntry[];
  staleScreeningsForDeletion: StaleScreeningForDeletion[];
  cinemaVerifications: CinemaVerification[];
  letterboxdVerifications: LetterboxdVerification[];
  tmdbRevalidations: TmdbRevalidation[];
  batchDqs: BatchDqs;
  phaseTimings: PhaseTiming[];
  previousSuggestion: string | null;
}

// ── Types: Scraper Health ────────────────────────────────────────

interface ScraperHealthEntry {
  id: string;
  name: string;
  chain: string | null;
  last_scraped_at: string | null;
  hours_ago: string | null;
  future_screenings: string;
}

interface StaleScreeningForDeletion {
  screeningId: string;
  filmId: string;
  filmTitle: string;
  cinemaId: string;
  datetime: string;
  updatedAt: string;
  cinemaLastScraped: string;
}

interface DbFilmRow {
  id: string;
  title: string;
  year: number | null;
  tmdb_id: number | null;
  imdb_id: string | null;
  poster_url: string | null;
  synopsis: string | null;
  letterboxd_url: string | null;
  letterboxd_rating: number | null;
  content_type: string;
  is_repertory: boolean;
  match_confidence: number | null;
  match_strategy: string | null;
  directors: string[] | null;
  cast: unknown;
}

// ── Constants ────────────────────────────────────────────────────

const BASE_URL = "https://pictures.london";
const OBSIDIAN_DIR =
  "/Users/jamesbarge/Documents/Obsidian Vault/Pictures/Data Quality";
const LEARNINGS_PATH = path.resolve(process.cwd(), ".claude/data-check-learnings.json");
const BATCH_SIZE = 40;
const BOOKING_SPOT_CHECKS = 20;
const DETAIL_PAGE_VISITS = 10;
const LETTERBOXD_ENRICHMENT_CAP = 15;
const LETTERBOXD_RATING_REFRESH_CAP = 10;
const TMDB_REVALIDATION_CAP = 10;
const CINEMA_VERIFICATION_CAP = 10;
const TOTAL_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes hard cap

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const NON_FILM_PATTERNS =
  /\b(quiz|reading group|workshop|discussion|talk|lecture|panel|book club|exhibition|karaoke|sing.?along|marathon|all.?nighter|membership|ballet|opera|theatre|theater|concert|gala|fundraiser|awards|ceremony)\b/i;
const NON_FILM_PREFIX = /^(NT Live|ROH Live|Met Opera|Bolshoi|Royal Ballet)/i;

const IMPACT_SCORES: Record<string, number> = {
  stale_screening: 70,
  known_wrong_tmdb: 80,
  suspect_wrong_tmdb: 70,
  broken_booking_url: 60,
  screening_not_on_website: 65,
  screening_time_mismatch: 45,
  duplicate_screening: 50,
  suspect_non_film: 45,
  missing_tmdb: 40,
  missing_poster: 35,
  wrong_repertory_tag: 30,
  wrong_new_tag: 30,
  needs_tmdb_backfill: 25,
  missing_synopsis: 20,
  missing_cast: 15,
  missing_year: 15,
  missing_letterboxd: 12,
  needs_letterboxd_rating: 10,
};

function severityFromScore(score: number): SeverityTier {
  if (score >= 70) return "critical";
  if (score >= 40) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function scoreIssue(type: string, metadata?: Record<string, unknown>): number {
  const base = IMPACT_SCORES[type] ?? 10;
  if (type === "stale_screening" && metadata) {
    const count = (metadata.count as number) || 1;
    const oldestUpdate = metadata.oldestUpdate as string | undefined;
    const daysStale = oldestUpdate
      ? (Date.now() - new Date(oldestUpdate).getTime()) / 86_400_000
      : 2;
    return Math.min(100, count * 5 + daysStale * 2);
  }
  return base;
}

// ── Phase Timing Helper ─────────────────────────────────────────

const phaseTimings: PhaseTiming[] = [];

function timePhase(phase: string): { end: () => void } {
  const startMs = Date.now();
  return {
    end: () => {
      const endMs = Date.now();
      phaseTimings.push({ phase, startMs, endMs, durationMs: endMs - startMs });
    },
  };
}

function isOverBudget(): boolean {
  return Date.now() - globalStartTime > TOTAL_TIMEOUT_MS;
}

let globalStartTime = Date.now();

// ── Structured Learnings Loader ─────────────────────────────────

function loadLearnings(): LearningsJson | null {
  if (!fs.existsSync(LEARNINGS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(LEARNINGS_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function saveLearnings(learnings: LearningsJson): void {
  learnings.lastUpdated = new Date().toISOString();
  fs.writeFileSync(LEARNINGS_PATH, JSON.stringify(learnings, null, 2) + "\n");
}

function buildNonFilmMatchers(learnings: LearningsJson): Array<{ test: (title: string) => boolean; type: string }> {
  return learnings.knownNonFilmTitles.map((entry) => {
    if (entry.exact && entry.title) {
      const lower = entry.title.toLowerCase();
      return { test: (t: string) => t.toLowerCase() === lower, type: entry.type };
    }
    if (entry.regex && entry.pattern) {
      const re = new RegExp(entry.pattern, "i");
      return { test: (t: string) => re.test(t), type: entry.type };
    }
    return { test: () => false, type: entry.type };
  });
}

function buildWrongTmdbLookup(learnings: LearningsJson): Map<number, { title: string; correctId: number }> {
  const map = new Map<number, { title: string; correctId: number }>();
  for (const [title, entry] of Object.entries(learnings.wrongTmdbMatches)) {
    map.set(entry.wrong, { title, correctId: entry.correct });
  }
  return map;
}

// ── Phase A: Read Previous State ─────────────────────────────────

function readPreviousState(): CursorState {
  const defaultState: CursorState = {
    cursorFilmTitle: null,
    cursorFilmId: null,
    filmsCheckedThisCycle: 0,
    cycleNumber: 1,
    batchSize: BATCH_SIZE,
    totalFilms: 0,
    previousSuggestion: null,
  };

  if (!fs.existsSync(OBSIDIAN_DIR)) return defaultState;

  const files = fs
    .readdirSync(OBSIDIAN_DIR)
    .filter((f) => f.startsWith("patrol-") && f.endsWith(".md"))
    .sort();

  if (files.length === 0) return defaultState;

  const latestFile = path.join(OBSIDIAN_DIR, files[files.length - 1]);
  const content = fs.readFileSync(latestFile, "utf-8");

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return defaultState;

  const fm = fmMatch[1];
  const get = (key: string): string | null => {
    const m = fm.match(new RegExp(`^${key}:\\s*"?([^"\\n]*)"?`, "m"));
    return m ? m[1].trim() : null;
  };
  const getNum = (key: string): number => {
    const v = get(key);
    return v ? parseInt(v, 10) : 0;
  };

  let suggestion: string | null = null;
  const suggestionMatch = content.match(
    /## (?:Suggestion|Improvement|Next Suggestion)[^\n]*\n+([\s\S]*?)(?:\n##|$)/i,
  );
  if (suggestionMatch) {
    suggestion = suggestionMatch[1].trim().replace(/^[-*]\s*/, "");
  }

  const totalFilms = getNum("total_films");
  const checked = getNum("films_checked_this_cycle");
  const cycle = getNum("cycle_number") || 1;

  if (totalFilms > 0 && checked >= totalFilms) {
    return {
      cursorFilmTitle: null,
      cursorFilmId: null,
      filmsCheckedThisCycle: 0,
      cycleNumber: cycle + 1,
      batchSize: BATCH_SIZE,
      totalFilms,
      previousSuggestion: suggestion,
    };
  }

  return {
    cursorFilmTitle: get("cursor_film_title"),
    cursorFilmId: get("cursor_film_id"),
    filmsCheckedThisCycle: checked,
    cycleNumber: cycle,
    batchSize: BATCH_SIZE,
    totalFilms,
    previousSuggestion: suggestion,
  };
}

// ── Phase B: Front-End Browsing ──────────────────────────────────

async function extractHomepageFilms(
  page: import("playwright").Page,
): Promise<FrontEndFilm[]> {
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForSelector("article", { timeout: 15_000 });
  await page.waitForTimeout(2000);

  const films = await page.evaluate(() => {
    const results: Array<{
      slug: string;
      title: string;
      posterUrl: string | null;
      letterboxdRating: number | null;
      screeningCount: number;
    }> = [];

    const articles = Array.from(document.querySelectorAll("article"));
    for (const article of articles) {
      const link = article.querySelector('a[href^="/film/"]');
      if (!link) continue;

      const href = link.getAttribute("href") || "";
      const slug = href.replace("/film/", "");

      const heading =
        article.querySelector("h3") || article.querySelector("h2");
      const title = heading?.childNodes[0]?.textContent?.trim() || "";

      const img = article.querySelector("img");
      const posterSrc = img?.getAttribute("src") || null;
      const posterUrl =
        posterSrc &&
        posterSrc.startsWith("http") &&
        !posterSrc.includes("poster-placeholder")
          ? posterSrc
          : null;

      const summaryEl = article.querySelector("div.flex.flex-wrap span");
      const summaryText = summaryEl?.textContent?.trim() || "";
      const countMatch = summaryText.match(/^(\d+)\s+show/);
      const screeningCount = countMatch ? parseInt(countMatch[1], 10) : 0;

      let letterboxdRating: number | null = null;
      const ratingEl = article.querySelector('[class*="letterboxd"]');
      if (ratingEl) {
        const ratingMatch = ratingEl.textContent?.trim().match(/([\d.]+)/);
        if (ratingMatch) letterboxdRating = parseFloat(ratingMatch[1]);
      }

      results.push({ slug, title, posterUrl, letterboxdRating, screeningCount });
    }

    return results;
  });

  const seen = new Set<string>();
  const unique: FrontEndFilm[] = [];
  for (const film of films) {
    if (!seen.has(film.slug)) {
      seen.add(film.slug);
      unique.push(film);
    }
  }

  return unique;
}

async function extractDetailScreenings(
  page: import("playwright").Page,
  film: FrontEndFilm,
): Promise<FrontEndScreening[]> {
  const url = `${BASE_URL}/film/${film.slug}`;

  try {
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 20_000,
    });
    if (!response || response.status() >= 400) return [];

    await page.waitForSelector("h1", { timeout: 10_000 });

    const screenings = await page.evaluate(
      ({ filmSlug, filmTitle }) => {
        const results: Array<{
          filmSlug: string;
          filmTitle: string;
          cinemaName: string;
          datetime: string;
          bookingUrl: string;
          format: string | null;
        }> = [];

        const jsonLdScripts = Array.from(
          document.querySelectorAll('script[type="application/ld+json"]'),
        );
        for (const script of jsonLdScripts) {
          try {
            const data = JSON.parse(script.textContent || "");
            const events = Array.isArray(data)
              ? data
              : data["@graph"]
                ? data["@graph"]
                : [data];
            for (const event of events) {
              if (
                event["@type"] === "ScreeningEvent" ||
                event["@type"] === "Event"
              ) {
                results.push({
                  filmSlug,
                  filmTitle: event.name || filmTitle,
                  cinemaName: event.location?.name || "",
                  datetime: event.startDate || "",
                  bookingUrl: event.url || event.offers?.url || "",
                  format: null,
                });
              }
            }
          } catch {
            // Ignore malformed JSON-LD
          }
        }

        if (results.length > 0) return results;

        const cinemaCards = Array.from(
          document.querySelectorAll(".bg-background-secondary"),
        );

        for (const card of cinemaCards) {
          const h3 = card.querySelector("h3.font-display");
          if (!h3) continue;
          const cinemaName = h3.textContent?.trim() || "";

          const divider = card.querySelector(".divide-y");
          if (!divider) continue;

          const rows = Array.from(divider.children);
          for (const row of rows) {
            const dateContainer = row.querySelector(".w-28");
            if (!dateContainer) continue;

            const dateDiv = dateContainer.querySelector(".text-text-primary");
            const timeDiv = dateContainer.querySelector(
              ".text-accent-highlight",
            );
            const dateText = dateDiv?.textContent?.trim() || "";
            const timeText = timeDiv?.textContent?.trim() || "";

            const datetime =
              dateText && timeText ? `${dateText} ${timeText}` : "";
            if (!datetime) continue;

            const bookLink = row.querySelector('a[target="_blank"]');
            const bookingUrl = bookLink?.getAttribute("href") || "";

            const badges = Array.from(
              row.querySelectorAll(".badge, [class*='badge']"),
            );
            const format =
              badges.length > 0
                ? badges
                    .map((b) => b.textContent?.trim())
                    .filter(Boolean)
                    .join(", ")
                : null;

            results.push({
              filmSlug,
              filmTitle,
              cinemaName,
              datetime,
              bookingUrl,
              format,
            });
          }
        }

        return results;
      },
      { filmSlug: film.slug, filmTitle: film.title },
    );

    return screenings;
  } catch {
    return [];
  }
}

// ── Phase C1: Database Cross-Reference ───────────────────────────

async function crossReferenceDb(
  sql: postgres.Sql,
  _films: FrontEndFilm[],
  cursor: CursorState,
  overrideBatch?: DbFilmRow[],
  learnings?: LearningsJson | null,
): Promise<{ issues: Issue[]; batchFilms: DbFilmRow[]; totalFilms: number; staleScreeningsForDeletion: StaleScreeningForDeletion[] }> {
  const rawIssues: Omit<Issue, "impactScore" | "severity">[] = [];
  const staleScreeningsForDeletion: StaleScreeningForDeletion[] = [];
  const now = new Date().toISOString();

  // Build learnings-based detectors
  const nonFilmMatchers = learnings ? buildNonFilmMatchers(learnings) : [];
  const wrongTmdbLookup = learnings ? buildWrongTmdbLookup(learnings) : new Map();

  const [{ cnt: totalFilms }] = await sql`
    SELECT count(distinct f.id)::int as cnt
    FROM films f JOIN screenings s ON f.id = s.film_id
    WHERE s.datetime >= ${now}::timestamptz
  `;

  let batchFilms: DbFilmRow[];
  if (overrideBatch) {
    batchFilms = overrideBatch;
  } else if (cursor.cursorFilmTitle) {
    batchFilms = await sql<DbFilmRow[]>`
      SELECT f.id, f.title, f.year, f.tmdb_id, f.imdb_id, f.poster_url, f.synopsis,
             f.letterboxd_url, f.letterboxd_rating, f.content_type,
             f.is_repertory, f.match_confidence, f.match_strategy,
             f.directors, f.cast
      FROM films f
      JOIN screenings s ON f.id = s.film_id
      WHERE s.datetime >= ${now}::timestamptz
        AND f.title > ${cursor.cursorFilmTitle}
      GROUP BY f.id
      ORDER BY f.title
      LIMIT ${BATCH_SIZE}
    `;
  } else {
    batchFilms = await sql<DbFilmRow[]>`
      SELECT f.id, f.title, f.year, f.tmdb_id, f.imdb_id, f.poster_url, f.synopsis,
             f.letterboxd_url, f.letterboxd_rating, f.content_type,
             f.is_repertory, f.match_confidence, f.match_strategy,
             f.directors, f.cast
      FROM films f
      JOIN screenings s ON f.id = s.film_id
      WHERE s.datetime >= ${now}::timestamptz
      GROUP BY f.id
      ORDER BY f.title
      LIMIT ${BATCH_SIZE}
    `;
  }

  for (const dbFilm of batchFilms) {
    // Known wrong TMDB match check (from learnings)
    if (dbFilm.tmdb_id && wrongTmdbLookup.has(dbFilm.tmdb_id)) {
      const entry = wrongTmdbLookup.get(dbFilm.tmdb_id)!;
      rawIssues.push({
        type: "known_wrong_tmdb",
        filmId: dbFilm.id,
        filmTitle: dbFilm.title,
        description: `TMDB ${dbFilm.tmdb_id} is known wrong match for "${entry.title}" — correct: ${entry.correctId}`,
        metadata: { wrongId: dbFilm.tmdb_id, correctId: entry.correctId, learnedTitle: entry.title },
      });
      // Increment usage count in learnings
      if (learnings) {
        const normalizedTitle = entry.title;
        if (learnings.wrongTmdbMatches[normalizedTitle]) {
          learnings.wrongTmdbMatches[normalizedTitle].usedCount += 1;
        }
      }
    }

    // Known non-film check (from learnings)
    if (dbFilm.content_type === "film" && !dbFilm.tmdb_id) {
      for (const matcher of nonFilmMatchers) {
        if (matcher.test(dbFilm.title)) {
          rawIssues.push({
            type: "suspect_non_film",
            filmId: dbFilm.id,
            filmTitle: dbFilm.title,
            description: `Title matches learned non-film pattern (${matcher.type})`,
            metadata: { suggestedType: matcher.type, source: "learnings" },
          });
          break;
        }
      }
    }

    // Check poster
    if (!dbFilm.poster_url) {
      rawIssues.push({
        type: "missing_poster",
        filmId: dbFilm.id,
        filmTitle: dbFilm.title,
        description: "Film has no poster_url in database",
      });
    }

    // Check synopsis
    if (dbFilm.content_type === "film" && !dbFilm.synopsis) {
      rawIssues.push({
        type: "missing_synopsis",
        filmId: dbFilm.id,
        filmTitle: dbFilm.title,
        description: "Film has no synopsis",
      });
    }

    // Check year
    if (dbFilm.content_type === "film" && !dbFilm.year) {
      rawIssues.push({
        type: "missing_year",
        filmId: dbFilm.id,
        filmTitle: dbFilm.title,
        description: "Film has no year",
      });
    }

    // Check Letterboxd
    if (dbFilm.content_type === "film" && !dbFilm.letterboxd_url) {
      rawIssues.push({
        type: "missing_letterboxd",
        filmId: dbFilm.id,
        filmTitle: dbFilm.title,
        description: "Film has no Letterboxd URL",
      });
    } else if (
      dbFilm.content_type === "film" &&
      dbFilm.letterboxd_url &&
      !dbFilm.letterboxd_rating
    ) {
      rawIssues.push({
        type: "needs_letterboxd_rating",
        filmId: dbFilm.id,
        filmTitle: dbFilm.title,
        description: "Has Letterboxd URL but no rating",
      });
    }

    // Check TMDB (only for films, not events/workshops)
    if (dbFilm.content_type === "film" && !dbFilm.tmdb_id) {
      rawIssues.push({
        type: "missing_tmdb",
        filmId: dbFilm.id,
        filmTitle: dbFilm.title,
        description: "Film has no TMDB ID",
      });
    } else if (
      dbFilm.content_type === "film" &&
      (!dbFilm.poster_url ||
      !dbFilm.synopsis ||
      !dbFilm.year ||
      !dbFilm.directors?.length)
    ) {
      rawIssues.push({
        type: "needs_tmdb_backfill",
        filmId: dbFilm.id,
        filmTitle: dbFilm.title,
        description: `TMDB ID ${dbFilm.tmdb_id} but missing fields`,
        metadata: {
          tmdbId: dbFilm.tmdb_id,
          missing: [
            !dbFilm.poster_url && "poster",
            !dbFilm.synopsis && "synopsis",
            !dbFilm.year && "year",
            !dbFilm.directors?.length && "directors",
          ].filter(Boolean),
        },
      });
    }

    // Repertory tagging check
    if (
      dbFilm.content_type === "film" &&
      dbFilm.year &&
      dbFilm.year >= 2025 &&
      dbFilm.is_repertory
    ) {
      rawIssues.push({
        type: "wrong_repertory_tag",
        filmId: dbFilm.id,
        filmTitle: dbFilm.title,
        description: `${dbFilm.year} film incorrectly tagged as repertory`,
      });
    }
    if (
      dbFilm.content_type === "film" &&
      dbFilm.year &&
      dbFilm.year < 2025 &&
      !dbFilm.is_repertory
    ) {
      rawIssues.push({
        type: "wrong_new_tag",
        filmId: dbFilm.id,
        filmTitle: dbFilm.title,
        description: `${dbFilm.year} film incorrectly tagged as new release`,
      });
    }

    // Content type misclassification (regex-based fallback)
    if (dbFilm.content_type === "film") {
      if (
        NON_FILM_PATTERNS.test(dbFilm.title) ||
        NON_FILM_PREFIX.test(dbFilm.title)
      ) {
        // Avoid duplicate if learnings already flagged it
        const alreadyFlagged = rawIssues.some(
          (i) => i.filmId === dbFilm.id && i.type === "suspect_non_film",
        );
        if (!alreadyFlagged) {
          rawIssues.push({
            type: "suspect_non_film",
            filmId: dbFilm.id,
            filmTitle: dbFilm.title,
            description: "Title matches non-film pattern but classified as film",
          });
        }
      }
    }

    // Check for missing cast
    if (
      dbFilm.content_type === "film" &&
      dbFilm.tmdb_id &&
      (!dbFilm.cast ||
        (Array.isArray(dbFilm.cast) && dbFilm.cast.length === 0))
    ) {
      rawIssues.push({
        type: "missing_cast",
        filmId: dbFilm.id,
        filmTitle: dbFilm.title,
        description: "Film has TMDB ID but no cast members",
      });
    }
  }

  // Check for duplicate screenings in the batch
  for (const dbFilm of batchFilms) {
    const dupes = await sql`
      SELECT s1.id as id1, s2.id as id2, s1.cinema_id, s1.datetime,
             s1.booking_url as url1, s2.booking_url as url2
      FROM screenings s1
      JOIN screenings s2 ON s1.film_id = s2.film_id
        AND s1.cinema_id = s2.cinema_id
        AND s1.id < s2.id
        AND ABS(EXTRACT(EPOCH FROM (s1.datetime - s2.datetime))) < 300
      WHERE s1.film_id = ${dbFilm.id}
        AND s1.datetime >= ${now}::timestamptz
    `;
    for (const d of dupes) {
      rawIssues.push({
        type: "duplicate_screening",
        filmId: dbFilm.id,
        filmTitle: dbFilm.title,
        screeningId: d.id2,
        description: `Duplicate at ${d.cinema_id} within 5 min`,
        metadata: { id1: d.id1, id2: d.id2, cinemaId: d.cinema_id },
      });
    }
  }

  // Check for potentially stale screenings with tiered system
  const STALE_THRESHOLD_HOURS = 48;
  const STALE_AUTO_DELETE_DAYS = 7;
  const staleThreshold = new Date(
    Date.now() - STALE_THRESHOLD_HOURS * 60 * 60_000,
  ).toISOString();
  const autoDeleteThreshold = new Date(
    Date.now() - STALE_AUTO_DELETE_DAYS * 24 * 60 * 60_000,
  ).toISOString();

  for (const dbFilm of batchFilms) {
    const staleScreenings = await sql`
      SELECT s.id, s.cinema_id, s.datetime, s.booking_url, s.updated_at
      FROM screenings s
      WHERE s.film_id = ${dbFilm.id}
        AND s.datetime >= ${now}::timestamptz
        AND s.updated_at < ${staleThreshold}::timestamptz
    `;
    if (staleScreenings.length > 0) {
      const byCinema = new Map<string, Array<{ id: string; cinema_id: string; datetime: string; booking_url: string; updated_at: string }>>();
      for (const s of staleScreenings) {
        const arr = byCinema.get(s.cinema_id) || [];
        arr.push(s as { id: string; cinema_id: string; datetime: string; booking_url: string; updated_at: string });
        byCinema.set(s.cinema_id, arr);
      }

      for (const [cinemaId, cinemaScreenings] of byCinema) {
        // Check cinema quirks from learnings
        const quirk = learnings?.cinemaQuirks[cinemaId];
        if (quirk?.largeStaleExpected || quirk?.staleExpected) {
          // Still report but note it's expected
          rawIssues.push({
            type: "stale_screening",
            filmId: dbFilm.id,
            filmTitle: dbFilm.title,
            description: `${cinemaScreenings.length} stale screening(s) at ${cinemaId} — expected (${quirk.reason})`,
            metadata: { cinemaId, count: cinemaScreenings.length, tier: 2, expected: true, reason: quirk.reason },
          });
          continue;
        }

        const [cinema] = await sql`SELECT last_scraped_at FROM cinemas WHERE id = ${cinemaId}`;
        const oldestUpdate = cinemaScreenings[0].updated_at;
        const cinemaScrapedAfterScreening = cinema?.last_scraped_at &&
          new Date(cinema.last_scraped_at) > new Date(oldestUpdate);

        const tier1 = cinemaScreenings.filter(
          (s) => s.updated_at < autoDeleteThreshold && cinemaScrapedAfterScreening,
        );
        const tier2 = cinemaScreenings.filter(
          (s) => !(s.updated_at < autoDeleteThreshold && cinemaScrapedAfterScreening),
        );

        if (tier1.length > 0) {
          for (const s of tier1) {
            staleScreeningsForDeletion.push({
              screeningId: s.id,
              filmId: dbFilm.id,
              filmTitle: dbFilm.title,
              cinemaId,
              datetime: s.datetime,
              updatedAt: s.updated_at,
              cinemaLastScraped: cinema.last_scraped_at,
            });
          }
          rawIssues.push({
            type: "stale_screening",
            filmId: dbFilm.id,
            filmTitle: dbFilm.title,
            description: `${tier1.length} phantom screening(s) at ${cinemaId} — auto-deletable (>7d stale, cinema scraped since)`,
            metadata: { cinemaId, count: tier1.length, oldestUpdate, tier: 1, cinemaLastScraped: cinema?.last_scraped_at },
          });
        }

        if (tier2.length > 0) {
          rawIssues.push({
            type: "stale_screening",
            filmId: dbFilm.id,
            filmTitle: dbFilm.title,
            description: `${tier2.length} screening(s) at ${cinemaId} not refreshed in ${STALE_THRESHOLD_HOURS}h (needs investigation)`,
            metadata: { cinemaId, count: tier2.length, oldestUpdate, tier: 2, cinemaLastScraped: cinema?.last_scraped_at },
          });
        }
      }
    }
  }

  const issues: Issue[] = rawIssues
    .map((raw) => {
      const score = scoreIssue(raw.type, raw.metadata);
      return { ...raw, impactScore: score, severity: severityFromScore(score) };
    })
    .sort((a, b) => b.impactScore - a.impactScore);

  return { issues, batchFilms, totalFilms, staleScreeningsForDeletion };
}

// ── Phase C2: Cinema Website Verification ────────────────────────

function levenshteinSimilarity(a: string, b: string): number {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 1;
  const maxLen = Math.max(la.length, lb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(la, lb) / maxLen;
}

async function fetchHtml(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    return resp.text();
  } catch {
    return null;
  }
}

// Each cinema verifier: fetch listing page, search for title + date
// Returns verification status. Advisory only — never triggers deletions.

async function verifyRioScreening(s: ScreeningToVerify): Promise<CinemaVerification> {
  const base: CinemaVerification = {
    screeningId: s.id, filmId: s.film_id, filmTitle: s.film_title,
    cinemaId: s.cinema_id, cinemaName: s.cinema_name, datetime: s.datetime,
    status: "fetch_error",
  };
  const html = await fetchHtml("https://riocinema.org.uk");
  if (!html) return base;

  // Rio embeds JSON: var Events = {"Events": [...]}
  const eventsMatch = html.match(/var Events\s*=\s*(\{[\s\S]*?\});\s*(?:var|<\/script>)/);
  if (!eventsMatch) return { ...base, status: "fetch_error", detail: "No Events JSON found" };

  try {
    const data = JSON.parse(eventsMatch[1]);
    const events = data.Events || [];
    const screeningDate = new Date(s.datetime);
    const dateStr = screeningDate.toISOString().split("T")[0]; // YYYY-MM-DD

    for (const event of events) {
      if (levenshteinSimilarity(event.Title, s.film_title) < 0.6) continue;
      for (const perf of event.Performances || []) {
        if (perf.StartDate === dateStr) {
          return { ...base, status: "confirmed", detail: `Matched: ${event.Title}` };
        }
      }
    }
    return { ...base, status: "not_found_on_site" };
  } catch {
    return { ...base, status: "fetch_error", detail: "JSON parse failed" };
  }
}

async function verifyIcaScreening(s: ScreeningToVerify): Promise<CinemaVerification> {
  const base: CinemaVerification = {
    screeningId: s.id, filmId: s.film_id, filmTitle: s.film_title,
    cinemaId: s.cinema_id, cinemaName: s.cinema_name, datetime: s.datetime,
    status: "fetch_error",
  };
  const html = await fetchHtml("https://www.ica.art/films");
  if (!html) return base;

  const $ = cheerio.load(html);
  const titles: string[] = [];
  $(".item.films > a").each((_, el) => {
    const text = $(el).find("h3, .title").text().trim();
    if (text) titles.push(text);
  });

  for (const title of titles) {
    if (levenshteinSimilarity(title, s.film_title) >= 0.6) {
      return { ...base, status: "confirmed", detail: `Matched on listing: ${title}` };
    }
  }
  return { ...base, status: "not_found_on_site" };
}

async function verifyBarbicanScreening(s: ScreeningToVerify): Promise<CinemaVerification> {
  const base: CinemaVerification = {
    screeningId: s.id, filmId: s.film_id, filmTitle: s.film_title,
    cinemaId: s.cinema_id, cinemaName: s.cinema_name, datetime: s.datetime,
    status: "fetch_error",
  };
  const html = await fetchHtml("https://www.barbican.org.uk/whats-on/series/new-releases");
  if (!html) return base;

  const $ = cheerio.load(html);
  const titles: string[] = [];
  $('a[href*="/whats-on/"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 2) titles.push(text);
  });

  for (const title of titles) {
    if (levenshteinSimilarity(title, s.film_title) >= 0.6) {
      return { ...base, status: "confirmed", detail: `Matched: ${title}` };
    }
  }
  return { ...base, status: "not_found_on_site" };
}

async function verifyCloseUpScreening(s: ScreeningToVerify): Promise<CinemaVerification> {
  const base: CinemaVerification = {
    screeningId: s.id, filmId: s.film_id, filmTitle: s.film_title,
    cinemaId: s.cinema_id, cinemaName: s.cinema_name, datetime: s.datetime,
    status: "fetch_error",
  };
  const html = await fetchHtml("https://www.closeupfilmcentre.com/whats-on/");
  if (!html) return base;

  const $ = cheerio.load(html);
  const bodyText = $("body").text();
  // Simple title search in page text
  if (bodyText.toLowerCase().includes(s.film_title.toLowerCase().substring(0, 20))) {
    return { ...base, status: "confirmed", detail: "Title found in page text" };
  }
  return { ...base, status: "not_found_on_site" };
}

async function verifyGenesisScreening(s: ScreeningToVerify): Promise<CinemaVerification> {
  const base: CinemaVerification = {
    screeningId: s.id, filmId: s.film_id, filmTitle: s.film_title,
    cinemaId: s.cinema_id, cinemaName: s.cinema_name, datetime: s.datetime,
    status: "fetch_error",
  };
  const html = await fetchHtml("https://genesiscinema.co.uk/GenesisCinema.dll/WhatsOn");
  if (!html) return base;

  const $ = cheerio.load(html);
  const titles: string[] = [];
  $(".film-title, h3, .movie-title").each((_, el) => {
    const text = $(el).text().trim();
    if (text) titles.push(text);
  });

  // Also search full page text as fallback
  const bodyText = $("body").text();
  if (bodyText.toLowerCase().includes(s.film_title.toLowerCase().substring(0, 20))) {
    return { ...base, status: "confirmed", detail: "Title found in page text" };
  }

  for (const title of titles) {
    if (levenshteinSimilarity(title, s.film_title) >= 0.6) {
      return { ...base, status: "confirmed", detail: `Matched: ${title}` };
    }
  }
  return { ...base, status: "not_found_on_site" };
}

async function verifyRichMixScreening(s: ScreeningToVerify): Promise<CinemaVerification> {
  const base: CinemaVerification = {
    screeningId: s.id, filmId: s.film_id, filmTitle: s.film_title,
    cinemaId: s.cinema_id, cinemaName: s.cinema_name, datetime: s.datetime,
    status: "fetch_error",
  };
  const html = await fetchHtml("https://richmix.org.uk/whats-on/?category=film");
  if (!html) return base;

  const $ = cheerio.load(html);
  const bodyText = $("body").text();
  if (bodyText.toLowerCase().includes(s.film_title.toLowerCase().substring(0, 20))) {
    return { ...base, status: "confirmed", detail: "Title found in page text" };
  }
  return { ...base, status: "not_found_on_site" };
}

// Chain verifiers use APIs when available

async function verifyCurzonScreening(s: ScreeningToVerify): Promise<CinemaVerification> {
  const base: CinemaVerification = {
    screeningId: s.id, filmId: s.film_id, filmTitle: s.film_title,
    cinemaId: s.cinema_id, cinemaName: s.cinema_name, datetime: s.datetime,
    status: "fetch_error",
  };
  // Curzon requires SSR token extraction; use page text search as lightweight check
  const venueSlug = s.cinema_id.replace("curzon-", "");
  const html = await fetchHtml(`https://www.curzon.com/venues/${venueSlug}/`);
  if (!html) return base;

  const bodyText = html.toLowerCase();
  const searchTerm = s.film_title.toLowerCase().substring(0, 20);
  if (bodyText.includes(searchTerm)) {
    return { ...base, status: "confirmed", detail: "Title found on venue page" };
  }
  return { ...base, status: "not_found_on_site" };
}

async function verifyPicturehouseScreening(s: ScreeningToVerify): Promise<CinemaVerification> {
  const base: CinemaVerification = {
    screeningId: s.id, filmId: s.film_id, filmTitle: s.film_title,
    cinemaId: s.cinema_id, cinemaName: s.cinema_name, datetime: s.datetime,
    status: "fetch_error",
  };
  // Picturehouse has an API; try the venue's listing page
  const venueSlug = s.cinema_id.replace("picturehouse-", "");
  const html = await fetchHtml(`https://www.picturehouses.com/cinema/${venueSlug}`);
  if (!html) return base;

  const bodyText = html.toLowerCase();
  const searchTerm = s.film_title.toLowerCase().substring(0, 20);
  if (bodyText.includes(searchTerm)) {
    return { ...base, status: "confirmed", detail: "Title found on venue page" };
  }
  return { ...base, status: "not_found_on_site" };
}

async function verifyEverymanScreening(s: ScreeningToVerify): Promise<CinemaVerification> {
  const base: CinemaVerification = {
    screeningId: s.id, filmId: s.film_id, filmTitle: s.film_title,
    cinemaId: s.cinema_id, cinemaName: s.cinema_name, datetime: s.datetime,
    status: "fetch_error",
  };
  // Everyman has JSON API
  const venueSlug = s.cinema_id.replace("everyman-", "");
  const html = await fetchHtml(`https://www.everymancinema.com/venues-list/${venueSlug}`);
  if (!html) return base;

  const bodyText = html.toLowerCase();
  const searchTerm = s.film_title.toLowerCase().substring(0, 20);
  if (bodyText.includes(searchTerm)) {
    return { ...base, status: "confirmed", detail: "Title found on venue page" };
  }
  return { ...base, status: "not_found_on_site" };
}

const CINEMA_VERIFIERS: Record<string, (s: ScreeningToVerify) => Promise<CinemaVerification>> = {
  "rio-dalston": verifyRioScreening,
  "ica": verifyIcaScreening,
  "barbican": verifyBarbicanScreening,
  "close-up": verifyCloseUpScreening,
  "genesis": verifyGenesisScreening,
  "rich-mix": verifyRichMixScreening,
};

// Chain verifiers: any cinema ID starting with these prefixes
const CHAIN_VERIFIERS: Array<{ prefix: string; verify: (s: ScreeningToVerify) => Promise<CinemaVerification> }> = [
  { prefix: "curzon-", verify: verifyCurzonScreening },
  { prefix: "picturehouse-", verify: verifyPicturehouseScreening },
  { prefix: "everyman-", verify: verifyEverymanScreening },
];

function getVerifier(cinemaId: string): ((s: ScreeningToVerify) => Promise<CinemaVerification>) | null {
  if (CINEMA_VERIFIERS[cinemaId]) return CINEMA_VERIFIERS[cinemaId];
  for (const chain of CHAIN_VERIFIERS) {
    if (cinemaId.startsWith(chain.prefix)) return chain.verify;
  }
  return null;
}

async function verifyCinemaScreenings(
  sql: postgres.Sql,
  batchFilms: DbFilmRow[],
): Promise<CinemaVerification[]> {
  const now = new Date().toISOString();
  const batchFilmIds = batchFilms.map((f) => f.id);
  if (batchFilmIds.length === 0) return [];

  // Select screenings to verify, prioritizing those at verifiable cinemas
  // Include independent cinema IDs directly + chain prefix patterns
  const allCinemaIds = Object.keys(CINEMA_VERIFIERS);

  const screenings = await sql<ScreeningToVerify[]>`
    SELECT s.id, s.film_id, f.title as film_title, s.cinema_id,
           c.name as cinema_name, s.datetime::text as datetime,
           s.updated_at::text as updated_at,
           COUNT(*) OVER (PARTITION BY s.film_id)::int as screening_count
    FROM screenings s
    JOIN films f ON s.film_id = f.id
    JOIN cinemas c ON s.cinema_id = c.id
    WHERE s.film_id = ANY(${batchFilmIds})
      AND s.datetime >= ${now}::timestamptz
      AND (
        s.cinema_id = ANY(${allCinemaIds})
        OR s.cinema_id LIKE 'curzon-%'
        OR s.cinema_id LIKE 'picturehouse-%'
        OR s.cinema_id LIKE 'everyman-%'
      )
    ORDER BY screening_count DESC, s.updated_at ASC
    LIMIT ${CINEMA_VERIFICATION_CAP * 2}
  `;

  const results: CinemaVerification[] = [];
  const phaseDeadline = Date.now() + 180_000; // 3 min hard timeout

  for (const screening of screenings) {
    if (results.length >= CINEMA_VERIFICATION_CAP) break;
    if (Date.now() > phaseDeadline) break;

    const verifier = getVerifier(screening.cinema_id);
    if (!verifier) continue;

    try {
      const result = await verifier(screening);
      results.push(result);
      await new Promise((r) => setTimeout(r, 500)); // rate limit
    } catch {
      results.push({
        screeningId: screening.id,
        filmId: screening.film_id,
        filmTitle: screening.film_title,
        cinemaId: screening.cinema_id,
        cinemaName: screening.cinema_name,
        datetime: screening.datetime,
        status: "fetch_error",
        detail: "Verifier threw exception",
      });
    }
  }

  return results;
}

// ── Phase C3: TMDB Match Re-validation ──────────────────────────

async function revalidateTmdbMatches(
  sql: postgres.Sql,
  batchFilms: DbFilmRow[],
): Promise<TmdbRevalidation[]> {
  const results: TmdbRevalidation[] = [];
  const phaseDeadline = Date.now() + 120_000; // 2 min

  // Films with low confidence or no-hints matching
  const candidates = batchFilms.filter(
    (f) =>
      f.content_type === "film" &&
      f.tmdb_id &&
      ((f.match_confidence !== null && f.match_confidence < 0.8) ||
        f.match_strategy === "auto-no-hints"),
  );

  for (const film of candidates.slice(0, TMDB_REVALIDATION_CAP)) {
    if (Date.now() > phaseDeadline) break;

    // Fetch TMDB data for comparison
    try {
      const tmdbApiKey = process.env.TMDB_API_KEY;
      if (!tmdbApiKey) break;

      const resp = await fetch(
        `https://api.themoviedb.org/3/movie/${film.tmdb_id}?api_key=${tmdbApiKey}&append_to_response=credits`,
      );
      if (!resp.ok) {
        results.push({
          filmId: film.id,
          filmTitle: film.title,
          tmdbId: film.tmdb_id!,
          matchConfidence: film.match_confidence,
          matchStrategy: film.match_strategy,
          yearMatch: false,
          directorMatch: false,
          status: "ok",
          detail: `TMDB API returned ${resp.status}`,
        });
        continue;
      }

      const tmdbData = await resp.json() as {
        release_date?: string;
        credits?: { crew?: Array<{ job: string; name: string }> };
      };

      const tmdbYear = tmdbData.release_date
        ? parseInt(tmdbData.release_date.split("-")[0], 10)
        : null;
      const tmdbDirectors = (tmdbData.credits?.crew || [])
        .filter((c) => c.job === "Director")
        .map((c) => c.name.toLowerCase());

      const yearMatch = !film.year || !tmdbYear || Math.abs(film.year - tmdbYear) <= 2;
      const dbDirectors = (film.directors || []).map((d) => d.toLowerCase());
      const directorMatch =
        dbDirectors.length === 0 ||
        tmdbDirectors.length === 0 ||
        dbDirectors.some((d) => tmdbDirectors.some((td) => levenshteinSimilarity(d, td) > 0.8));

      let status: TmdbRevalidation["status"] = "ok";
      let detail: string | undefined;

      if (!yearMatch && Math.abs((film.year || 0) - (tmdbYear || 0)) > 5) {
        status = "suspect_wrong_tmdb";
        detail = `DB year: ${film.year}, TMDB year: ${tmdbYear}`;
      } else if (!directorMatch && dbDirectors.length > 0 && tmdbDirectors.length > 0) {
        status = "suspect_wrong_tmdb";
        detail = `DB directors: ${dbDirectors.join(", ")}, TMDB: ${tmdbDirectors.join(", ")}`;
      }

      results.push({
        filmId: film.id,
        filmTitle: film.title,
        tmdbId: film.tmdb_id!,
        matchConfidence: film.match_confidence,
        matchStrategy: film.match_strategy,
        yearMatch,
        directorMatch,
        status,
        detail,
      });

      await new Promise((r) => setTimeout(r, 300)); // TMDB rate limit
    } catch {
      // Skip on error
    }
  }

  return results;
}

// ── Phase C4: Letterboxd IMDB Bridge ────────────────────────────

async function enrichLetterboxd(
  sql: postgres.Sql,
  batchFilms: DbFilmRow[],
): Promise<LetterboxdVerification[]> {
  const results: LetterboxdVerification[] = [];
  const phaseDeadline = Date.now() + 120_000; // 2 min

  // Films with tmdb_id but no letterboxd_url
  const needsUrl = batchFilms.filter(
    (f) => f.content_type === "film" && f.tmdb_id && !f.letterboxd_url,
  );

  const tmdbApiKey = process.env.TMDB_API_KEY;

  for (const film of needsUrl.slice(0, LETTERBOXD_ENRICHMENT_CAP)) {
    if (Date.now() > phaseDeadline) break;

    let imdbId = film.imdb_id;

    // Step 1: If no IMDB ID, fetch from TMDB
    if (!imdbId && tmdbApiKey) {
      try {
        const resp = await fetch(
          `https://api.themoviedb.org/3/movie/${film.tmdb_id}?api_key=${tmdbApiKey}`,
        );
        if (resp.ok) {
          const data = await resp.json() as { imdb_id?: string };
          imdbId = data.imdb_id || null;
          if (imdbId) {
            // Store IMDB ID back to DB
            await sql`UPDATE films SET imdb_id = ${imdbId}, updated_at = NOW() WHERE id = ${film.id} AND imdb_id IS NULL`;
          }
        }
        await new Promise((r) => setTimeout(r, 300));
      } catch {
        // Skip
      }
    }

    if (!imdbId) {
      results.push({
        filmId: film.id, filmTitle: film.title, tmdbId: film.tmdb_id!,
        imdbId: null, letterboxdUrl: null, letterboxdRating: null,
        status: "no_imdb",
      });
      continue;
    }

    // Step 2: Use IMDB→Letterboxd redirect
    try {
      const letterboxdResp = await fetch(`https://letterboxd.com/imdb/${imdbId}/`, {
        redirect: "manual",
        headers: { "User-Agent": UA },
      });

      // Letterboxd redirects to /film/{slug}/
      const location = letterboxdResp.headers.get("location");
      if (!location || !location.includes("/film/")) {
        results.push({
          filmId: film.id, filmTitle: film.title, tmdbId: film.tmdb_id!,
          imdbId, letterboxdUrl: null, letterboxdRating: null,
          status: "no_redirect",
        });
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      const letterboxdUrl = location.startsWith("http")
        ? location
        : `https://letterboxd.com${location}`;

      // Step 3: Fetch the Letterboxd page to get rating and verify title
      const pageHtml = await fetchHtml(letterboxdUrl);
      let letterboxdRating: number | null = null;
      let pageTitle = "";

      if (pageHtml) {
        const $ = cheerio.load(pageHtml);
        // Rating is in <meta name="twitter:data2" content="X.XX out of 5">
        // or in the page's average rating element
        const ratingMeta = $('meta[name="twitter:data2"]').attr("content");
        if (ratingMeta) {
          const ratingMatch = ratingMeta.match(/([\d.]+)/);
          if (ratingMatch) letterboxdRating = parseFloat(ratingMatch[1]);
        }

        // Title verification
        pageTitle = $("h1.headline-1").text().trim() ||
                    $('meta[property="og:title"]').attr("content") || "";
      }

      // Safety: verify title fuzzy-match (reject if no title found or low similarity)
      if (!pageTitle || levenshteinSimilarity(pageTitle, film.title) < 0.5) {
        results.push({
          filmId: film.id, filmTitle: film.title, tmdbId: film.tmdb_id!,
          imdbId, letterboxdUrl, letterboxdRating: null,
          status: "title_mismatch",
        });
      } else {
        results.push({
          filmId: film.id, filmTitle: film.title, tmdbId: film.tmdb_id!,
          imdbId, letterboxdUrl, letterboxdRating,
          status: "resolved",
        });
      }

      await new Promise((r) => setTimeout(r, 500));
    } catch {
      results.push({
        filmId: film.id, filmTitle: film.title, tmdbId: film.tmdb_id!,
        imdbId, letterboxdUrl: null, letterboxdRating: null,
        status: "fetch_error",
      });
    }
  }

  // Also handle: films with letterboxd_url but no rating
  const needsRating = batchFilms.filter(
    (f) => f.content_type === "film" && f.letterboxd_url && !f.letterboxd_rating,
  );

  for (const film of needsRating.slice(0, LETTERBOXD_RATING_REFRESH_CAP)) {
    if (Date.now() > phaseDeadline) break;

    try {
      const pageHtml = await fetchHtml(film.letterboxd_url!);
      if (!pageHtml) continue;

      const $ = cheerio.load(pageHtml);
      const ratingMeta = $('meta[name="twitter:data2"]').attr("content");
      if (ratingMeta) {
        const ratingMatch = ratingMeta.match(/([\d.]+)/);
        if (ratingMatch) {
          results.push({
            filmId: film.id, filmTitle: film.title, tmdbId: film.tmdb_id || 0,
            imdbId: film.imdb_id, letterboxdUrl: film.letterboxd_url,
            letterboxdRating: parseFloat(ratingMatch[1]),
            status: "resolved",
          });
        }
      }
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      // Skip
    }
  }

  return results;
}

// ── Phase D: Booking URL Spot-Checks ─────────────────────────────

async function spotCheckBookings(
  sql: postgres.Sql,
  batchFilmIds: string[],
): Promise<BookingCheckResult[]> {
  if (batchFilmIds.length === 0) return [];
  const now = new Date().toISOString();

  const screenings = await sql`
    SELECT s.id, s.booking_url, s.cinema_id, f.title
    FROM screenings s
    JOIN films f ON s.film_id = f.id
    WHERE s.film_id = ANY(${batchFilmIds})
      AND s.datetime >= ${now}::timestamptz
      AND s.booking_url IS NOT NULL
      AND s.booking_url != ''
      AND s.cinema_id NOT LIKE 'curzon%'
      AND s.cinema_id NOT LIKE 'everyman%'
      AND s.cinema_id NOT LIKE 'picturehouse%'
      AND s.cinema_id NOT LIKE 'bfi%'
      AND s.cinema_id != 'peckhamplex'
    ORDER BY RANDOM()
    LIMIT ${BOOKING_SPOT_CHECKS}
  `;

  const results: BookingCheckResult[] = [];
  for (const s of screenings) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(s.booking_url, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "follow",
        headers: { "User-Agent": UA },
      });
      clearTimeout(timeout);
      results.push({
        url: s.booking_url,
        filmTitle: s.title,
        cinemaName: s.cinema_id,
        status: resp.status,
        ok: resp.status < 400,
      });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      results.push({
        url: s.booking_url,
        filmTitle: s.title,
        cinemaName: s.cinema_id,
        status: isTimeout ? "timeout" : "error",
        ok: false,
      });
    }
  }

  return results;
}

// ── Phase E: Scraper Health ───────────────────────────────────────

async function getScraperHealth(
  sql: postgres.Sql,
): Promise<ScraperHealthEntry[]> {
  const results = await sql<ScraperHealthEntry[]>`
    SELECT c.id, c.name, c.chain,
           c.last_scraped_at::text as last_scraped_at,
           EXTRACT(EPOCH FROM (NOW() - c.last_scraped_at))::int / 3600 as hours_ago,
           COUNT(s.id) FILTER (WHERE s.datetime >= NOW())::text as future_screenings
    FROM cinemas c
    LEFT JOIN screenings s ON c.id = s.cinema_id
    WHERE c.is_active = true
    GROUP BY c.id
    ORDER BY c.last_scraped_at ASC NULLS FIRST
  `;
  return results.filter(
    (r) =>
      !r.last_scraped_at ||
      (r.hours_ago !== null && parseFloat(r.hours_ago) > 24) ||
      parseInt(r.future_screenings) === 0,
  );
}

// ── DQS Computation ─────────────────────────────────────────────

function computeBatchDqs(
  batchFilms: DbFilmRow[],
  staleScreeningCount: number,
  totalScreeningsChecked: number,
  verifications: CinemaVerification[],
): BatchDqs {
  const films = batchFilms.filter((f) => f.content_type === "film");
  const total = films.length || 1;

  const tmdbMatchRate = films.filter((f) => f.tmdb_id).length / total;
  const posterCoverage = films.filter((f) => f.poster_url).length / total;
  const letterboxdCoverage = films.filter((f) => f.letterboxd_url).length / total;
  const synopsisCoverage = films.filter((f) => f.synopsis).length / total;
  const staleScreeningRate = totalScreeningsChecked > 0
    ? 1 - (staleScreeningCount / totalScreeningsChecked)
    : 1;

  const confirmed = verifications.filter((v) => v.status === "confirmed").length;
  const verifiedTotal = verifications.filter((v) => v.status !== "fetch_error").length;
  const verificationPassRate = verifiedTotal > 0 ? confirmed / verifiedTotal : 1;

  // Weighted composite: TMDB 30%, poster 15%, Letterboxd 10%, synopsis 10%, stale 20%, verification 15%
  const compositeScore = Math.round(
    (tmdbMatchRate * 30 +
      posterCoverage * 15 +
      letterboxdCoverage * 10 +
      synopsisCoverage * 10 +
      staleScreeningRate * 20 +
      verificationPassRate * 15) * 100,
  ) / 100;

  return {
    timestamp: new Date().toISOString(),
    tmdbMatchRate: Math.round(tmdbMatchRate * 1000) / 1000,
    posterCoverage: Math.round(posterCoverage * 1000) / 1000,
    letterboxdCoverage: Math.round(letterboxdCoverage * 1000) / 1000,
    synopsisCoverage: Math.round(synopsisCoverage * 1000) / 1000,
    staleScreeningRate: Math.round(staleScreeningRate * 1000) / 1000,
    verificationPassRate: Math.round(verificationPassRate * 1000) / 1000,
    compositeScore,
  };
}

// ── Priority Mode: Worst-Offender Query ──────────────────────────

async function getPriorityFilms(
  sql: postgres.Sql,
): Promise<DbFilmRow[]> {
  const now = new Date().toISOString();
  const staleThreshold = new Date(
    Date.now() - 48 * 60 * 60_000,
  ).toISOString();

  return sql<DbFilmRow[]>`
    SELECT f.id, f.title, f.year, f.tmdb_id, f.imdb_id, f.poster_url, f.synopsis,
           f.letterboxd_url, f.letterboxd_rating, f.content_type,
           f.is_repertory, f.match_confidence, f.match_strategy,
           f.directors, f.cast
    FROM films f
    JOIN screenings s ON f.id = s.film_id
    WHERE s.datetime >= ${now}::timestamptz
      AND (s.updated_at < ${staleThreshold}::timestamptz
           OR f.tmdb_id IS NULL
           OR f.poster_url IS NULL)
    GROUP BY f.id
    ORDER BY COUNT(s.id) FILTER (WHERE s.updated_at < ${staleThreshold}::timestamptz) DESC
    LIMIT ${BATCH_SIZE}
  `;
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  globalStartTime = Date.now();
  const isPriorityMode = process.argv.includes("--priority");

  // Phase A: Load context + learnings
  const timerA = timePhase("A: Load context");
  const learnings = loadLearnings();
  let cursor = readPreviousState();
  if (learnings) {
    console.error(`[data-check] Learnings v${learnings.version}: ${Object.keys(learnings.wrongTmdbMatches).length} wrong TMDB, ${learnings.knownNonFilmTitles.length} non-film patterns`);
  }
  if (isPriorityMode) {
    console.error("[data-check] PRIORITY MODE — targeting worst offenders");
  } else {
    console.error(
      `[data-check] Cycle ${cursor.cycleNumber}, checked ${cursor.filmsCheckedThisCycle}/${cursor.totalFilms || "?"}`,
    );
    if (cursor.cursorFilmTitle) {
      console.error(`[data-check] Resuming from: "${cursor.cursorFilmTitle}"`);
    }
  }
  timerA.end();

  // Phase B: Browse front-end
  const timerB = timePhase("B: Homepage browsing");
  console.error("[data-check] Launching Playwright...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  let homepageFilms: FrontEndFilm[] = [];
  try {
    homepageFilms = await extractHomepageFilms(page);
    console.error(
      `[data-check] Homepage: ${homepageFilms.length} unique films`,
    );
  } catch (err) {
    console.error(
      `[data-check] Homepage extraction failed: ${err instanceof Error ? err.message : err}`,
    );
  }
  timerB.end();

  // Phase C1: DB cross-reference
  const timerC1 = timePhase("C1: DB cross-reference");
  console.error("[data-check] Connecting to database...");
  const sql = postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 2,
    connect_timeout: 15,
    idle_timeout: 10,
  });

  let issues: Issue[];
  let batchFilms: DbFilmRow[];
  let totalFilms: number;
  let staleScreeningsForDeletion: StaleScreeningForDeletion[];

  if (isPriorityMode) {
    const priorityFilms = await getPriorityFilms(sql);
    console.error(`[data-check] Priority: ${priorityFilms.length} worst-offender films`);

    const result = await crossReferenceDb(sql, homepageFilms, cursor, priorityFilms, learnings);
    issues = result.issues;
    batchFilms = result.batchFilms;
    totalFilms = result.totalFilms;
    staleScreeningsForDeletion = result.staleScreeningsForDeletion;
  } else {
    const result = await crossReferenceDb(sql, homepageFilms, cursor, undefined, learnings);
    issues = result.issues;
    batchFilms = result.batchFilms;
    totalFilms = result.totalFilms;
    staleScreeningsForDeletion = result.staleScreeningsForDeletion;

    if (batchFilms.length === 0 && cursor.cursorFilmTitle) {
      console.error(
        `[data-check] End of alphabet reached — wrapping to cycle ${cursor.cycleNumber + 1}`,
      );
      const wrappedCursor: CursorState = {
        ...cursor,
        cursorFilmTitle: null,
        cursorFilmId: null,
        filmsCheckedThisCycle: 0,
        cycleNumber: cursor.cycleNumber + 1,
      };
      const wrapResult = await crossReferenceDb(sql, homepageFilms, wrappedCursor, undefined, learnings);
      issues = wrapResult.issues;
      batchFilms = wrapResult.batchFilms;
      totalFilms = wrapResult.totalFilms;
      staleScreeningsForDeletion = wrapResult.staleScreeningsForDeletion;
      cursor = wrappedCursor;
    }
  }

  console.error(
    `[data-check] Batch: ${batchFilms.length} films, ${issues.length} issues`,
  );
  timerC1.end();

  // Phase C2: Cinema website verification
  const timerC2 = timePhase("C2: Cinema verification");
  let cinemaVerifications: CinemaVerification[] = [];
  if (!isOverBudget()) {
    cinemaVerifications = await verifyCinemaScreenings(sql, batchFilms);
    console.error(
      `[data-check] Cinema verification: ${cinemaVerifications.length} checked, ${cinemaVerifications.filter((v) => v.status === "confirmed").length} confirmed`,
    );

    // Add advisory issues for not-found screenings
    for (const v of cinemaVerifications) {
      if (v.status === "not_found_on_site") {
        const score = scoreIssue("screening_not_on_website");
        issues.push({
          type: "screening_not_on_website",
          filmId: v.filmId,
          filmTitle: v.filmTitle,
          screeningId: v.screeningId,
          description: `Screening not found on ${v.cinemaName} website (advisory)`,
          metadata: { cinemaId: v.cinemaId },
          impactScore: score,
          severity: severityFromScore(score),
        });
      } else if (v.status === "time_mismatch") {
        const score = scoreIssue("screening_time_mismatch");
        issues.push({
          type: "screening_time_mismatch",
          filmId: v.filmId,
          filmTitle: v.filmTitle,
          screeningId: v.screeningId,
          description: `Screening time mismatch at ${v.cinemaName}: ${v.detail}`,
          metadata: { cinemaId: v.cinemaId },
          impactScore: score,
          severity: severityFromScore(score),
        });
      }
    }
  }
  timerC2.end();

  // Phase C3: TMDB match re-validation
  const timerC3 = timePhase("C3: TMDB revalidation");
  let tmdbRevalidations: TmdbRevalidation[] = [];
  if (!isOverBudget()) {
    tmdbRevalidations = await revalidateTmdbMatches(sql, batchFilms);
    const suspects = tmdbRevalidations.filter((r) => r.status === "suspect_wrong_tmdb");
    console.error(
      `[data-check] TMDB revalidation: ${tmdbRevalidations.length} checked, ${suspects.length} suspects`,
    );

    // Add suspect issues
    for (const r of suspects) {
      const score = scoreIssue("suspect_wrong_tmdb");
      issues.push({
        type: "suspect_wrong_tmdb",
        filmId: r.filmId,
        filmTitle: r.filmTitle,
        description: `Suspect wrong TMDB ${r.tmdbId}: ${r.detail}`,
        metadata: { tmdbId: r.tmdbId, matchConfidence: r.matchConfidence, matchStrategy: r.matchStrategy },
        impactScore: score,
        severity: severityFromScore(score),
      });
    }
  }
  timerC3.end();

  // Phase C4: Letterboxd enrichment
  const timerC4 = timePhase("C4: Letterboxd enrichment");
  let letterboxdVerifications: LetterboxdVerification[] = [];
  if (!isOverBudget()) {
    letterboxdVerifications = await enrichLetterboxd(sql, batchFilms);
    const resolved = letterboxdVerifications.filter((v) => v.status === "resolved");
    console.error(
      `[data-check] Letterboxd: ${letterboxdVerifications.length} checked, ${resolved.length} resolved`,
    );
  }
  timerC4.end();

  // Visit detail pages for the batch (extract screenings)
  const timerE = timePhase("E: Detail page deep-dives");
  const allScreenings: FrontEndScreening[] = [];
  if (!isOverBudget()) {
    for (const dbFilm of batchFilms.slice(0, DETAIL_PAGE_VISITS)) {
      if (isOverBudget()) break;
      const feFilm = homepageFilms.find((f) => f.slug === dbFilm.id);
      if (!feFilm) continue;

      const screenings = await extractDetailScreenings(page, feFilm);
      allScreenings.push(...screenings);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.error(
    `[data-check] Detail pages: ${allScreenings.length} screenings extracted`,
  );
  timerE.end();

  // Phase D: Booking spot-checks
  const timerD = timePhase("D: Booking spot-checks");
  const batchFilmIds = batchFilms.map((f) => f.id);
  let bookingChecks: BookingCheckResult[] = [];
  if (!isOverBudget()) {
    bookingChecks = await spotCheckBookings(sql, batchFilmIds);
    const brokenBookings = bookingChecks.filter((b) => !b.ok);
    if (brokenBookings.length > 0) {
      for (const b of brokenBookings) {
        const score = scoreIssue("broken_booking_url");
        issues.push({
          type: "broken_booking_url",
          filmTitle: b.filmTitle,
          description: `Booking URL returned ${b.status} at ${b.cinemaName}`,
          metadata: { url: b.url, status: b.status },
          impactScore: score,
          severity: severityFromScore(score),
        });
      }
    }
    console.error(
      `[data-check] Booking checks: ${bookingChecks.length} checked, ${brokenBookings.length} broken`,
    );
  }
  timerD.end();

  // Phase F: Scraper health (global, every run)
  const timerF = timePhase("F: Scraper health");
  const scraperHealth = await getScraperHealth(sql);
  console.error(
    `[data-check] Scraper health: ${scraperHealth.length} cinemas stale/missing`,
  );
  timerF.end();

  // Re-sort issues after adding all issue types
  issues.sort((a, b) => b.impactScore - a.impactScore);

  // Compute DQS — query actual screening count for the batch films
  const staleCount = staleScreeningsForDeletion.length;
  const [{ cnt: totalScreeningsInBatch }] = batchFilmIds.length > 0
    ? await sql`SELECT count(*)::int as cnt FROM screenings WHERE film_id = ANY(${batchFilmIds}) AND datetime >= ${new Date().toISOString()}::timestamptz`
    : [{ cnt: 0 }];
  const batchDqs = computeBatchDqs(batchFilms, staleCount, totalScreeningsInBatch || 1, cinemaVerifications);
  console.error(`[data-check] DQS: ${batchDqs.compositeScore}`);

  // Save DQS to learnings history
  if (learnings) {
    learnings.dqsHistory.push(batchDqs);
    // Keep last 50 entries
    if (learnings.dqsHistory.length > 50) {
      learnings.dqsHistory = learnings.dqsHistory.slice(-50);
    }
    // Update verifier coverage
    learnings.verifierCoverage = [
      ...Object.keys(CINEMA_VERIFIERS),
      ...CHAIN_VERIFIERS.map((c) => c.prefix + "*"),
    ];
    saveLearnings(learnings);
  }

  // Update cursor
  const lastFilm = batchFilms[batchFilms.length - 1];
  const newCursor: CursorState = {
    cursorFilmTitle: lastFilm?.title || cursor.cursorFilmTitle,
    cursorFilmId: lastFilm?.id || cursor.cursorFilmId,
    filmsCheckedThisCycle:
      cursor.filmsCheckedThisCycle + batchFilms.length,
    cycleNumber: cursor.cycleNumber,
    batchSize: BATCH_SIZE,
    totalFilms,
    previousSuggestion: cursor.previousSuggestion,
  };

  // Build output
  const output: DataCheckOutput = {
    timestamp: new Date().toISOString(),
    cursor: newCursor,
    stats: {
      filmsOnHomepage: homepageFilms.length,
      filmsBatchChecked: batchFilms.length,
      screeningsExtracted: allScreenings.length,
      bookingChecks: bookingChecks.length,
      issuesFound: issues.length,
      totalFilmsInDb: totalFilms,
    },
    issues,
    bookingChecks,
    scraperHealth,
    staleScreeningsForDeletion,
    cinemaVerifications,
    letterboxdVerifications,
    tmdbRevalidations,
    batchDqs,
    phaseTimings,
    previousSuggestion: cursor.previousSuggestion,
  };

  // Cleanup
  await browser.close();
  await sql.end();

  const elapsed = ((Date.now() - globalStartTime) / 1000).toFixed(1);
  console.error(`[data-check] Done in ${elapsed}s`);

  // Output JSON to stdout
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error("[data-check] Fatal:", err);
  process.exit(1);
});
