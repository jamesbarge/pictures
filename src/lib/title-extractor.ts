/**
 * AI-Powered Film Title Extractor
 * Uses Claude Haiku to intelligently extract actual film titles from event names
 */

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

interface ExtractionResult {
  filmTitle: string;
  /** Base title for matching/deduplication (without version suffixes like "Final Cut") */
  canonicalTitle: string;
  /** Version/cut if present (e.g., "Final Cut", "Director's Cut") */
  version?: string;
  eventType?: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Version suffix patterns - these indicate different cuts/versions of the same film
 * These should be stripped for canonical title matching but preserved for display
 *
 * Patterns match:
 * - ": Final Cut" / ": The Final Cut"
 * - ": Director's Cut" / ": Directors Cut"
 * - ": Extended Edition" / ": Extended Cut"
 * - " - Director's Cut" (hyphen variant)
 * - ": Redux" / ": Remastered" / ": Restored"
 */
const VERSION_SUFFIX_PATTERNS = [
  // Colon-separated versions (most common at PCC)
  /\s*:\s*(?:The\s+)?Final\s+Cut$/i,
  /\s*:\s*Director'?s?\s+Cut$/i,
  /\s*:\s*Extended\s+(?:Edition|Cut)$/i,
  /\s*:\s*Original\s+(?:Edition|Cut)$/i,
  /\s*:\s*Theatrical\s+(?:Edition|Cut)$/i,
  /\s*:\s*(?:Redux|Remastered|Restored|Re-?release)$/i,
  /\s*:\s*Ultimate\s+(?:Edition|Cut)$/i,
  /\s*:\s*Uncut$/i,
  /\s*:\s*Special\s+Edition$/i,
  // Hyphen-separated versions
  /\s+-\s*(?:The\s+)?Final\s+Cut$/i,
  /\s+-\s*Director'?s?\s+Cut$/i,
  /\s+-\s*Extended\s+(?:Edition|Cut)$/i,
  /\s+-\s*(?:Redux|Remastered|Restored)$/i,
];

/**
 * Extract version suffix from a title
 * Returns the version string if found, null otherwise
 */
function extractVersionSuffix(title: string): { baseTitle: string; version: string } | null {
  for (const pattern of VERSION_SUFFIX_PATTERNS) {
    const match = title.match(pattern);
    if (match) {
      const baseTitle = title.slice(0, match.index).trim();
      // Clean up the version string (remove leading colon/hyphen/spaces)
      const version = match[0].replace(/^[\s:\-]+/, "").trim();
      return { baseTitle, version };
    }
  }
  return null;
}

/**
 * Check if a title has a version suffix that needs canonical extraction
 */
function hasVersionSuffix(title: string): boolean {
  return VERSION_SUFFIX_PATTERNS.some((pattern) => pattern.test(title));
}

/**
 * Extract the actual film title from a screening event name
 *
 * Examples:
 * - "Saturday Morning Picture Club: The Muppets Christmas Carol" → "The Muppets Christmas Carol"
 * - "UK PREMIERE I Only Rest in the Storm" → "Only Rest in the Storm"
 * - "35mm: Casablanca" → "Casablanca"
 * - "Star Wars: A New Hope" → "Star Wars: A New Hope" (kept as-is, it's the real title)
 * - "Apocalypse Now : Final Cut" → filmTitle: "Apocalypse Now : Final Cut", canonicalTitle: "Apocalypse Now"
 */
export async function extractFilmTitle(rawTitle: string): Promise<ExtractionResult> {
  // Quick pass: if it looks like a clean title already, skip the API call
  if (isLikelyCleanTitle(rawTitle)) {
    const displayTitle = cleanBasicCruft(rawTitle);

    // Check for version suffixes (e.g., ": Final Cut")
    // These are clean titles but need canonical extraction for matching
    const versionInfo = extractVersionSuffix(displayTitle);
    if (versionInfo) {
      return {
        filmTitle: displayTitle,
        canonicalTitle: versionInfo.baseTitle,
        version: versionInfo.version,
        confidence: "high",
      };
    }

    return {
      filmTitle: displayTitle,
      canonicalTitle: displayTitle,
      confidence: "high",
    };
  }

  try {
    const response = await getClient().messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Extract film title information from this cinema screening listing.

Listing: "${rawTitle}"

Return ONLY a JSON object (no markdown) with:
- title: The display title (as shown, with version if present)
- canonical: The base film title without version suffixes like "Director's Cut", "Final Cut", "Extended Edition", "Redux", "Restored", "Remastered" (for matching/deduplication)
- version: The version/cut if present (e.g., "Final Cut", "Director's Cut")
- event: Event type if any (e.g., "35mm screening", "Q&A", "kids screening")
- confidence: "high" | "medium" | "low"

IMPORTANT: "canonical" should strip version suffixes but keep legitimate subtitles.
- "Apocalypse Now : Final Cut" → canonical: "Apocalypse Now", version: "Final Cut"
- "Blade Runner : The Final Cut" → canonical: "Blade Runner", version: "The Final Cut"
- "Star Wars: A New Hope" → canonical: "Star Wars: A New Hope" (subtitle, not version)
- "Amadeus: Director's Cut" → canonical: "Amadeus", version: "Director's Cut"

Examples:
- "Saturday Morning Picture Club: The Muppets Christmas Carol" → {"title": "The Muppets Christmas Carol", "canonical": "The Muppets Christmas Carol", "event": "kids screening", "confidence": "high"}
- "Apocalypse Now : Final Cut" → {"title": "Apocalypse Now : Final Cut", "canonical": "Apocalypse Now", "version": "Final Cut", "confidence": "high"}
- "35mm: Casablanca (PG)" → {"title": "Casablanca", "canonical": "Casablanca", "event": "35mm screening", "confidence": "high"}`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse the JSON response
    const parsed = JSON.parse(text.trim());
    const displayTitle = cleanBasicCruft(parsed.title || rawTitle);

    return {
      filmTitle: displayTitle,
      canonicalTitle: parsed.canonical || displayTitle,
      version: parsed.version,
      eventType: parsed.event,
      confidence: parsed.confidence || "medium",
    };
  } catch (error) {
    console.warn(`[TitleExtractor] AI extraction failed for "${rawTitle}":`, error);
    // Fallback to basic cleaning with version extraction
    const displayTitle = cleanBasicCruft(rawTitle);
    const versionInfo = extractVersionSuffix(displayTitle);

    if (versionInfo) {
      return {
        filmTitle: displayTitle,
        canonicalTitle: versionInfo.baseTitle,
        version: versionInfo.version,
        confidence: "low",
      };
    }

    return {
      filmTitle: displayTitle,
      canonicalTitle: displayTitle,
      confidence: "low",
    };
  }
}

/**
 * Batch extract titles (with rate limiting)
 */
export async function batchExtractTitles(
  rawTitles: string[]
): Promise<Map<string, ExtractionResult>> {
  const results = new Map<string, ExtractionResult>();
  const uniqueTitles = [...new Set(rawTitles)];

  // Process titles that need AI extraction
  const needsExtraction: string[] = [];

  for (const title of uniqueTitles) {
    if (isLikelyCleanTitle(title)) {
      const displayTitle = cleanBasicCruft(title);
      // Check for version suffixes
      const versionInfo = extractVersionSuffix(displayTitle);
      if (versionInfo) {
        results.set(title, {
          filmTitle: displayTitle,
          canonicalTitle: versionInfo.baseTitle,
          version: versionInfo.version,
          confidence: "high",
        });
      } else {
        results.set(title, {
          filmTitle: displayTitle,
          canonicalTitle: displayTitle,
          confidence: "high",
        });
      }
    } else {
      needsExtraction.push(title);
    }
  }

  // Batch process with rate limiting (~2 requests/second for Haiku)
  for (let i = 0; i < needsExtraction.length; i++) {
    const title = needsExtraction[i];
    const result = await extractFilmTitle(title);
    results.set(title, result);

    // Rate limit
    if (i < needsExtraction.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Check if a title is likely already clean (no event prefixes)
 */
function isLikelyCleanTitle(title: string): boolean {
  const normalized = title.toLowerCase().trim();

  // Known event prefix patterns
  const eventPatterns = [
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
    // Cinema-specific event series
    /^(classic\s+matinee)[:\s]/i,
    /^(queer|horror|comedy|sci-?fi)\s+(night|horror|film)/i,
    /^(doc\s*'?n'?\s*roll)[:\s]/i,
    /^(lsff|bfi|afi|tiff)[:\s]/i,  // Festival abbreviations
    /^(underscore\s+cinema)[:\s]/i,
    /^(neurospicy|dyke\s+tv)[:\s!]/i,
    // Generic patterns for event titles with suffixes
    /\+\s*q\s*&?\s*a\s*$/i,  // ends with "+ Q&A"
    /with\s+shadow\s+cast/i,  // special screenings with performers
    /\+\s*(discussion|intro|live)/i,  // ends with "+ discussion" etc.
  ];

  for (const pattern of eventPatterns) {
    if (pattern.test(normalized)) {
      return false; // Needs extraction
    }
  }

  // Titles with parenthesized years like "Crash (1997)" should go through extraction
  // so AI can separate the year from the title
  if (/\(\d{4}\)\s*$/.test(title)) {
    return false;
  }

  // ALL CAPS titles often have appended cruft or need normalization
  // e.g., "LITTLE AMELIE" or "THE PHANTOM OF THE OPEN (12A)"
  if (title === title.toUpperCase() && title.length > 3) {
    return false;
  }

  // Very long titles likely have appended event info or descriptions
  if (title.length > 60) {
    return false;
  }

  // Check for version suffixes - these are clean titles that we handle locally
  // e.g., "Apocalypse Now : Final Cut" should be treated as clean
  if (hasVersionSuffix(title)) {
    return true; // Clean, we'll extract the canonical title locally
  }

  // Also check for suspicious colon patterns (but allow film subtitles)
  if (normalized.includes(":")) {
    const beforeColon = normalized.split(":")[0];
    // If before colon is very short (1-2 words) and doesn't look like a franchise
    const words = beforeColon.trim().split(/\s+/);
    if (words.length <= 2 && !/^(star\s+wars|indiana|harry|lord|mission|pirates|fast|jurassic|matrix|batman|spider|alien|terminator|mad|back|die|lethal|home|rocky|rambo|godfather|toy|finding|avengers|guardians|shrek|dark)/i.test(beforeColon)) {
      return false; // Suspicious, needs extraction
    }
  }

  return true; // Looks clean
}

/**
 * Basic title cleanup (BBFC ratings, format suffixes, etc.)
 */
function cleanBasicCruft(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .trim()
    // Remove BBFC ratings
    .replace(/\s*\((U|PG|12A?|15|18)\*?\)\s*$/i, "")
    // Remove bracketed notes
    .replace(/\s*\[.*?\]\s*$/g, "")
    // Remove format suffixes
    .replace(/\s*-\s*(35mm|70mm|4k|imax)\s*$/i, "")
    // Remove Q&A suffixes
    .replace(/\s*\+\s*(q\s*&\s*a|discussion|intro)\s*$/i, "")
    .trim();
}

/**
 * Cache for extracted titles (to avoid repeated API calls)
 */
const titleCache = new Map<string, ExtractionResult>();

/**
 * Extract with caching
 */
export async function extractFilmTitleCached(rawTitle: string): Promise<ExtractionResult> {
  const cached = titleCache.get(rawTitle);
  if (cached) {
    return cached;
  }

  const result = await extractFilmTitle(rawTitle);
  titleCache.set(rawTitle, result);
  return result;
}

/**
 * Clear the title cache
 */
export function clearTitleCache(): void {
  titleCache.clear();
}
