/**
 * Content Classifier
 *
 * Classifies cinema listings into a content type (film, concert,
 * live_broadcast, event), extracts the clean title and year, and recommends
 * a poster sourcing strategy.
 *
 * Implementation is a deterministic rules engine — heuristics first, with a
 * sane "treat as film, look up via TMDB" default for genuinely ambiguous
 * cases. The previous Gemini-backed AI fallback was rarely producing better
 * answers than this default during local runs (and silently degraded
 * whenever the API key was misconfigured), so the LLM dependency was
 * removed in favour of explicit, auditable rules.
 */

import type { ContentType } from "@/types/film";

/** Strategy for sourcing a poster image: TMDB lookup or scraper-provided URL */
type PosterStrategy = "tmdb" | "scraper_image" | "generate";

/** Output of the content classifier: clean title, type, year, and poster strategy */
interface ClassificationResult {
  cleanTitle: string;
  year: number | null;
  contentType: ContentType;
  posterStrategy: PosterStrategy;
  confidence: "high" | "medium" | "low";
  eventType?: string;
}

/**
 * Quick heuristics that resolve the bulk of titles without further work.
 */
function quickClassify(rawTitle: string): ClassificationResult | null {
  const normalized = rawTitle.toLowerCase().trim();

  // Quick detection of non-film content
  const nonFilmPatterns: Array<{ pattern: RegExp; type: ContentType }> = [
    { pattern: /^(quiz|trivia)\b/i, type: "event" },
    { pattern: /\bquiz\s*night\b/i, type: "event" },
    { pattern: /^café\s+philo/i, type: "event" },
    { pattern: /^cafés?\s+philo/i, type: "event" },
    { pattern: /^come\s+and\s+sing/i, type: "event" },
    { pattern: /^private\s+hire/i, type: "event" },
    { pattern: /^reading\s+group/i, type: "event" },
    { pattern: /^baby\s+comptines/i, type: "event" },
    { pattern: /^mystery\s+movie/i, type: "film" }, // mystery movie nights are still films
    { pattern: /\bmusical\s+bingo\b/i, type: "event" },
    { pattern: /\bcomedy\s+(?:club|night)\b/i, type: "event" },
    { pattern: /\bmember\s+(?:poll|quiz)\b/i, type: "event" },
    { pattern: /\bin\s+conversation\s+with\b/i, type: "event" },
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

  // Live broadcasts: NT Live, Met Opera, Royal Ballet, etc.
  const liveBroadcastPatterns = [
    /^national\s+theatre\s+live[:\s]/i,
    /^nt\s+live[:\s]/i,
    /^met\s+opera\s+(?:live|encore)[:\s]/i,
    /^royal\s+opera\s+house[:\s]/i,
    /^the\s+royal\s+opera[:\s]/i,
    /^roh\s+(?:live|encore|cinema)[:\s]/i,
    /^royal\s+ballet[:\s]/i,
    /^bolshoi\s+ballet[:\s]/i,
    /^rbo\s+(?:cinema\s+season|encore|cinema)[:\s]/i,
    /^berliner\s+philharmoniker/i,
    /^exhibition\s+on\s+screen[:\s]/i,
  ];

  for (const pattern of liveBroadcastPatterns) {
    if (pattern.test(normalized)) {
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

  // Concerts: "X in concert", album-tribute screenings, etc.
  const concertPatterns: ReadonlyArray<RegExp> = [
    /\bin\s+concert\b/i,
    /\b(?:live|concert|tour|performance)\b.*\b(?:anniversary|tribute)\b/i,
    /\b(?:anniversary|tribute)\b.*\b(?:live|concert|tour|performance)\b/i,
  ];

  for (const pattern of concertPatterns) {
    if (pattern.test(normalized)) {
      return {
        cleanTitle: rawTitle.trim(),
        year: null,
        contentType: "concert",
        posterStrategy: "scraper_image",
        confidence: "high",
        eventType: "concert",
      };
    }
  }

  // Otherwise, treat as a film and clean the title.
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

  return null;
}

/**
 * Check whether a title is likely already a clean film title.
 *
 * Returns false when the title contains event prefixes, suspicious colon
 * patterns, or potential concert markers — those need additional cleanup
 * via the fallback path.
 */
function isLikelyCleanFilmTitle(title: string): boolean {
  const normalized = title.toLowerCase().trim();

  const eventPatterns = [
    /^(?:saturday|sunday|weekday)\s+(?:morning|afternoon)/i,
    /^(?:kids?|family|toddler|baby)\s*(?:club|time|film)/i,
    /^(?:uk|world|london)\s+premiere/i,
    /^(?:35|70)mm[:\s]/i,
    /^(?:imax|4k|restoration)[:\s]/i,
    /^(?:sing[\s-]?a[\s-]?long|quote[\s-]?a[\s-]?long)/i,
    /^(?:preview|sneak|advance)[:\s]/i,
    /^(?:special|member'?s?)\s+screening/i,
    /^(?:double|triple)\s+(?:feature|bill)/i,
    /^(?:cult|classic|christmas)\s+(?:classic|film)/i,
    /^(?:late\s+night|midnight)/i,
    /^(?:marathon|retrospective|tribute)[:\s]/i,
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
    /^screen\s+cuba\s+presents?/i,
    /^shasha\s+movies?\s+presents?/i,
    /^lafs\s+presents?/i,
    /^lost\s+reels/i,
    /^funeral\s+parade\s+presents?/i,
    /^queer\s+east\s+presents?/i,
    /^girls?\s+in\s+film\s+presents?/i,
    /^east\s+london\s+doc\s+club/i,
    /\+\s*q\s*&?\s*a\s*$/i,
    /with\s+shadow\s+cast/i,
    /\+\s*(?:discussion|intro|live)/i,
  ];

  for (const pattern of eventPatterns) {
    if (pattern.test(normalized)) return false;
  }

  // Suspicious colon: "X: Y" where X is short and not a known franchise.
  if (normalized.includes(":")) {
    const beforeColon = normalized.split(":")[0].trim();
    const words = beforeColon.split(/\s+/);

    const franchisePatterns =
      /^(?:star\s+wars|indiana\s+jones|harry\s+potter|lord\s+of\s+the\s+rings|mission\s+impossible|pirates|fast|jurassic|matrix|batman|spider|alien|terminator|mad\s+max|back\s+to\s+the\s+future|die\s+hard|toy\s+story|finding|avengers|guardians|shrek|the\s+dark\s+knight)/i;

    if (words.length <= 2 && !franchisePatterns.test(beforeColon)) {
      return false;
    }
  }

  return true;
}

/**
 * Basic title cleanup — strips BBFC ratings, format suffixes, edition
 * markers, and similar low-information cruft.
 */
function cleanBasicCruft(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*\((?:U|PG|12A?|15|18)\*?\)\s*$/i, "") // BBFC ratings
    .replace(/\s*\[.*?\]\s*$/g, "") // Bracketed notes
    .replace(/\s*-\s*(?:35mm|70mm|4k|imax)\s*$/i, "") // Format suffixes
    .replace(/\s*\+\s*(?:q\s*&\s*a|discussion|intro)\s*$/i, "") // Q&A suffixes
    .replace(/\s*4K\s*$/i, "")
    .replace(/\s*\(Extended\s+Cut\)\s*$/i, "")
    .replace(/\s*\(Director'?s?\s+Cut\)\s*$/i, "")
    .trim();
}

/**
 * Strip a leading event prefix ("X presents:", "Y Festival:") so a clean
 * underlying film title remains. Used as the last-ditch path for inputs
 * that fall through every other rule.
 */
function stripLeadingPrefix(rawTitle: string): { title: string; eventType?: string } {
  const colonMatch = rawTitle.match(/^([^:]{2,80}):\s*(.+)$/);
  if (colonMatch) {
    const before = colonMatch[1].trim();
    const after = colonMatch[2].trim();

    // Heuristic: short prefix or "presents/festival/club"-style phrase
    // → strip it and keep the rest as the title.
    const looksLikePresenter =
      /\b(?:presents?|festival|club|series|season|programme)\b/i.test(before) ||
      before.split(/\s+/).length <= 3;

    if (looksLikePresenter && after.length > 2) {
      return { title: after, eventType: before };
    }
  }
  return { title: rawTitle };
}

/**
 * Classify a cinema listing.
 *
 * Async signature preserved for backward compatibility — there are no
 * network calls under the hood now, so the promise resolves synchronously.
 */
export async function classifyContent(rawTitle: string): Promise<ClassificationResult> {
  // Try the deterministic heuristics first.
  const quickResult = quickClassify(rawTitle);
  if (quickResult) return quickResult;

  // Fallback: strip any leading event prefix and treat the rest as a film.
  const yearMatch = rawTitle.match(/\((\d{4})\)\s*$/);
  const stripped = stripLeadingPrefix(
    yearMatch ? rawTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim() : rawTitle
  );

  return {
    cleanTitle: cleanBasicCruft(stripped.title),
    year: yearMatch ? parseInt(yearMatch[1]) : null,
    contentType: "film",
    posterStrategy: "tmdb",
    confidence: "medium",
    eventType: stripped.eventType,
  };
}

/**
 * Cache for classification results.
 */
const classificationCache = new Map<string, ClassificationResult>();

export async function classifyContentCached(
  rawTitle: string
): Promise<ClassificationResult> {
  const cached = classificationCache.get(rawTitle);
  if (cached) return cached;

  const result = await classifyContent(rawTitle);
  classificationCache.set(rawTitle, result);
  return result;
}

export function clearClassificationCache(): void {
  classificationCache.clear();
}
