/**
 * Shared Title Extraction Patterns
 *
 * Canonical source for event prefixes, title suffixes, non-film patterns,
 * and special extraction patterns used by both the sync pattern extractor
 * and the async AI extractor.
 */

/**
 * Event prefixes that wrap actual film titles (colon-separated).
 * Used by the pattern extractor to strip prefixes like "35mm: Casablanca" → "Casablanca".
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

  // Festival screenings (often compilations — flag these)
  "LSFF",
  "LFF",
  "BFI Flare",

  // Format-based
  "35mm",
  "70mm",
  "4K",
  "IMAX",
];

/**
 * Event prefix patterns used by the AI extractor's `isLikelyCleanTitle` heuristic.
 * These regex patterns detect titles that need extraction (return false from the clean-title check).
 */
export const EVENT_PREFIX_PATTERNS: RegExp[] = [
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
  /^(lsff|bfi|afi|tiff)[:\s]/i, // Festival abbreviations
  /^(underscore\s+cinema)[:\s]/i,
  /^(neurospicy|dyke\s+tv)[:\s!]/i,
  // Generic patterns for event titles with suffixes
  /\+\s*q\s*&?\s*a\s*$/i, // ends with "+ Q&A"
  /with\s+shadow\s+cast/i, // special screenings with performers
  /\+\s*(discussion|intro|live)/i, // ends with "+ discussion" etc.
];

/**
 * Suffixes to strip from film titles (format markers, Q&A, etc.).
 * Used by the pattern extractor for sync cleanup.
 */
export const TITLE_SUFFIXES: RegExp[] = [
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
 * Version suffix patterns — indicate different cuts/versions of the same film.
 * These should be stripped for canonical title matching but preserved for display.
 */
export const VERSION_SUFFIX_PATTERNS: RegExp[] = [
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
 * Patterns that indicate the screening is NOT a film (quizzes, readings, etc.).
 * When matched, the title should be flagged as non-film and skipped for TMDB matching.
 */
export const NON_FILM_PATTERNS: RegExp[] = [
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

/** Pattern for "Presenter presents "Film Title"" */
export const PRESENTS_PATTERN = /^.+\s+presents?\s+[""\u201C](.+)[""\u201D]$/i;

/** Pattern for "Sing-A-Long-A Film Title" */
export const SINGALONG_PATTERN = /^Sing-?A-?Long-?A?\s+(.+)$/i;

/** Pattern for extracting the first film from double features */
export const DOUBLE_FEATURE_PATTERN = /^(.+?)\s*\+\s*.+$/;

/** Festival prefixes that indicate compilations (low confidence for single-film matching) */
export const FESTIVAL_PREFIXES = ["LSFF", "LFF", "BFI FLARE"];

/** Live broadcast prefixes (NT Live, Met Opera, etc.) */
export const LIVE_BROADCAST_KEYWORDS = ["opera", "theatre", "ballet", "nt live", "roh"];

/** Franchise patterns — titles with colons that are legitimate subtitles, not event prefixes */
export const FRANCHISE_PATTERN =
  /^(star\s+wars|indiana|harry|lord|mission|pirates|fast|jurassic|matrix|batman|spider|alien|terminator|mad|back|die|lethal|home|rocky|rambo|godfather|toy|finding|avengers|guardians|shrek|dark)/i;

/** Escape special regex characters in a string */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
