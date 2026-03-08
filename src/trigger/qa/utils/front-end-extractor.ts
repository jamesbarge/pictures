/**
 * Front-End Extractor — Playwright DOM extraction from pictures.london
 *
 * Visits the live site, extracts film cards from the homepage and
 * screening details from each film detail page using a 3-worker pool.
 *
 * Used by the QA browse task (Trigger.dev).
 */

import type { Browser, BrowserContext, Page } from "playwright";
import type { FrontEndFilm, FrontEndScreening, BrowseError } from "../types";

// ── Configuration ──────────────────────────────────────────────────

const BASE_URL = "https://pictures.london";
const WORKER_COUNT = 3;
const DELAY_BETWEEN_PAGES_MS = 500;

// ── Worker Pool ────────────────────────────────────────────────────

async function runWorkerPool<T, R>(
  contexts: BrowserContext[],
  tasks: T[],
  worker: (page: Page, task: T, index: number) => Promise<R>,
  label: string,
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
        console.log(
          `[qa-browse] ${label} task ${item.index} failed: ${error instanceof Error ? error.message : error}`,
        );
      }

      completed++;
      if (completed % 10 === 0 || completed === total) {
        console.log(`[qa-browse] ${label}: ${completed}/${total} complete`);
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_PAGES_MS));
    }

    await page.close();
  }

  await Promise.all(contexts.map((ctx) => runWorker(ctx)));
  return results;
}

// ── Homepage Extraction ────────────────────────────────────────────

async function extractFilmsFromHomepage(page: Page): Promise<FrontEndFilm[]> {
  console.log("[qa-browse] Loading homepage...");
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForSelector("article", { timeout: 15_000 });
  // Allow dynamic content to settle
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

      // Title from heading
      const heading = article.querySelector("h3") || article.querySelector("h2");
      const title = heading?.childNodes[0]?.textContent?.trim() || "";

      // Poster image
      const img = article.querySelector("img");
      const posterSrc = img?.getAttribute("src") || null;
      const posterUrl =
        posterSrc && posterSrc.startsWith("http") && !posterSrc.includes("poster-placeholder")
          ? posterSrc
          : null;

      // Screening count from summary text (e.g. "3 showings at ...")
      const summaryEl = article.querySelector("div.flex.flex-wrap span");
      const summaryText = summaryEl?.textContent?.trim() || "";
      const countMatch = summaryText.match(/^(\d+)\s+show/);
      const screeningCount = countMatch ? parseInt(countMatch[1], 10) : 0;

      // Letterboxd rating if visible on card
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

  // Deduplicate by slug (same film can appear on multiple days)
  const seen = new Set<string>();
  const unique: FrontEndFilm[] = [];
  for (const film of films) {
    if (!seen.has(film.slug)) {
      seen.add(film.slug);
      unique.push(film);
    }
  }

  console.log(`[qa-browse] Extracted ${unique.length} unique films from homepage (${films.length} cards total)`);
  return unique;
}

// ── Film Detail Page Extraction ────────────────────────────────────

interface DetailResult {
  screenings: FrontEndScreening[];
  error: BrowseError | null;
}

async function extractScreeningsFromDetail(
  page: Page,
  film: FrontEndFilm,
): Promise<DetailResult> {
  const url = `${BASE_URL}/film/${film.slug}`;

  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });

    if (!response || response.status() >= 400) {
      return {
        screenings: [],
        error: {
          url,
          message: `Film detail returned HTTP ${response?.status() ?? "no response"}: ${film.title}`,
        },
      };
    }

    await page.waitForSelector("h1", { timeout: 10_000 });

    const screenings = await page.evaluate(
      ({ filmSlug, filmTitle }) => {
        const results: Array<{
          filmSlug: string;
          filmTitle: string;
          cinemaName: string;
          cinemaId: string | null;
          datetime: string;
          bookingUrl: string;
          screen: string | null;
          format: string | null;
        }> = [];

        // Strategy 1: Look for JSON-LD structured data
        const jsonLdScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        for (const script of jsonLdScripts) {
          try {
            const data = JSON.parse(script.textContent || "");
            const events = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
            for (const event of events) {
              if (event["@type"] === "ScreeningEvent" || event["@type"] === "Event") {
                results.push({
                  filmSlug,
                  filmTitle: event.name || filmTitle,
                  cinemaName: event.location?.name || "",
                  cinemaId: null,
                  datetime: event.startDate || "",
                  bookingUrl: event.url || event.offers?.url || "",
                  screen: event.location?.containedInPlace?.name || null,
                  format: null,
                });
              }
            }
          } catch {
            // Ignore malformed JSON-LD
          }
        }

        // If JSON-LD gave us results, prefer those
        if (results.length > 0) return results;

        // Strategy 2: Extract from DOM structure
        // Cinema sections are typically headed by h3 elements
        const cinemaHeaders = Array.from(document.querySelectorAll("h3.font-display"));

        for (const header of cinemaHeaders) {
          const cinemaName = header.textContent?.trim() || "";
          // Walk sibling/parent to find screening rows associated with this cinema
          const section = header.closest("section") || header.parentElement;
          if (!section) continue;

          // Look for screening rows — typically contain a time element and a booking link
          const rows = Array.from(section.querySelectorAll("[class*='screening'], tr, li, [data-screening]"));
          // Fallback: look for any elements with <time> tags
          const timeElements = rows.length > 0
            ? rows
            : Array.from(section.querySelectorAll("time")).map((t) => t.closest("div, li, tr") || t.parentElement);

          for (const row of timeElements) {
            if (!row) continue;

            // Extract datetime — prefer <time datetime="..."> attribute
            const timeEl = row.querySelector("time[datetime]");
            let datetime = timeEl?.getAttribute("datetime") || "";

            // Fallback: look for data attributes
            if (!datetime) {
              const dataTime =
                row.getAttribute("data-datetime") ||
                row.getAttribute("data-time") ||
                row.getAttribute("data-start");
              if (dataTime) datetime = dataTime;
            }

            // Fallback: parse displayed time text combined with date context
            if (!datetime && timeEl) {
              datetime = timeEl.textContent?.trim() || "";
            }

            // Skip if we couldn't get any time info
            if (!datetime) continue;

            // Booking URL
            const bookLink = row.querySelector('a[target="_blank"][rel="noopener noreferrer"]')
              || row.querySelector('a[href*="book"]')
              || row.querySelector("a[href^='http']");
            const bookingUrl = bookLink?.getAttribute("href") || "";

            // Screen info
            const screenEl = row.querySelector("[class*='screen'], [data-screen]");
            const screen = screenEl?.textContent?.trim() || null;

            // Format info (IMAX, 35mm, etc.)
            const formatEl = row.querySelector("[class*='format'], [data-format], .badge");
            const format = formatEl?.textContent?.trim() || null;

            results.push({
              filmSlug,
              filmTitle,
              cinemaName,
              cinemaId: null,
              datetime,
              bookingUrl,
              screen,
              format,
            });
          }
        }

        return results;
      },
      { filmSlug: film.slug, filmTitle: film.title },
    );

    return { screenings, error: null };
  } catch (error) {
    return {
      screenings: [],
      error: {
        url,
        message: `Failed to extract screenings for "${film.title}": ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

// ── Public API ─────────────────────────────────────────────────────

export async function extractFrontEndData(
  browser: Browser,
  dates: [string, string],
): Promise<{
  films: FrontEndFilm[];
  screenings: FrontEndScreening[];
  errors: BrowseError[];
}> {
  const errors: BrowseError[] = [];

  console.log(`[qa-browse] Starting front-end extraction for dates ${dates[0]} / ${dates[1]}`);

  // Create worker contexts
  const contexts: BrowserContext[] = [];
  for (let i = 0; i < WORKER_COUNT; i++) {
    contexts.push(
      await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
      }),
    );
  }

  // Phase 1: Extract films from homepage
  const discoveryPage = await contexts[0].newPage();
  let films: FrontEndFilm[] = [];
  try {
    films = await extractFilmsFromHomepage(discoveryPage);
  } catch (error) {
    errors.push({
      url: BASE_URL,
      message: `Homepage extraction failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  } finally {
    await discoveryPage.close();
  }

  if (films.length === 0) {
    console.log("[qa-browse] No films found on homepage, skipping detail extraction");
    await Promise.all(contexts.map((ctx) => ctx.close()));
    return { films, screenings: [], errors };
  }

  // Phase 2: Extract screenings from each film detail page
  console.log(`[qa-browse] Extracting screenings from ${films.length} film detail pages...`);

  const detailResults = await runWorkerPool(
    contexts,
    films,
    async (page, film) => extractScreeningsFromDetail(page, film),
    "Film detail",
  );

  const allScreenings: FrontEndScreening[] = [];
  for (const result of detailResults) {
    allScreenings.push(...result.screenings);
    if (result.error) {
      errors.push(result.error);
    }
  }

  console.log(
    `[qa-browse] Extraction complete: ${films.length} films, ${allScreenings.length} screenings, ${errors.length} errors`,
  );

  // Cleanup
  await Promise.all(contexts.map((ctx) => ctx.close()));

  return { films, screenings: allScreenings, errors };
}

export function checkCompleteness(
  extractedCount: number,
  expectedCount: number,
): { ok: boolean; ratio: number } {
  if (expectedCount === 0) {
    return { ok: extractedCount === 0, ratio: 1 };
  }
  const ratio = extractedCount / expectedCount;
  return { ok: ratio >= 0.7, ratio };
}
