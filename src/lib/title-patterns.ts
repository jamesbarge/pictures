/**
 * Shared Title Extraction Patterns
 *
 * Used by both AI-powered (lib/title-extractor.ts) and regex-based
 * (agents/enrichment/title-extractor.ts) extractors for consistent
 * pattern recognition.
 */

/**
 * Event prefixes that wrap actual film titles (colon-separated)
 * Examples: "Saturday Morning Picture Club: Song of the Sea"
 */
export const EVENT_PREFIXES = [
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

  // Festival screenings
  "LSFF",
  "LFF",
  "BFI Flare",

  // Format-based
  "35mm",
  "70mm",
  "4K",
  "IMAX",
] as const;

/**
 * Regex patterns for event prefixes
 * Used for quick "needs extraction" detection
 */
export const EVENT_PREFIX_PATTERNS = [
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
  /^(classic\s+matinee)[:\s]/i,
  /^(queer|horror|comedy|sci-?fi)\s+(night|horror|film)/i,
  /^(doc\s*'?n'?\s*roll)[:\s]/i,
  /^(lsff|bfi|afi|tiff)[:\s]/i,
  /^(underscore\s+cinema)[:\s!]/i,
  /^(neurospicy|dyke\s+tv)[:\s!]/i,
];

/**
 * Suffixes to strip from titles
 */
export const TITLE_SUFFIXES = [
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

  // Future year markers
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

  // BBFC ratings
  /\s*\((U|PG|12A?|15|18)\*?\)\s*$/i,

  // Bracketed notes
  /\s*\[.*?\]\s*$/g,

  // Format suffixes
  /\s*-\s*(35mm|70mm|4k|imax)\s*$/i,
];

/**
 * Patterns that indicate this is NOT a film
 */
export const NON_FILM_PATTERNS = [
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
];

/**
 * Known franchises where colon is part of the title
 */
export const FRANCHISE_PREFIXES = [
  "star wars",
  "indiana jones",
  "harry potter",
  "lord of the rings",
  "mission impossible",
  "pirates of the caribbean",
  "fast and furious",
  "fast & furious",
  "jurassic",
  "matrix",
  "batman",
  "spider-man",
  "alien",
  "terminator",
  "mad max",
  "back to the future",
  "die hard",
  "lethal weapon",
  "home alone",
  "rocky",
  "rambo",
  "godfather",
  "toy story",
  "finding",
  "avengers",
  "guardians of the galaxy",
  "shrek",
  "dark knight",
];

/**
 * Check if title looks like a clean film title (no event prefixes)
 */
export function isLikelyCleanTitle(title: string): boolean {
  const normalized = title.toLowerCase().trim();

  // Check known event patterns
  for (const pattern of EVENT_PREFIX_PATTERNS) {
    if (pattern.test(normalized)) {
      return false; // Needs extraction
    }
  }

  // Check suffix patterns that indicate event wrapping
  const suffixIndicators = [
    /\+\s*q\s*&?\s*a\s*$/i,
    /with\s+shadow\s+cast/i,
    /\+\s*(discussion|intro|live)/i,
  ];

  for (const pattern of suffixIndicators) {
    if (pattern.test(normalized)) {
      return false;
    }
  }

  // Check for suspicious colon patterns
  if (normalized.includes(":")) {
    const beforeColon = normalized.split(":")[0].trim();
    const words = beforeColon.split(/\s+/);

    // Short prefix before colon - suspicious unless known franchise
    if (words.length <= 2) {
      const isFranchise = FRANCHISE_PREFIXES.some((f) => beforeColon.startsWith(f));
      if (!isFranchise) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Apply basic title cleanup (ratings, format suffixes, etc.)
 */
export function cleanBasicCruft(title: string): string {
  let cleaned = title.replace(/\s+/g, " ").trim();

  for (const pattern of TITLE_SUFFIXES) {
    cleaned = cleaned.replace(pattern, "").trim();
  }

  return cleaned;
}

/**
 * Decode HTML entities in title
 */
export function decodeHtmlEntities(title: string): string {
  return title
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
