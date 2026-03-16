/**
 * Booking URL Verification
 *
 * Full page-load verification of booking URLs for the QA cleanup agent.
 * Loads each URL in a real browser, checks HTTP status, and attempts to
 * extract film title / showtime from the landing page.
 */

import { getBrowser, createPage, waitForCloudflare } from "@/scrapers/utils/browser";
import type { Page } from "playwright";
import type { BookingCheck } from "../types";
import { CHROME_USER_AGENT_FULL } from "@/scrapers/constants";

// ── Input types ────────────────────────────────────────────────

export interface BookingUrlToCheck {
  url: string;
  cinemaId: string;
  expectedTitle: string;
  expectedTime: string;
}

// ── Helpers ────────────────────────────────────────────────────

/** Determine whether a URL belongs to a stealth-required cinema. */
function needsStealth(url: string): boolean {
  return (
    url.includes("bfi.org.uk") ||
    url.includes("curzon.com")
  );
}

function isBfi(url: string): boolean {
  return url.includes("bfi.org.uk");
}

/** Try to pull a film title from the page via common selectors / meta. */
async function extractTitle(page: Page): Promise<string | null> {
  try {
    // 1. og:title meta
    const ogTitle = await page
      .locator('meta[property="og:title"]')
      .first()
      .getAttribute("content")
      .catch(() => null);
    if (ogTitle) return ogTitle.trim();

    // 2. First h1 on the page
    const h1 = await page
      .locator("h1")
      .first()
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    if (h1) return h1.trim();

    // 3. <title> tag
    const titleTag = await page.title().catch(() => null);
    if (titleTag) return titleTag.trim();

    return null;
  } catch {
    return null;
  }
}

/** Try to extract a showtime string from the page. */
async function extractTime(page: Page): Promise<string | null> {
  try {
    // Look for common time-related selectors
    const timeEl = await page
      .locator("time")
      .first()
      .getAttribute("datetime")
      .catch(() => null);
    if (timeEl) return timeEl.trim();

    // Fallback: search for HH:MM pattern in visible text
    const body = await page
      .locator("body")
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    if (body) {
      const match = body.match(/\b(\d{1,2}:\d{2})\b/);
      if (match) return match[1];
    }

    return null;
  } catch {
    return null;
  }
}

/** Simple string-similarity score (0-1) comparing detected vs expected title. */
function titleConfidence(detected: string | null, expected: string): number {
  if (!detected) return 0;
  const normalizedDetected = detected.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedExpected = expected.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalizedDetected === normalizedExpected) return 1;
  if (normalizedDetected.includes(normalizedExpected) || normalizedExpected.includes(normalizedDetected)) return 0.8;
  // Rough bigram overlap
  const detectedBigrams = new Set(normalizedDetected.match(/.{2}/g) ?? []);
  const expectedBigrams = new Set(normalizedExpected.match(/.{2}/g) ?? []);
  if (detectedBigrams.size === 0 || expectedBigrams.size === 0) return 0;
  let overlap = 0;
  for (const bigram of detectedBigrams) if (expectedBigrams.has(bigram)) overlap++;
  return overlap / Math.max(detectedBigrams.size, expectedBigrams.size);
}

// ── Single URL check ───────────────────────────────────────────

interface SingleCheckResult {
  status: number | "timeout" | "error";
  detectedTitle: string | null;
  detectedTime: string | null;
  usedStealth: boolean;
}

async function checkSingleUrl(
  entry: BookingUrlToCheck,
  forceStealth: boolean,
): Promise<SingleCheckResult> {
  const useStealth = forceStealth || needsStealth(entry.url);
  let page: Page | null = null;

  try {
    if (useStealth) {
      page = await createPage();
    } else {
      // Standard (non-stealth) page via shared browser
      const browser = await getBrowser();
      const context = await browser.newContext({
        userAgent: CHROME_USER_AGENT_FULL,
        viewport: { width: 1920, height: 1080 },
        locale: "en-GB",
        timezoneId: "Europe/London",
        ignoreHTTPSErrors: true,
      });
      page = await context.newPage();
    }

    const response = await page.goto(entry.url, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    // BFI needs Cloudflare handling after navigation
    if (isBfi(entry.url)) {
      await waitForCloudflare(page, 20);
    }

    const httpStatus = response?.status() ?? 0;

    const detectedTitle = await extractTitle(page);
    const detectedTime = await extractTime(page);

    return {
      status: httpStatus,
      detectedTitle,
      detectedTime,
      usedStealth: useStealth,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Timeout") || msg.includes("timeout")) {
      console.log(`[qa-booking] Timeout loading ${entry.url}`);
      return { status: "timeout", detectedTitle: null, detectedTime: null, usedStealth: useStealth };
    }
    console.log(`[qa-booking] Error loading ${entry.url}: ${msg}`);
    return { status: "error", detectedTitle: null, detectedTime: null, usedStealth: useStealth };
  } finally {
    if (page) {
      try {
        const ctx = page.context();
        await page.close();
        await ctx.close();
      } catch {
        // best-effort cleanup
      }
    }
  }
}


/**
 * Retry failed booking URL checks with stealth escalation and budget constraints.
 * Mutates the results array in place, updating entries at the retry queue indices.
 */
async function retryFailedChecks(
  retryQueue: { index: number; entry: BookingUrlToCheck }[],
  results: BookingCheck[],
  maxRetries: number,
  retryBudgetMs: number,
): Promise<void> {
  const retryCount = Math.min(retryQueue.length, maxRetries);
  console.log(`[qa-booking] Retrying ${retryCount} failed URLs (budget ${retryBudgetMs}ms)`);

  // Wait before retries
  await new Promise((r) => setTimeout(r, 5_000));

  const retryStart = Date.now();

  for (let i = 0; i < retryCount; i++) {
    if (Date.now() - retryStart > retryBudgetMs) {
      console.log(`[qa-booking] Retry budget exhausted after ${i} retries`);
      break;
    }

    const { index, entry } = retryQueue[i];
    const firstUsedStealth = results[index].usedStealth;
    // If first attempt was non-stealth, escalate to stealth on retry
    const forceStealth = !firstUsedStealth;

    console.log(
      `[qa-booking] Retry [${i + 1}/${retryCount}] ${entry.url} (stealth=${forceStealth || needsStealth(entry.url)})`,
    );

    const retryResult = await checkSingleUrl(entry, forceStealth);

    results[index].secondAttemptStatus = retryResult.status;
    results[index].usedStealth = results[index].usedStealth || retryResult.usedStealth;

    // Update detected info if retry succeeded
    if (
      typeof retryResult.status === "number" &&
      retryResult.status < 400 &&
      retryResult.detectedTitle
    ) {
      results[index].detectedFilmTitle = retryResult.detectedTitle;
      results[index].detectedTime = retryResult.detectedTime;
      results[index].confidence = titleConfidence(
        retryResult.detectedTitle,
        entry.expectedTitle,
      );
    }
  }
}

// ── Main export ────────────────────────────────────────────────

/** Verify a batch of cinema booking URLs are reachable and return the expected HTTP status, with retry and rate-limiting. */
export async function checkBookingLinks(params: {
  urls: BookingUrlToCheck[];
  maxChecks?: number;
  retryBudgetMs?: number;
  maxRetries?: number;
}): Promise<BookingCheck[]> {
  const {
    urls,
    maxChecks = 30,
    retryBudgetMs = 180_000,
    maxRetries = 15,
  } = params;

  const toCheck = urls.slice(0, maxChecks);
  console.log(`[qa-booking] Checking ${toCheck.length} booking URLs (max ${maxChecks})`);

  const results: BookingCheck[] = [];
  const retryQueue: { index: number; entry: BookingUrlToCheck }[] = [];

  // ── First pass ───────────────────────────────────────────────
  for (let i = 0; i < toCheck.length; i++) {
    const entry = toCheck[i];
    console.log(`[qa-booking] [${i + 1}/${toCheck.length}] ${entry.url}`);

    const result = await checkSingleUrl(entry, false);

    const shouldRetry =
      result.status === "timeout" ||
      result.status === "error" ||
      (typeof result.status === "number" && result.status >= 400);

    const confidence = titleConfidence(result.detectedTitle, entry.expectedTitle);

    results.push({
      screeningId: "", // resolved during analysis
      url: entry.url,
      cinemaId: entry.cinemaId,
      usedStealth: result.usedStealth,
      firstAttemptStatus: result.status,
      secondAttemptStatus: "not_attempted",
      detectedFilmTitle: result.detectedTitle,
      detectedTime: result.detectedTime,
      confidence,
    });

    if (shouldRetry) {
      retryQueue.push({ index: results.length - 1, entry });
    }
  }


  // ── Retry pass ───────────────────────────────────────────────
  if (retryQueue.length > 0) {
    await retryFailedChecks(retryQueue, results, maxRetries, retryBudgetMs);
  }

  console.log(`[qa-booking] Completed ${results.length} booking checks`);
  return results;
}
