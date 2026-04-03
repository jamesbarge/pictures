/**
 * AI-Powered Booking Link Verifier
 *
 * Uses Stagehand (Playwright + LLM) to verify booking URLs actually
 * show the expected film. Goes beyond HTTP status codes — loads each
 * page in a real browser, uses AI to extract structured content, and
 * fuzzy-matches against expected film title.
 *
 * Handles diverse cinema SPAs (Curzon, BFI, Picturehouse) that return
 * HTTP 200 for broken pages.
 */

import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import * as z3 from "zod/v3";

// ── Types ────────────────────────────────────────────────────────

export interface BookingVerification {
  url: string;
  expectedTitle: string;
  cinemaId: string;
  verdict: BookingVerdict;
  extractedTitle: string | null;
  extractedDate: string | null;
  extractedTime: string | null;
  extractedVenue: string | null;
  isErrorPage: boolean;
  isBookingPage: boolean;
  confidence: number;
  durationMs: number;
}

export type BookingVerdict =
  | "verified"
  | "wrong_film"
  | "error_page"
  | "not_booking_page"
  | "load_failed"
  | "extract_failed";

// ── Zod schema for AI extraction ─────────────────────────────────

// Use Zod v3 for Stagehand schema compatibility (Stagehand's JSON schema
// converter requires Zod v3's toJSONSchema which isn't available in Zod v4)
const BookingPageSchema = z3.object({
  filmTitle: z3
    .string()
    .nullable()
    .describe("The main film or event title shown on this page"),
  showDate: z3
    .string()
    .nullable()
    .describe("Any screening date shown (e.g. '15 April 2026')"),
  showTime: z3
    .string()
    .nullable()
    .describe("Any screening time shown (e.g. '19:30')"),
  isErrorPage: z3
    .boolean()
    .describe(
      "True if the page shows an error, 'not found', 'unavailable', 'sold out', or similar error state"
    ),
  isBookingPage: z3
    .boolean()
    .describe(
      "True if this looks like a cinema booking, ticketing, or film detail page"
    ),
  venue: z3
    .string()
    .nullable()
    .describe("The cinema or venue name if visible on the page"),
});

// ── Title matching ───────────────────────────────────────────────

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    // Decompose accented characters and strip diacritical marks
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Strip common suffixes that don't affect identity
    .replace(/\(\d+th\s+anniversary[^)]*\)/gi, "")
    .replace(/\(cert\.\d+\)/gi, "")
    .replace(/\(\d+\)/gi, "")
    .replace(/\bre-?release\b/gi, "")
    .replace(/\bthrowback:\s*/gi, "")
    // Strip non-alphanumeric except spaces
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleConfidence(extracted: string | null, expected: string): number {
  if (!extracted) return 0;
  const a = normalizeForMatch(extracted);
  const b = normalizeForMatch(expected);
  if (!a || !b) return 0;

  // Exact match
  if (a === b) return 1.0;

  // Substring containment
  if (a.includes(b) || b.includes(a)) return 0.85;

  // Bigram overlap
  const bigramsA = new Set((a.match(/.{2}/g) ?? []));
  const bigramsB = new Set((b.match(/.{2}/g) ?? []));
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;
  let overlap = 0;
  for (const bg of bigramsA) if (bigramsB.has(bg)) overlap++;
  return overlap / Math.max(bigramsA.size, bigramsB.size);
}

// ── Main verifier ────────────────────────────────────────────────

/**
 * Verify a batch of booking URLs using Stagehand AI extraction.
 *
 * Initializes a single browser, reuses the page across checks,
 * and uses Gemini Flash for cheap, fast content extraction.
 */
export async function verifyBookingLinks(params: {
  urls: Array<{
    url: string;
    expectedTitle: string;
    cinemaId: string;
  }>;
  maxChecks?: number;
  model?: string;
}): Promise<BookingVerification[]> {
  const { urls, maxChecks = 40, model = "google/gemini-2.0-flash" } = params;
  const toCheck = urls.slice(0, maxChecks);

  if (toCheck.length === 0) return [];

  console.error(
    `[booking-verifier] Verifying ${toCheck.length} URLs with Stagehand (${model})`
  );

  let stagehand: Stagehand | null = null;
  const results: BookingVerification[] = [];

  try {
    stagehand = new Stagehand({
      env: "LOCAL",
      model,
      verbose: 0,
      localBrowserLaunchOptions: { headless: true },
    });
    await stagehand.init();
    const page = stagehand.context.pages()[0];

    for (let i = 0; i < toCheck.length; i++) {
      const { url, expectedTitle, cinemaId } = toCheck[i];
      const start = Date.now();

      console.error(
        `[booking-verifier] [${i + 1}/${toCheck.length}] ${cinemaId}: ${expectedTitle}`
      );

      try {
        // Navigate to the booking URL
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeoutMs: 20_000,
        });

        // Give SPA time to render
        await page.waitForTimeout(2000);

        // AI extraction — Stagehand v3: extract<T>(instruction, schema)
         
        const extracted = (await stagehand.extract(
          "Extract the film/event details from this cinema booking or film detail page. If the page shows an error or 'unavailable' message, mark isErrorPage as true.",
          BookingPageSchema as any,
        )) as z3.infer<typeof BookingPageSchema>;

        const confidence = titleConfidence(
          extracted.filmTitle,
          expectedTitle
        );

        // Determine verdict
        let verdict: BookingVerdict;
        if (extracted.isErrorPage) {
          verdict = "error_page";
        } else if (!extracted.isBookingPage) {
          verdict = "not_booking_page";
        } else if (confidence < 0.4) {
          verdict = "wrong_film";
        } else {
          verdict = "verified";
        }

        results.push({
          url,
          expectedTitle,
          cinemaId,
          verdict,
          extractedTitle: extracted.filmTitle,
          extractedDate: extracted.showDate,
          extractedTime: extracted.showTime,
          extractedVenue: extracted.venue,
          isErrorPage: extracted.isErrorPage,
          isBookingPage: extracted.isBookingPage,
          confidence,
          durationMs: Date.now() - start,
        });

        const icon =
          verdict === "verified"
            ? "✓"
            : verdict === "error_page"
              ? "✗"
              : "⚠";
        console.error(
          `[booking-verifier]   ${icon} ${verdict} (${(confidence * 100).toFixed(0)}%) extracted="${extracted.filmTitle}" expected="${expectedTitle}"`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout =
          msg.includes("Timeout") || msg.includes("timeout");
        const verdict: BookingVerdict = isTimeout
          ? "load_failed"
          : "extract_failed";

        console.error(
          `[booking-verifier]   ✗ ${verdict}: ${msg.slice(0, 80)}`
        );

        results.push({
          url,
          expectedTitle,
          cinemaId,
          verdict,
          extractedTitle: null,
          extractedDate: null,
          extractedTime: null,
          extractedVenue: null,
          isErrorPage: false,
          isBookingPage: false,
          confidence: 0,
          durationMs: Date.now() - start,
        });
      }
    }
  } finally {
    if (stagehand) {
      try {
        await stagehand.close();
      } catch {
        // best-effort cleanup
      }
    }
  }

  // Summary
  const verified = results.filter((r) => r.verdict === "verified").length;
  const errors = results.filter((r) => r.verdict === "error_page").length;
  const wrongFilm = results.filter((r) => r.verdict === "wrong_film").length;
  const failed = results.filter(
    (r) => r.verdict === "load_failed" || r.verdict === "extract_failed"
  ).length;

  console.error(
    `[booking-verifier] Done: ${verified} verified, ${errors} error pages, ${wrongFilm} wrong film, ${failed} failed`
  );

  return results;
}
