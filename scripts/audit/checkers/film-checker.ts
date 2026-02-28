/**
 * Film Checker
 * Tests film cards on the calendar and their detail pages.
 *
 * Checks:
 * - Has a real poster (not placeholder SVG)
 * - Has TMDB data (year, directors, synopsis)
 * - Title is clean (no event prefixes, format suffixes)
 * - Content type is film (not concert, ballet, live broadcast)
 * - Card data matches detail page data
 * - No duplicate film cards on the same day
 */

import type { Page } from "playwright";
import type { AuditIssue, FilmCardData, FilmDetailData } from "../types";

const BASE_URL = "https://pictures.london";

// Patterns from src/lib/title-patterns.ts replicated for audit
const EVENT_PREFIX_PATTERNS = [
  /^(saturday|sunday|weekday)\s+(morning|afternoon)/i,
  /^(kids?|family|toddler|baby)\s*(club|time|film)/i,
  /^(uk|world)\s+premiere/i,
  /^(35|70)mm[:\s]/i,
  /^(imax|4k|restoration)[:\s]/i,
  /^(sing[\s-]?a[\s-]?long|quote[\s-]?a[\s-]?long)[:\s]/i,
  /^(preview|sneak|advance)[:\s]/i,
  /^(special|member'?s?)\s+screening/i,
  /^(double|triple)\s+(feature|bill)/i,
  /^(cult|classic|christmas)\s+(classic|film)/i,
  /^(late\s+night|midnight)/i,
  /^(marathon|retrospective|tribute)[:\s]/i,
  /^(q\s*&\s*a|live\s+q)/i,
  /^(intro(duced)?\s+by|with\s+q)/i,
];

const NON_FILM_PATTERNS = [
  /\bQuiz\b/i,
  /\bReading\s+[Gg]roup\b/i,
  /\bCaf[eé]\s+Philo\b/i,
  /\bCompetition\b/i,
  /\bStory\s+Time\b/i,
  /\bBaby\s+Comptines\b/i,
  /\bLanguage\s+Activity\b/i,
  /\bIn\s+conversation\s+with\b/i,
  /\bCome\s+and\s+Sing\b/i,
  /\bMarathon$/i,
  /\bOrgan\s+Trio\b/i,
  /\bBlues\s+at\b/i,
  /\bFunky\s+Stuff\b/i,
  /\bMusic\s+Video\s+Preservation\b/i,
  /\bComedy:/i,
  /\bClub\s+Room\s+Comedy\b/i,
  /\bVinyl\s+Reggae\b/i,
  /\bVinyl\s+Sisters\b/i,
  /\bAnimated\s+Shorts\s+for\b/i,
  // Live broadcasts / non-film
  /\bMet Opera\b/i,
  /\bNational Theatre Live\b/i,
  /\bNT Live\b/i,
  /\bRoyal Opera\b/i,
  /\bROH Live\b/i,
  /\bRoyal Ballet\b/i,
  /\bBolshoi Ballet\b/i,
  /\bBerliner Philharmoniker\b/i,
  /\bExhibition on Screen\b/i,
];

const KNOWN_PREFIXES = [
  "DRINK & DINE",
  "Drink & Dine",
  "Arabic Cinema Club",
  "Saturday Morning Picture Club",
  "Classic Matinee",
  "Varda Film Club",
  "Sonic Cinema",
  "The Liberated Film Club",
  "Underscore Cinema",
  "Queer Horror Nights",
  "Funeral Parade presents",
  "Doc 'N Roll",
  "Doc N Roll",
];

const SUFFIX_PATTERNS = [
  /\s*\(4K\s+Restoration\)$/i,
  /\s*\(4K\s+Remaster(?:ed)?\)$/i,
  /\s*\(Restored\)$/i,
  /\s*\(Digital\s+Restoration\)$/i,
  /\s*\(Director'?s?\s+Cut\)$/i,
  /\s*\((U|PG|12A?|15|18)\*?\)\s*$/i,
  /\s*\[.*?\]\s*$/,
];

/**
 * Extract all film cards from the calendar page.
 * Scrolls through multiple days to collect cards.
 */
export async function extractFilmCards(page: Page): Promise<FilmCardData[]> {
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });

  // Wait for the calendar to load
  await page.waitForSelector("article", { timeout: 15000 });

  // Give time for all cards to render
  await page.waitForTimeout(2000);

  // Extract film cards from the current view
  const cards = await page.evaluate(() => {
    const results: Array<{
      filmId: string;
      title: string;
      year?: number;
      director?: string;
      screeningCount: number;
      cinemaDisplay: string;
      posterSrc: string;
      isPlaceholder: boolean;
      href: string;
    }> = [];

    const articles = Array.from(document.querySelectorAll("article"));
    for (const article of articles) {
      // Get the link to the film detail page
      const link = article.querySelector('a[href^="/film/"]');
      if (!link) continue;
      const href = link.getAttribute("href") || "";
      const filmId = href.replace("/film/", "");

      // Title from h3
      const h3 = article.querySelector("h3");
      const titleText = h3?.childNodes[0]?.textContent?.trim() || "";

      // Year from the span inside h3
      const yearSpan = h3?.querySelector("span");
      const yearMatch = yearSpan?.textContent?.match(/\((\d{4})\)/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

      // Director from the paragraph below title
      const directorEl = article.querySelector("p.text-\\[10px\\]");
      const director = directorEl?.textContent?.trim() || undefined;

      // Screening summary text
      const summaryEl = article.querySelector("div.flex.flex-wrap span");
      const summaryText = summaryEl?.textContent?.trim() || "";
      const countMatch = summaryText.match(/^(\d+)\s+show/);
      const screeningCount = countMatch ? parseInt(countMatch[1], 10) : 0;

      // Cinema display (after "at")
      const atMatch = summaryText.match(/at\s+(.+)$/);
      const cinemaDisplay = atMatch ? atMatch[1].trim() : "";

      // Poster image
      const img = article.querySelector("img");
      const posterSrc = img?.getAttribute("src") || "";
      const isPlaceholder = posterSrc.includes("poster-placeholder") || !posterSrc.startsWith("http");

      results.push({
        filmId,
        title: titleText,
        year,
        director,
        screeningCount,
        cinemaDisplay,
        posterSrc,
        isPlaceholder,
        href,
      });
    }

    return results;
  });

  return cards;
}

/**
 * Check a film card for data quality issues.
 */
export function checkFilmCard(card: FilmCardData): AuditIssue[] {
  const issues: AuditIssue[] = [];

  // Missing poster
  if (card.isPlaceholder) {
    issues.push({
      severity: "critical",
      category: "missing_poster",
      message: `Film "${card.title}" has no real poster (placeholder shown)`,
      entity: card.title,
      details: { filmId: card.filmId, posterSrc: card.posterSrc },
      url: `${BASE_URL}${card.href}`,
    });
  }

  // Title cleanliness - check for event prefixes
  for (const prefix of KNOWN_PREFIXES) {
    if (card.title.toLowerCase().startsWith(prefix.toLowerCase())) {
      issues.push({
        severity: "warning",
        category: "title_not_clean",
        message: `Film title has event prefix: "${card.title}" (prefix: "${prefix}")`,
        entity: card.title,
        details: { filmId: card.filmId, prefix },
        url: `${BASE_URL}${card.href}`,
      });
      break;
    }
  }

  // Title cleanliness - check regex patterns
  for (const pattern of EVENT_PREFIX_PATTERNS) {
    if (pattern.test(card.title)) {
      issues.push({
        severity: "warning",
        category: "title_not_clean",
        message: `Film title may have event prefix: "${card.title}"`,
        entity: card.title,
        details: { filmId: card.filmId, pattern: pattern.source },
        url: `${BASE_URL}${card.href}`,
      });
      break;
    }
  }

  // Title cleanliness - check for format/rating suffixes
  for (const pattern of SUFFIX_PATTERNS) {
    if (pattern.test(card.title)) {
      issues.push({
        severity: "warning",
        category: "title_not_clean",
        message: `Film title has format/rating suffix: "${card.title}"`,
        entity: card.title,
        details: { filmId: card.filmId, pattern: pattern.source },
        url: `${BASE_URL}${card.href}`,
      });
      break;
    }
  }

  // Non-film content
  for (const pattern of NON_FILM_PATTERNS) {
    if (pattern.test(card.title)) {
      issues.push({
        severity: "critical",
        category: "non_film_content",
        message: `Non-film content in calendar: "${card.title}"`,
        entity: card.title,
        details: { filmId: card.filmId, pattern: pattern.source },
        url: `${BASE_URL}${card.href}`,
      });
      break;
    }
  }

  return issues;
}

/**
 * Visit a film detail page and extract data for comparison + further checks.
 */
export async function checkFilmDetail(
  page: Page,
  card: FilmCardData
): Promise<{ data: FilmDetailData | null; issues: AuditIssue[] }> {
  const issues: AuditIssue[] = [];
  const url = `${BASE_URL}${card.href}`;

  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });

    if (!response || response.status() >= 400) {
      issues.push({
        severity: "critical",
        category: "broken_page",
        message: `Film detail page returned ${response?.status() || "no response"}`,
        entity: card.title,
        details: { filmId: card.filmId, status: response?.status() },
        url,
      });
      return { data: null, issues };
    }

    await page.waitForSelector("h1", { timeout: 10000 });

    const detailData = await page.evaluate(() => {
      // Title from h1
      const h1 = document.querySelector("h1");
      const title = h1?.textContent?.trim() || "";

      // Year — look for the Calendar icon adjacent text
      let year: number | undefined;
      const metaItems = Array.from(document.querySelectorAll(".flex.flex-wrap.items-center span"));
      for (const item of metaItems) {
        const text = item.textContent?.trim() || "";
        const yearMatch = text.match(/^\d{4}$/);
        if (yearMatch) {
          year = parseInt(yearMatch[0], 10);
          break;
        }
      }

      // Directors — "Directed by" followed by names
      const directors: string[] = [];
      const dirDiv = Array.from(document.querySelectorAll("div")).find(
        (d) => d.querySelector("span")?.textContent?.includes("Directed by")
      );
      if (dirDiv) {
        const dirSpan = dirDiv.querySelector("span.text-text-primary");
        if (dirSpan) {
          directors.push(...dirSpan.textContent!.split(",").map((d) => d.trim()));
        }
      }

      // Poster
      const posterContainer = document.querySelector(".w-48, .w-56, [class*='w-48']");
      const posterImg = posterContainer?.querySelector("img") || document.querySelector("img[alt]");
      const posterSrc = posterImg?.getAttribute("src") || "";
      const isPlaceholder = posterSrc.includes("poster-placeholder") || !posterSrc.startsWith("http");

      // Synopsis
      const synopsisEl = document.querySelector("p.text-text-secondary.leading-relaxed");
      const synopsis = synopsisEl?.textContent?.trim() || undefined;

      // TMDB link presence
      const tmdbLink = !!document.querySelector('a[href*="themoviedb.org"]');

      // Letterboxd rating
      let letterboxdRating: number | undefined;
      // The rating is rendered by LetterboxdRatingReveal component
      const ratingEl = document.querySelector('[class*="letterboxd"]');
      if (ratingEl) {
        const ratingText = ratingEl.textContent?.trim() || "";
        const ratingMatch = ratingText.match(/([\d.]+)/);
        if (ratingMatch) letterboxdRating = parseFloat(ratingMatch[1]);
      }

      // Screening count
      const screeningHeader = document.querySelector("h2");
      let screeningCount = 0;
      if (screeningHeader) {
        const countSpan = screeningHeader.querySelector(".font-mono");
        if (countSpan) {
          const match = countSpan.textContent?.match(/(\d+)/);
          if (match) screeningCount = parseInt(match[1], 10);
        }
      }

      // Booking URLs — look for "Book" links
      const bookingUrls: string[] = [];
      const bookLinks = Array.from(document.querySelectorAll('a[target="_blank"][rel="noopener noreferrer"]'));
      for (const link of bookLinks) {
        const text = link.textContent?.trim() || "";
        const href = link.getAttribute("href") || "";
        if (text.includes("Book") && href && !href.includes("pictures.london")) {
          bookingUrls.push(href);
        }
      }

      // Cinema names
      const cinemaNames: string[] = [];
      const cinemaHeaders = Array.from(document.querySelectorAll("h3.font-display"));
      for (const h of cinemaHeaders) {
        const name = h.textContent?.trim();
        if (name) cinemaNames.push(name);
      }

      return {
        title,
        year,
        directors,
        posterSrc,
        isPlaceholder,
        synopsis,
        tmdbLink,
        letterboxdRating,
        screeningCount,
        bookingUrls,
        cinemaNames,
      };
    });

    const data: FilmDetailData = {
      filmId: card.filmId,
      ...detailData,
    };

    // Check for missing TMDB data
    if (!detailData.tmdbLink) {
      issues.push({
        severity: "warning",
        category: "missing_tmdb_data",
        message: `Film "${card.title}" has no TMDB link`,
        entity: card.title,
        details: { filmId: card.filmId },
        url,
      });
    }

    if (!detailData.year) {
      issues.push({
        severity: "warning",
        category: "missing_tmdb_data",
        message: `Film "${card.title}" has no year`,
        entity: card.title,
        details: { filmId: card.filmId },
        url,
      });
    }

    if (detailData.directors.length === 0) {
      issues.push({
        severity: "warning",
        category: "missing_tmdb_data",
        message: `Film "${card.title}" has no directors`,
        entity: card.title,
        details: { filmId: card.filmId },
        url,
      });
    }

    if (!detailData.synopsis) {
      issues.push({
        severity: "warning",
        category: "missing_tmdb_data",
        message: `Film "${card.title}" has no synopsis`,
        entity: card.title,
        details: { filmId: card.filmId },
        url,
      });
    }

    // Card-to-detail comparison
    if (card.title && detailData.title && card.title !== detailData.title) {
      // Might differ because card truncates — only flag if truly different
      if (!detailData.title.startsWith(card.title)) {
        issues.push({
          severity: "warning",
          category: "card_detail_mismatch",
          message: `Title mismatch: card="${card.title}" vs detail="${detailData.title}"`,
          entity: card.title,
          details: { filmId: card.filmId, cardTitle: card.title, detailTitle: detailData.title },
          url,
        });
      }
    }

    // Screening count comparison
    if (card.screeningCount > 0 && detailData.screeningCount > 0) {
      // Card shows count for ONE day, detail shows ALL upcoming — detail should be >= card
      // Only flag if detail is significantly less
      if (detailData.screeningCount < card.screeningCount) {
        issues.push({
          severity: "warning",
          category: "card_detail_mismatch",
          message: `Screening count mismatch for "${card.title}": card=${card.screeningCount} but detail=${detailData.screeningCount}`,
          entity: card.title,
          details: {
            filmId: card.filmId,
            cardCount: card.screeningCount,
            detailCount: detailData.screeningCount,
          },
          url,
        });
      }
    }

    // Poster consistency
    if (card.isPlaceholder !== detailData.isPlaceholder) {
      issues.push({
        severity: "warning",
        category: "card_detail_mismatch",
        message: `Poster mismatch for "${card.title}": card placeholder=${card.isPlaceholder}, detail placeholder=${detailData.isPlaceholder}`,
        entity: card.title,
        details: { filmId: card.filmId },
        url,
      });
    }

    return { data, issues };
  } catch (error) {
    issues.push({
      severity: "critical",
      category: "broken_page",
      message: `Film detail page failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      entity: card.title,
      details: { filmId: card.filmId, error: String(error) },
      url,
    });
    return { data: null, issues };
  }
}

/**
 * Check for duplicate film cards in a set (same film appearing twice).
 */
export function checkDuplicateCards(cards: FilmCardData[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const seen = new Map<string, FilmCardData>();

  for (const card of cards) {
    if (seen.has(card.filmId)) {
      issues.push({
        severity: "warning",
        category: "duplicate_film_card",
        message: `Duplicate film card: "${card.title}" appears multiple times on the same day`,
        entity: card.title,
        details: { filmId: card.filmId },
        url: `${BASE_URL}${card.href}`,
      });
    }
    seen.set(card.filmId, card);
  }

  return issues;
}
