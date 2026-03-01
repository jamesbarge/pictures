/**
 * Film Title Cleaner
 *
 * Regex-based title cleaning for the scraper pipeline.
 * Strips event prefixes, BBFC ratings, format notes, and other cruft
 * from raw scraped titles to extract the actual film name.
 *
 * NOTE: These EVENT_PREFIXES are separate from `src/lib/title-extraction/patterns.ts`.
 * The lib module's patterns are used by the AI title extractor for heuristic checks;
 * these patterns are used by the pipeline's own regex-based fallback cleaner.
 * Both serve the same goal (stripping event wrappers) but operate in different contexts.
 */

/**
 * Known event prefixes that should be stripped to find the actual film title.
 * These are screening event names, not part of the film title itself.
 */
export const EVENT_PREFIXES = [
  // Kids/Family events
  /^saturday\s+morning\s+picture\s+club[:\s]+/i,
  /^kids['\s]*club[:\s]+/i,
  /^family\s+film\s+club[:\s]+/i,
  /^family\s+film[:\s]+/i,
  /^toddler\s+time[:\s]+/i,
  /^big\s+scream[:\s]+/i,
  /^baby\s+club[:\s]+/i,

  // Special screenings
  /^uk\s+premiere\s*[:\|I]\s*/i,
  /^world\s+premiere\s*[:\|I]\s*/i,
  /^preview[:\s]+/i,
  /^sneak\s+preview[:\s]+/i,
  /^advance\s+screening[:\s]+/i,
  /^special\s+screening[:\s]+/i,
  /^member['\s]*s?\s+screening[:\s]+/i,

  // Format-based event names
  /^35mm[:\s]+/i,
  /^70mm[:\s]+/i,
  /^70mm\s+imax[:\s]+/i,
  /^imax[:\s]+/i,
  /^4k\s+restoration[:\s]+/i,
  /^restoration[:\s]+/i,
  /^director['\s]*s?\s+cut[:\s]+/i,

  // Season/Series prefixes
  /^cult\s+classic[s]?[:\s]+/i,
  /^classic[s]?[:\s]+/i,
  /^throwback\s+thursday[:\s]+/i,
  /^flashback[:\s]+/i,
  /^film\s+club[:\s]+/i,
  /^cinema\s+club[:\s]+/i,
  /^late\s+night[:\s]+/i,
  /^midnight\s+madness[:\s]+/i,
  /^double\s+bill[:\s]+/i,
  /^double\s+feature[:\s]+/i,
  /^triple\s+bill[:\s]+/i,
  /^marathon[:\s]+/i,
  /^retrospective[:\s]+/i,

  // Q&A and special events
  /^q\s*&\s*a[:\s]+/i,
  /^live\s+q\s*&\s*a[:\s]+/i,
  /^with\s+q\s*&\s*a[:\s]+/i,
  /^intro\s+by[^:]*[:\s]+/i,
  /^introduced\s+by[^:]*[:\s]+/i,

  // Sing-along and interactive
  /^sing[\s-]*a[\s-]*long[\s-]*a?\s+/i,
  /^quote[\s-]*a[\s-]*long[:\s]+/i,
  /^singalong[:\s]+/i,

  // Holiday/Themed events
  /^christmas\s+classic[s]?[:\s]+/i,
  /^holiday\s+film[:\s]+/i,
  /^festive\s+film[:\s]+/i,
  /^galentine['\u2019]?s?\s+day[:\s]+/i,
  /^valentine['\u2019]?s?\s+day[:\s]+/i,

  // Venue-specific curated series
  /^dochouse[:\s]+/i,
  /^pink\s+palace[:\s]+/i,
  /^classic\s+matinee[:\s]+/i,
  /^category\s+h\b[^:]*[:\s]+/i,
  /^seniors['']?\s*paid\s+matinee[:\s]+/i,
  /^dog\s+friendly\s+screening[:\s]+/i,
  /^toddler\s+club[:\s]+/i,
  /^queer\s+horror\s+nights?[:\s]+/i,
  /^varda\s+film\s+club[:\s]+/i,
  /^awards\s+lunch[:\s]+/i,

  // Branded series
  /^bar\s+trash\s+\d+[:\s]+/i,
  /^pitchblack\s+playback[:\s]+/i,
  /^phoenix\s+classics?\s*[-:]\s*/i,
  /^the\s+liberated\s+film\s+club[:\s]+/i,

  // Cultural / themed
  /^s[üu]rreal\s+sinema[:\s]+/i,
  /^never\s+watching\s+movies[:\s]+/i,
  /^drink\s+&?\s*dine[:\s]+/i,
  /^valentine['']?s?\s+throwback[:\s]+/i,

  // Broadcast/RBO/ROH encore screenings
  /^rbo\s+cinema\s+season\b[^:]*[:\s]+/i,
  /^rbo\s+encore[:\s]+/i,
  /^roh\s+encore[:\s]+/i,
  /^encore[:\s]+/i,
  /^rbo[:\s]+/i,
  /^nt\s+live[:\s]+/i,
  /^met\s+opera[:\s]+/i,
];

/**
 * Clean a film title by removing common cruft from scrapers.
 *
 * Strips event prefixes, trailing years, BBFC ratings, format notes,
 * Q&A suffixes, and other non-title text from raw scraped film titles.
 */
export function cleanFilmTitle(title: string): string {
  let cleaned = title
    // Collapse whitespace (including newlines)
    .replace(/\s+/g, " ")
    .trim();

  // Strip known event prefixes to extract actual film title
  for (const prefix of EVENT_PREFIXES) {
    if (prefix.test(cleaned)) {
      cleaned = cleaned.replace(prefix, "").trim();
      // Only strip one prefix (don't want to accidentally remove too much)
      break;
    }
  }

  // Handle remaining colon-separated titles where film is after colon
  // but only if the part before colon looks like an event name (not a film title)
  const colonMatch = cleaned.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch) {
    const beforeColon = colonMatch[1].trim();
    const afterColon = colonMatch[2].trim();

    // Check if before-colon looks like a film series/franchise (keep these intact)
    const isFilmSeries = /^(star\s+wars|indiana\s+jones|harry\s+potter|lord\s+of\s+the\s+rings|mission\s+impossible|pirates\s+of\s+the\s+caribbean|fast\s+(&|and)\s+furious|jurassic\s+(park|world)|the\s+matrix|batman|spider[\s-]?man|x[\s-]?men|avengers|guardians\s+of\s+the\s+galaxy|toy\s+story|shrek|finding\s+(nemo|dory)|the\s+dark\s+knight|alien|terminator|mad\s+max|back\s+to\s+the\s+future|die\s+hard|lethal\s+weapon|home\s+alone|rocky|rambo|the\s+godfather|twin\s+peaks|blade\s+runner|john\s+wick|planet\s+of\s+the\s+apes)/i.test(beforeColon);

    // Check if before-colon is a known event-type word pattern
    const isEventPattern = /^(season|series|part|episode|chapter|vol(ume)?|act|double\s+feature|marathon|retrospective|tribute|celebration|anniversary|special|presents?|screening|showing|feature)/i.test(beforeColon);

    // Check if after-colon looks like a subtitle (short, starts with article/adjective)
    const isSubtitle = /^(the|a|an|new|last|final|return|rise|fall|revenge|attack|empire|phantom|force|rogue|solo)\s/i.test(afterColon);

    // If before colon is a film series or after-colon is a subtitle, keep the full title
    if (isFilmSeries || isSubtitle) {
      // Keep as-is (it's a legitimate film title with subtitle)
    } else if (!isEventPattern) {
      // For other cases, check if it looks like an event name vs film title
      const hasYear = /\b(19|20)\d{2}\b/.test(beforeColon);
      const isVeryShort = beforeColon.split(/\s+/).length <= 3; // 3 words or less
      const afterColonHasYear = /\b(19|20)\d{2}\b/.test(afterColon);

      // Use after-colon if: before is very short event-like name without year
      if (isVeryShort && !hasYear && afterColon.length > 3) {
        cleaned = afterColon;
      } else if (afterColonHasYear) {
        // After-colon has a year, so it's probably the real title
        cleaned = afterColon;
      }
    }
  }

  // Strip trailing year like "(1997)" or "(2026)" — year is used as TMDB hint, not title text
  cleaned = cleaned.replace(/\s*\(\d{4}\)\s*$/, "").trim();

  return cleaned
    // Remove BBFC ratings: (U), (PG), (12), (12A), (15), (18), with optional asterisk
    .replace(/\s*\((U|PG|12A?|15|18)\*?\)\s*$/i, "")
    // Remove bracketed notes like [is a Christmas Movie]
    .replace(/\s*\[.*?\]\s*$/g, "")
    // Remove trailing "- 35mm", "- 70mm" format notes (already captured as format)
    .replace(/\s*-\s*(35mm|70mm|4k|imax)\s*$/i, "")
    // Remove trailing "+ Q&A" (including HTML-encoded &amp;) / "+ pre-recorded intro by ..." / "+ discussion with ..." / "+ Live Music"
    .replace(/\s*\+\s*(q\s*(&amp;|&)\s*a|discussion|intro|live\s+music)\b.*$/i, "")
    // Remove trailing format parentheticals like "(ON VHS)", "(ON 35MM)"
    .replace(/\s*\(on\s+(vhs|35mm|70mm|blu-?ray|dvd|4k)\)\s*$/i, "")
    // Remove "Presented by ..." suffixes
    .replace(/\s+presented\s+by\s+.*$/i, "")
    // Remove "• Nth Anniversary" suffixes
    .replace(/\s*[•·]\s*\d+\w*\s+anniversary\b.*$/i, "")
    // Remove "(Extended Edition)" / "(Extended Cut)" parentheticals
    .replace(/\s*\(extended\s+(edition|cut)\)\s*$/i, "")
    .trim();
}
