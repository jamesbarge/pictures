/**
 * Smart Title Extractor
 *
 * Extracts the underlying film title from event-wrapped screening titles.
 * Handles patterns like:
 *   - "Saturday Morning Picture Club: Song of the Sea" → "Song of the Sea"
 *   - "When Harry Met Sally + Intro" → "When Harry Met Sally"
 *   - "Inland Empire (4K Restoration)" → "Inland Empire"
 */

// Event prefixes that wrap actual film titles (colon-separated)
const EVENT_PREFIXES = [
  // Dining/drinking events
  "DRINK & DINE",
  "Drink & Dine",
  "Drink and Dine",
  "DINE & DRINK",

  // Cinema clubs/series
  "Arabic Cinema Club",
  "Saturday Morning Picture Club",
  "Classic Matinee",
  "Varda Film Club",
  "Artist's Film Picks",
  "Films For Workers",
  "Reclaim the Frame presents",
  "Sonic Cinema",
  "The Liberated Film Club",
  "Underscore Cinema",
  "Dub Me Always",
  "Carers & Babies",
  "Carers and Babies",

  // Special screenings
  "Queer Horror Nights",
  "A FESTIVE FEAST",
  "Funeral Parade presents",
  "UK PREMIERE",

  // Live broadcasts
  "Met Opera Live",
  "Met Opera Encore",
  "National Theatre Live",
  "NT Live",
  "Royal Opera House",
  "ROH Live",
  "Royal Ballet",
  "Bolshoi Ballet",
  "Berliner Philharmoniker Live",

  // Documentaries/exhibitions
  "EXHIBITION ON SCREEN",
  "Exhibition on Screen",
  "Doc 'N Roll",
  "Doc N Roll",

  // Festival screenings (often compilations - flag these)
  "LSFF",
  "LFF",
  "BFI Flare",

  // Format-based
  "35mm",
  "70mm",
  "4K",
  "IMAX",
];

// Suffixes to strip from titles
const TITLE_SUFFIXES = [
  // Q&A and intro
  /\s*\+\s*Q&(?:amp;)?A.*$/i,
  /\s*\+\s*Intro.*$/i,
  /\s*\+\s*Introduction.*$/i,
  /\s*\+\s*Panel.*$/i,
  /\s*\+\s*Discussion.*$/i,
  /\s*with\s+Q&(?:amp;)?A.*$/i,

  // Special events
  /\s*with\s+Shadow\s+Cast.*$/i,
  /\s*with\s+Live\s+.*$/i,
  /\s*\+\s*PJ\s+Party.*$/i,
  /\s*\+\s*Pajama\s+Party.*$/i,

  // Format/restoration markers
  /\s*\(4K\s+Restoration\)$/i,
  /\s*\(4K\s+Remaster(?:ed)?\)$/i,
  /\s*\(4K\s+Re-?release\)$/i,
  /\s*\(Restored\)$/i,
  /\s*\(Digital\s+Restoration\)$/i,
  /\s*\(Director'?s?\s+Cut\)$/i,
  /\s*\(Extended\s+(?:Edition|Cut)\)$/i,
  /\s*\(Original\s+Cut\)$/i,
  /\s*\(Theatrical\s+Cut\)$/i,
  /\s*4K$/i,
  /\s*\(35mm\)$/i,

  // Anniversary editions
  /\s*[-•]\s*\d+(?:th|st|nd|rd)?\s+Anniversary.*$/i,
  /\s*\(\d+(?:th|st|nd|rd)?\s+Anniversary\)$/i,

  // Preview/encore screenings
  /\s*-\s*Preview$/i,
  /\s*\(Preview\)$/i,
  /\s*\(\d{4}\s+Encore\)$/i,
  /\s*Encore$/i,

  // Double bills
  /\s*Double[- ]?Bill$/i,
  /\s*\+\s+.+Double[- ]?Bill$/i,

  // Future year markers (screening year, not release year)
  /\s*\(202[5-9]\)$/,
  /\s*\(203\d\)$/,

  // TBC markers
  /\s*TBC$/i,

  // Sing-along suffix
  /\s+Sing-?A?-?Long!?$/i,

  // Special edition markers
  /:\s*Extended\s+Edition$/i,
  /\s+-\s+Original\s+Cut$/i,

  // Drink add-ons
  /\s*\+\s*(?:Prosecco|Mulled\s+Wine).*$/i,
];

/**
 * Patterns that indicate this is NOT a film (don't try to match)
 */
const NON_FILM_PATTERNS = [
  /\bQuiz\b/i,
  /\bReading\s+[Gg]roup\b/i,
  /\bCafé\s+Philo\b/i,
  /\bCafe\s+Philo\b/i,
  /\bCafés\s+philo\b/i,
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
];

// Pattern for "Presenter presents \"Film Title\""
const PRESENTS_PATTERN = /^.+\s+presents?\s+[""](.+)[""]$/i;

// Pattern for "Sing-A-Long-A Film Title"
const SINGALONG_PATTERN = /^Sing-?A-?Long-?A?\s+(.+)$/i;

// Pattern for extracting from double features
const DOUBLE_FEATURE_PATTERN = /^(.+?)\s*\+\s*.+$/;

export interface TitleExtractionResult {
  originalTitle: string;
  extractedTitle: string;
  isCompilation: boolean;  // True for festival compilations
  isLiveBroadcast: boolean;  // True for NT Live, Met Opera, etc.
  isNonFilm: boolean;  // True for quizzes, reading groups, etc.
  confidence: number;
  extractionMethod: string;
}

/**
 * Extract the underlying film title from an event-wrapped title
 */
export function extractFilmTitle(title: string): TitleExtractionResult {
  const original = title;
  let extracted = title.trim();
  let isCompilation = false;
  let isLiveBroadcast = false;
  const isNonFilm = false;
  let method = "none";
  let confidence = 1.0;

  // Check for non-film events early
  for (const pattern of NON_FILM_PATTERNS) {
    if (pattern.test(extracted)) {
      return {
        originalTitle: original,
        extractedTitle: extracted,
        isCompilation: false,
        isLiveBroadcast: false,
        isNonFilm: true,
        confidence: 0,
        extractionMethod: "non_film_detected",
      };
    }
  }

  // Decode HTML entities
  extracted = extracted
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // Check for "presents" pattern first
  const presentsMatch = extracted.match(PRESENTS_PATTERN);
  if (presentsMatch) {
    extracted = presentsMatch[1];
    method = "presents_pattern";
    confidence = 0.95;
  }

  // Check for sing-a-long pattern
  const singalongMatch = extracted.match(SINGALONG_PATTERN);
  if (singalongMatch) {
    extracted = singalongMatch[1];
    method = "singalong_pattern";
    confidence = 0.9;
  }

  // Check for event prefixes (colon-separated)
  for (const prefix of EVENT_PREFIXES) {
    const prefixPattern = new RegExp(`^${escapeRegex(prefix)}:\\s*`, "i");
    if (prefixPattern.test(extracted)) {
      // Check if this is a festival compilation
      if (["LSFF", "LFF", "BFI Flare"].includes(prefix.toUpperCase())) {
        isCompilation = true;
        confidence = 0.3; // Low confidence - probably not a single film
      }

      // Check if this is a live broadcast
      if (prefix.toLowerCase().includes("opera") ||
          prefix.toLowerCase().includes("theatre") ||
          prefix.toLowerCase().includes("ballet") ||
          prefix.toLowerCase().includes("nt live") ||
          prefix.toLowerCase().includes("roh")) {
        isLiveBroadcast = true;
      }

      extracted = extracted.replace(prefixPattern, "");
      method = method === "none" ? "prefix_removal" : method + "+prefix_removal";
      if (!isCompilation) confidence = Math.min(confidence, 0.9);
      break;
    }
  }

  // Apply suffix removals
  for (const suffixPattern of TITLE_SUFFIXES) {
    if (suffixPattern.test(extracted)) {
      extracted = extracted.replace(suffixPattern, "").trim();
      method = method === "none" ? "suffix_removal" : method + "+suffix_removal";
      confidence = Math.min(confidence, 0.85);
    }
  }

  // Handle double features - extract first film
  // But only if we haven't already processed it
  if (extracted.includes(" + ") && !method.includes("suffix")) {
    const doubleMatch = extracted.match(DOUBLE_FEATURE_PATTERN);
    if (doubleMatch) {
      extracted = doubleMatch[1].trim();
      method = method === "none" ? "double_feature" : method + "+double_feature";
      confidence = Math.min(confidence, 0.7);
    }
  }

  // Clean up any remaining artifacts
  extracted = extracted
    .replace(/\s+/g, " ")  // Normalize whitespace
    .replace(/^["'"']+|["'"']+$/g, "")  // Remove surrounding quotes
    .trim();

  // If we extracted something meaningful
  if (extracted !== original && extracted.length > 0) {
    return {
      originalTitle: original,
      extractedTitle: extracted,
      isCompilation,
      isLiveBroadcast,
      isNonFilm: false,
      confidence,
      extractionMethod: method,
    };
  }

  // No extraction needed - return as-is
  return {
    originalTitle: original,
    extractedTitle: original,
    isCompilation: false,
    isLiveBroadcast: false,
    isNonFilm: false,
    confidence: 1.0,
    extractionMethod: "none",
  };
}

/**
 * Generate alternative search titles for TMDB
 * Returns multiple variations to try
 */
export function generateSearchVariations(title: string): string[] {
  const result = extractFilmTitle(title);
  const variations: string[] = [];

  // Always include extracted title first
  variations.push(result.extractedTitle);

  // If extraction happened, also try original
  if (result.extractedTitle !== result.originalTitle) {
    // Don't add original if it's clearly an event wrapper
    if (result.confidence > 0.5) {
      variations.push(result.originalTitle);
    }
  }

  // Generate additional variations
  const base = result.extractedTitle;

  // Remove year suffix in parentheses: "Film (1954)" → "Film"
  const withoutYear = base.replace(/\s*\(\d{4}\)$/, "");
  if (withoutYear !== base) {
    variations.push(withoutYear);
  }

  // Handle "The" prefix variations
  if (base.startsWith("The ")) {
    variations.push(base.substring(4));
  } else {
    variations.push("The " + base);
  }

  // Handle "A " prefix variations
  if (base.startsWith("A ")) {
    variations.push(base.substring(2));
  }

  // Remove trailing "..." or ellipsis
  const withoutEllipsis = base.replace(/\.{2,}$/, "").replace(/…$/, "");
  if (withoutEllipsis !== base) {
    variations.push(withoutEllipsis);
  }

  // Dedupe and return
  return [...new Set(variations)].filter(v => v.length > 0);
}

// Utility to escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Test the extractor with sample titles
 */
export function testExtractor(): void {
  const testCases = [
    "Saturday Morning Picture Club: Song of the Sea",
    "Queer Horror Nights: THE ROCKY HORROR PICTURE SHOW with Shadow Cast",
    "When Harry Met Sally + Intro",
    "Inland Empire (4K Restoration)",
    "Met Opera Live: Eugene Onegin (2026)",
    "LSFF: Midnight Movies",
    "Funeral Parade presents \"A Star Is Born (1954)\"",
    "Sing-A-Long-A The Greatest Showman",
    "The Gruffalo + The Gruffalo's Child Double-Bill",
    "Classic Matinee: Sunset Boulevard",
    "Charlie's Angels - 25th Anniversary",
    "National Theatre Live: Hamlet (2026)",
    "Aguirre, Wrath of God",
  ];

  console.log("Title Extraction Test Results:\n");
  for (const title of testCases) {
    const result = extractFilmTitle(title);
    console.log(`Original:  "${title}"`);
    console.log(`Extracted: "${result.extractedTitle}"`);
    console.log(`Method:    ${result.extractionMethod}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    if (result.isCompilation) console.log(`  [COMPILATION]`);
    if (result.isLiveBroadcast) console.log(`  [LIVE BROADCAST]`);
    console.log("");
  }
}
