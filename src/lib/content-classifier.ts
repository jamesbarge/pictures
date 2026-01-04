/**
 * AI-Powered Content Classifier
 *
 * Unified service that classifies cinema listings and extracts:
 * - Clean film title (stripped of event prefixes/suffixes)
 * - Content type (film, concert, live_broadcast, event)
 * - Year (extracted from title if present)
 * - Poster strategy (which source to use for images)
 *
 * This replaces the title-extractor with a more comprehensive solution.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ContentType } from "@/types/film";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export type PosterStrategy = "tmdb" | "scraper_image" | "generate";

export interface ClassificationResult {
  /** The clean film/event title, stripped of prefixes and suffixes */
  cleanTitle: string;
  /** Extracted year if found in title (e.g., "Solaris (1972)" -> 1972) */
  year: number | null;
  /** Content type classification */
  contentType: ContentType;
  /** Recommended strategy for finding a poster/image */
  posterStrategy: PosterStrategy;
  /** Confidence level of the classification */
  confidence: "high" | "medium" | "low";
  /** Optional: detected event type for context */
  eventType?: string;
}

/**
 * Quick heuristics to skip AI for obvious cases
 */
function quickClassify(rawTitle: string): ClassificationResult | null {
  const normalized = rawTitle.toLowerCase().trim();

  // Quick detection of non-film content that doesn't need AI
  const nonFilmPatterns = [
    { pattern: /^(quiz|trivia)\b/i, type: "event" as ContentType },
    { pattern: /\bquiz\s*night\b/i, type: "event" as ContentType },
    { pattern: /^café\s+philo/i, type: "event" as ContentType },
    { pattern: /^cafés?\s+philo/i, type: "event" as ContentType },
    { pattern: /^come\s+and\s+sing/i, type: "event" as ContentType },
    { pattern: /^private\s+hire/i, type: "event" as ContentType },
    { pattern: /^reading\s+group/i, type: "event" as ContentType },
    { pattern: /^baby\s+comptines/i, type: "event" as ContentType },
    { pattern: /^mystery\s+movie/i, type: "film" as ContentType }, // This is still a film screening
  ];

  for (const { pattern, type } of nonFilmPatterns) {
    if (pattern.test(normalized)) {
      return {
        cleanTitle: rawTitle.trim(),
        year: null,
        contentType: type,
        posterStrategy: type === "film" ? "tmdb" : "scraper_image",
        confidence: "high",
      };
    }
  }

  // Quick detection of live broadcasts
  const liveBroadcastPatterns = [
    /^national\s+theatre\s+live[:\s]/i,
    /^nt\s+live[:\s]/i,
    /^met\s+opera\s+(live|encore)[:\s]/i,
    /^royal\s+opera\s+house[:\s]/i,
    /^roh\s+live[:\s]/i,
    /^royal\s+ballet[:\s]/i,
    /^bolshoi\s+ballet[:\s]/i,
    /^rbo\s+cinema\s+season/i,
    /^berliner\s+philharmoniker/i,
  ];

  for (const pattern of liveBroadcastPatterns) {
    if (pattern.test(normalized)) {
      // Extract the show name after the prefix
      const match = rawTitle.match(/^[^:]+:\s*(.+)$/);
      const cleanTitle = match ? match[1].trim() : rawTitle;
      const yearMatch = cleanTitle.match(/\((\d{4})\)\s*$/);

      return {
        cleanTitle: yearMatch
          ? cleanTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim()
          : cleanTitle,
        year: yearMatch ? parseInt(yearMatch[1]) : null,
        contentType: "live_broadcast",
        posterStrategy: "scraper_image",
        confidence: "high",
        eventType: "live broadcast",
      };
    }
  }

  // If it looks like a simple, clean title (no colons, no event markers), skip AI
  if (isLikelyCleanFilmTitle(rawTitle)) {
    const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
    const cleanTitle = yearMatch
      ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim()
      : rawTitle;

    return {
      cleanTitle: cleanBasicCruft(cleanTitle),
      year: yearMatch ? parseInt(yearMatch[1]) : null,
      contentType: "film",
      posterStrategy: "tmdb",
      confidence: "high",
    };
  }

  return null; // Needs AI classification
}

/**
 * Check if a title is likely already a clean film title
 * Returns false if AI classification is needed
 */
function isLikelyCleanFilmTitle(title: string): boolean {
  const normalized = title.toLowerCase().trim();

  // Known event prefix patterns that need AI extraction
  const eventPatterns = [
    /^(saturday|sunday|weekday)\s+(morning|afternoon)/i,
    /^(kids?|family|toddler|baby)\s*(club|time|film)/i,
    /^(uk|world|london)\s+premiere/i,
    /^(35|70)mm[:\s]/i,
    /^(imax|4k|restoration)[:\s]/i,
    /^(sing[\s-]?a[\s-]?long|quote[\s-]?a[\s-]?long)/i,
    /^(preview|sneak|advance)[:\s]/i,
    /^(special|member'?s?)\s+screening/i,
    /^(double|triple)\s+(feature|bill)/i,
    /^(cult|classic|christmas)\s+(classic|film)/i,
    /^(late\s+night|midnight)/i,
    /^(marathon|retrospective|tribute)[:\s]/i,
    /^drink\s*[&+]\s*dine/i,
    /^films?\s+for\s+workers/i,
    /^queer\s+horror\s+nights/i,
    /^arabic\s+cinema\s+club/i,
    /^varda\s+film\s+club/i,
    /^sonic\s+cinema/i,
    /^underscore\s+cinema/i,
    /^reclaim\s+the\s+frame/i,
    /^doc\s*'?n'?\s*roll/i,
    /^exhibition\s+on\s+screen/i,
    // Suffix patterns
    /\+\s*q\s*&?\s*a\s*$/i,
    /with\s+shadow\s+cast/i,
    /\+\s*(discussion|intro|live)/i,
  ];

  for (const pattern of eventPatterns) {
    if (pattern.test(normalized)) {
      return false;
    }
  }

  // Patterns that suggest music/concert content - need AI to classify
  const potentialConcertPatterns = [
    /\b(anniversary|tribute)\b/i, // "50th Anniversary" often for concerts
    /[''].*['']/, // Quoted album names like 'Desire'
    /\b(live|concert|tour|performance)\b/i,
    /\b(album|record|vinyl)\b/i,
  ];

  for (const pattern of potentialConcertPatterns) {
    if (pattern.test(normalized)) {
      return false; // Needs AI to determine if film or concert
    }
  }

  // Check for suspicious colon patterns
  if (normalized.includes(":")) {
    const beforeColon = normalized.split(":")[0].trim();
    const words = beforeColon.split(/\s+/);

    // Known film franchises with colons are OK
    const franchisePatterns =
      /^(star\s+wars|indiana\s+jones|harry\s+potter|lord\s+of\s+the\s+rings|mission\s+impossible|pirates|fast|jurassic|matrix|batman|spider|alien|terminator|mad\s+max|back\s+to\s+the\s+future|die\s+hard|toy\s+story|finding|avengers|guardians|shrek|the\s+dark\s+knight)/i;

    if (words.length <= 2 && !franchisePatterns.test(beforeColon)) {
      return false;
    }
  }

  return true;
}

/**
 * Basic cleanup for titles
 */
function cleanBasicCruft(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\((U|PG|12A?|15|18)\*?\)\s*$/i, "") // BBFC ratings
    .replace(/\s*\[.*?\]\s*$/g, "") // Bracketed notes
    .replace(/\s*-\s*(35mm|70mm|4k|imax)\s*$/i, "") // Format suffixes
    .replace(/\s*\+\s*(q\s*&\s*a|discussion|intro)\s*$/i, "") // Q&A suffixes
    .replace(/\s*4K\s*$/i, "") // Trailing 4K
    .replace(/\s*\(Extended\s+Cut\)\s*$/i, "") // Extended cut
    .replace(/\s*\(Director'?s?\s+Cut\)\s*$/i, "") // Director's cut
    .trim();
}

/**
 * Classify a cinema listing using AI
 */
export async function classifyContent(
  rawTitle: string
): Promise<ClassificationResult> {
  // Try quick heuristics first
  const quickResult = quickClassify(rawTitle);
  if (quickResult) {
    return quickResult;
  }

  try {
    const response = await getClient().messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Classify this cinema listing and extract the actual content title.

Listing: "${rawTitle}"

Respond with ONLY a JSON object (no markdown):
{
  "title": "The clean title without event prefixes/suffixes",
  "year": null or the year if in the title (e.g., "Solaris (1972)" -> 1972),
  "type": "film" | "concert" | "live_broadcast" | "event",
  "poster": "tmdb" | "scraper_image",
  "confidence": "high" | "medium" | "low",
  "event": "optional event type description"
}

Classification guide:
- film: Traditional movies (use tmdb for poster)
- concert: Music performances, album screenings, artist tributes (use scraper_image)
- live_broadcast: NT Live, Met Opera, ballet broadcasts (use scraper_image)
- event: Quiz nights, discussions, non-screening events (use scraper_image)

Examples:
- "DRINK & DINE: Bohemian Rhapsody Sing-Along" -> {"title":"Bohemian Rhapsody","year":null,"type":"film","poster":"tmdb","confidence":"high","event":"sing-along"}
- "Bob Dylan 'Desire' (50th Anniversary)" -> {"title":"Bob Dylan 'Desire' (50th Anniversary)","year":null,"type":"concert","poster":"scraper_image","confidence":"high"}
- "NT Live: Hamlet (2026)" -> {"title":"Hamlet","year":2026,"type":"live_broadcast","poster":"scraper_image","confidence":"high"}
- "Solaris (1972)" -> {"title":"Solaris","year":1972,"type":"film","poster":"tmdb","confidence":"high"}
- "The Killer (1989)" -> {"title":"The Killer","year":1989,"type":"film","poster":"tmdb","confidence":"high"}
- "Films For Workers: Killer of Sheep" -> {"title":"Killer of Sheep","year":null,"type":"film","poster":"tmdb","confidence":"high","event":"film club"}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text.trim());

    return {
      cleanTitle: cleanBasicCruft(parsed.title || rawTitle),
      year: parsed.year || null,
      contentType: parsed.type || "film",
      posterStrategy: parsed.poster || "tmdb",
      confidence: parsed.confidence || "medium",
      eventType: parsed.event,
    };
  } catch (error) {
    console.warn(
      `[ContentClassifier] AI classification failed for "${rawTitle}":`,
      error
    );

    // Fallback: assume it's a film and clean up the title
    const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
    return {
      cleanTitle: cleanBasicCruft(
        yearMatch ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, "") : rawTitle
      ),
      year: yearMatch ? parseInt(yearMatch[1]) : null,
      contentType: "film",
      posterStrategy: "tmdb",
      confidence: "low",
    };
  }
}

/**
 * Cache for classification results
 */
const classificationCache = new Map<string, ClassificationResult>();

/**
 * Classify with caching
 */
export async function classifyContentCached(
  rawTitle: string
): Promise<ClassificationResult> {
  const cached = classificationCache.get(rawTitle);
  if (cached) {
    return cached;
  }

  const result = await classifyContent(rawTitle);
  classificationCache.set(rawTitle, result);
  return result;
}

/**
 * Batch classify multiple titles
 */
export async function batchClassifyContent(
  rawTitles: string[]
): Promise<Map<string, ClassificationResult>> {
  const results = new Map<string, ClassificationResult>();
  const uniqueTitles = [...new Set(rawTitles)];

  // First pass: use quick heuristics and cache
  const needsAI: string[] = [];

  for (const title of uniqueTitles) {
    // Check cache first
    const cached = classificationCache.get(title);
    if (cached) {
      results.set(title, cached);
      continue;
    }

    // Try quick classification
    const quick = quickClassify(title);
    if (quick) {
      results.set(title, quick);
      classificationCache.set(title, quick);
    } else {
      needsAI.push(title);
    }
  }

  // Second pass: AI classification with rate limiting
  for (let i = 0; i < needsAI.length; i++) {
    const title = needsAI[i];
    const result = await classifyContent(title);
    results.set(title, result);
    classificationCache.set(title, result);

    // Rate limit (~2 requests/second)
    if (i < needsAI.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Clear the classification cache
 */
export function clearClassificationCache(): void {
  classificationCache.clear();
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats(): { size: number; hits: number } {
  return {
    size: classificationCache.size,
    hits: 0, // Would need to track this separately
  };
}
