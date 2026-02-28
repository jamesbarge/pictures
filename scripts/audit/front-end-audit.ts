#!/usr/bin/env npx tsx
/**
 * Front-End Audit — Main Orchestrator
 *
 * Launches parallel browser contexts to audit pictures.london production site.
 * Tests cinemas, films, screening data, and booking links.
 *
 * Usage:
 *   npx tsx scripts/audit/front-end-audit.ts
 *
 * Expected runtime: 15-30 minutes depending on film/screening count.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { extractCinemaList, checkCinemaDirectory, checkCinemaDetail } from "./checkers/cinema-checker";
import { extractFilmCards, checkFilmCard, checkFilmDetail, checkDuplicateCards } from "./checkers/film-checker";
import { checkBookingLinks } from "./checkers/booking-checker";
import { extractScreenings, checkScreeningPatterns } from "./checkers/screening-checker";
import { generateObsidianReport, saveJsonResults } from "./report-generator";
import type { AuditIssue, AuditResult, AuditSummary, CinemaDetailData, CinemaListEntry, FilmCardData, FilmDetailData } from "./types";

// ── Configuration ──────────────────────────────────────────────────

const WORKER_COUNT = 10;
const DELAY_BETWEEN_PAGES_MS = 500;
const BASE_URL = "https://pictures.london";
const OBSIDIAN_VAULT = "/Users/jamesbarge/Documents/Obsidian Vault/Pictures";

const today = new Date().toISOString().split("T")[0];
const OBSIDIAN_OUTPUT = `${OBSIDIAN_VAULT}/front-end-audit-${today}.md`;
const JSON_OUTPUT = `scripts/audit/results/audit-${today}.json`;

// ── Helpers ────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function logPhase(phase: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${phase}`);
  console.log(`${"═".repeat(60)}\n`);
}

/**
 * Run tasks across a pool of browser contexts.
 * Each worker pulls the next task when idle.
 */
async function runWorkerPool<T, R>(
  contexts: BrowserContext[],
  tasks: T[],
  worker: (page: Page, task: T, index: number) => Promise<R>,
  label: string
): Promise<R[]> {
  const results: R[] = [];
  const queue = tasks.map((task, index) => ({ task, index }));
  let completed = 0;
  const total = tasks.length;

  async function runWorker(ctx: BrowserContext) {
    const page = await ctx.newPage();

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      try {
        const result = await worker(page, item.task, item.index);
        results.push(result);
      } catch (error) {
        log(`  ⚠ ${label} task ${item.index} failed: ${error instanceof Error ? error.message : error}`);
      }

      completed++;
      if (completed % 10 === 0 || completed === total) {
        log(`  ${label}: ${completed}/${total} complete`);
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_PAGES_MS));
    }

    await page.close();
  }

  await Promise.all(contexts.map((ctx) => runWorker(ctx)));
  return results;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const allIssues: AuditIssue[] = [];

  log("Starting front-end audit of pictures.london");
  log(`Workers: ${WORKER_COUNT}`);
  log(`Output: ${OBSIDIAN_OUTPUT}`);

  // Launch browser
  const browser: Browser = await chromium.launch({ headless: true });
  const contexts: BrowserContext[] = [];
  for (let i = 0; i < WORKER_COUNT; i++) {
    contexts.push(
      await browser.newContext({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
      })
    );
  }

  // Use first context for discovery pages
  const discoveryPage = await contexts[0].newPage();

  // ── Phase 0: Discovery ─────────────────────────────────────────

  logPhase("Phase 0: Discovery");

  log("Extracting cinema list from /cinemas...");
  const cinemaList = await extractCinemaList(discoveryPage);
  log(`  Found ${cinemaList.length} cinemas`);

  log("Extracting film cards from calendar...");
  const filmCards = await extractFilmCards(discoveryPage);
  log(`  Found ${filmCards.length} film cards`);

  await discoveryPage.close();

  // Check for duplicate cards on the main calendar
  const dupCardIssues = checkDuplicateCards(filmCards);
  allIssues.push(...dupCardIssues);
  if (dupCardIssues.length > 0) {
    log(`  Found ${dupCardIssues.length} duplicate film cards`);
  }

  // Check cinema directory for issues
  const directoryIssues = checkCinemaDirectory(cinemaList);
  allIssues.push(...directoryIssues);
  if (directoryIssues.length > 0) {
    log(`  Found ${directoryIssues.length} cinema directory issues`);
  }

  // ── Phase 1: Cinema Audit ──────────────────────────────────────

  logPhase("Phase 1: Cinema Audit");
  log(`Auditing ${cinemaList.length} cinema detail pages...`);

  const cinemaResults = await runWorkerPool(
    contexts,
    cinemaList,
    async (page, cinema) => {
      return checkCinemaDetail(page, cinema);
    },
    "Cinema"
  );

  const cinemaReports: CinemaDetailData[] = [];
  for (const result of cinemaResults) {
    cinemaReports.push(result.data);
    allIssues.push(...result.issues);
  }

  // Also run screening pattern checks on a subset of cinemas
  // (Only cinemas with screenings — we visit their pages again to extract screening-level data)
  const cinemasWithScreenings = cinemaList.filter((c) => c.screeningCount > 0);
  const screeningCheckCinemas = cinemasWithScreenings.slice(0, 30); // Cap to keep runtime reasonable

  log(`Checking screening patterns for ${screeningCheckCinemas.length} cinemas...`);

  const screeningResults = await runWorkerPool(
    contexts,
    screeningCheckCinemas,
    async (page, cinema) => {
      const screenings = await extractScreenings(page, cinema.slug);
      return {
        issues: checkScreeningPatterns(screenings, cinema.name, cinema.slug),
        screeningCount: screenings.length,
      };
    },
    "Screening"
  );

  for (const result of screeningResults) {
    allIssues.push(...result.issues);
  }

  // ── Phase 2: Film Audit ────────────────────────────────────────

  logPhase("Phase 2: Film Audit");

  // First check all cards for data quality
  log("Checking film card data quality...");
  for (const card of filmCards) {
    allIssues.push(...checkFilmCard(card));
  }

  // Then visit detail pages — deduplicate by film ID
  const uniqueFilms = new Map<string, FilmCardData>();
  for (const card of filmCards) {
    if (!uniqueFilms.has(card.filmId)) {
      uniqueFilms.set(card.filmId, card);
    }
  }
  const uniqueFilmCards = Array.from(uniqueFilms.values());
  log(`Auditing ${uniqueFilmCards.length} unique film detail pages...`);

  const allBookingUrls: Array<{ url: string; filmTitle: string; cinemaName: string; cinemaSlug?: string }> = [];
  const filmDetailResults = await runWorkerPool(
    contexts,
    uniqueFilmCards,
    async (page, card) => {
      return checkFilmDetail(page, card);
    },
    "Film"
  );

  let filmsTested = 0;
  for (const result of filmDetailResults) {
    allIssues.push(...result.issues);
    if (result.data) {
      filmsTested++;
      // Collect booking URLs for Phase 3
      for (const url of result.data.bookingUrls) {
        // Try to figure out the cinema slug from the cinema name
        const cinemaName = result.data.cinemaNames[0] || "Unknown";
        allBookingUrls.push({
          url,
          filmTitle: result.data.title,
          cinemaName,
        });
      }
    }
  }

  // Also collect booking URLs from cinema detail pages
  for (const report of cinemaReports) {
    for (const url of report.bookingUrls) {
      allBookingUrls.push({
        url,
        filmTitle: "Various",
        cinemaName: report.name,
        cinemaSlug: report.slug,
      });
    }
  }

  // Deduplicate booking URLs
  const seenUrls = new Set<string>();
  const uniqueBookingUrls = allBookingUrls.filter((item) => {
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);
    return true;
  });

  // ── Phase 3: Booking Link Audit ────────────────────────────────

  logPhase("Phase 3: Booking Link Audit");
  log(`Checking ${uniqueBookingUrls.length} unique booking URLs...`);

  // Use fetch-based checking (no browser needed), but chunk for progress
  const BOOKING_CHUNK_SIZE = 50;
  let bookingChecked = 0;

  for (let i = 0; i < uniqueBookingUrls.length; i += BOOKING_CHUNK_SIZE) {
    const chunk = uniqueBookingUrls.slice(i, i + BOOKING_CHUNK_SIZE);
    const { issues: bookingIssues } = await checkBookingLinks(chunk, 10);
    allIssues.push(...bookingIssues);
    bookingChecked += chunk.length;
    log(`  Booking links: ${bookingChecked}/${uniqueBookingUrls.length} checked`);
  }

  // ── Phase 4: Report Generation ─────────────────────────────────

  logPhase("Phase 4: Report Generation");

  const duration = Date.now() - startTime;

  const summary: AuditSummary = {
    cinemasTotal: cinemaList.length,
    cinemasTested: cinemaReports.length,
    filmsTotal: filmCards.length,
    filmsTested,
    bookingLinksTotal: uniqueBookingUrls.length,
    bookingLinksTested: bookingChecked,
    issuesTotal: allIssues.length,
    issuesCritical: allIssues.filter((i) => i.severity === "critical").length,
    issuesWarning: allIssues.filter((i) => i.severity === "warning").length,
    issuesInfo: allIssues.filter((i) => i.severity === "info").length,
    duration,
  };

  const result: AuditResult = {
    summary,
    issues: allIssues,
    cinemaReports,
    timestamp: new Date().toISOString(),
  };

  log("Generating Obsidian report...");
  generateObsidianReport(result, OBSIDIAN_OUTPUT);
  log(`  Saved to: ${OBSIDIAN_OUTPUT}`);

  log("Saving JSON results...");
  saveJsonResults(result, JSON_OUTPUT);
  log(`  Saved to: ${JSON_OUTPUT}`);

  // ── Summary ────────────────────────────────────────────────────

  logPhase("Audit Complete");
  log(`Duration: ${Math.round(duration / 1000)}s`);
  log(`Cinemas: ${summary.cinemasTested}/${summary.cinemasTotal}`);
  log(`Films: ${summary.filmsTested} tested (${filmCards.length} cards found)`);
  log(`Booking links: ${summary.bookingLinksTested} checked`);
  log(`Issues: ${summary.issuesTotal} total`);
  log(`  Critical: ${summary.issuesCritical}`);
  log(`  Warning: ${summary.issuesWarning}`);
  log(`  Info: ${summary.issuesInfo}`);

  // Cleanup
  await Promise.all(contexts.map((ctx) => ctx.close()));
  await browser.close();

  log("Done!");
}

main().catch((error) => {
  console.error("Audit failed:", error);
  process.exit(1);
});
