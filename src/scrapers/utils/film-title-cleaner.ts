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
  // NOTE: separator is optional — patrols caught "UK PREMIERE Fuck The Polis"
  // (space-only, no colon/pipe). Accept colon, pipe, or just whitespace.
  // Do NOT include `I` in the char class: with the `/i` flag it case-insensitively
  // matches a leading capital I in the next word ("UK Premiere Iron Man" → "ron
  // Man"), eating the first letter of any I-titled film. The `\s+` after
  // already handles the no-separator case fine.
  /^london\s+premiere\s*[:|]?\s+/i,
  /^uk\s+premiere\s*[:|]?\s+/i,
  /^world\s+premiere\s*[:|]?\s+/i,
  /^european?\s+premiere\s*[:|]?\s+/i,
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

  // Community / cultural screening series
  /^screen\s+cuba\s+presents?[:\s]+/i,
  /^shasha\s+movies?\s+presents?[:\s]+/i,
  /^lafs\s+presents?[:\s]+/i,
  /^lost\s+reels[:\s]+/i,
  /^funeral\s+parade\s+presents?[:\s]+/i,
  /^queer\s+east\s+presents?[:\s]+/i,
  /^girls?\s+in\s+film\s+presents?[:\s]+/i,
  /^east\s+london\s+doc\s+club[:\s]+/i,

  // Event series with distinctive names (found via data-check patrols)
  /^tv\s+party,?\s+tonight!?\s*/i,
  /^woman\s+with\s+a\s+movie\s+camera\s+preview[:\s]+/i,
  /^beyond:\s*/i,
  /^japanese\s+film\s+club[:\s]+/i,
  /^skateboard\s+film\s+club[:\s]+/i,
  /^young\s+filmmakers?\s+club\b[^:]*[:\s]+/i,

  // Seniors screenings
  /^seniors['']?\s*free\s+matinee[:\s]+/i,
  /^seniors['']?\s*paid\s+matinee[:\s]+/i,
  /^seniors['']?\s*matinee[:\s]+/i,

  // Festival / collective presentations
  /^offbeat\s+folk\s+film\s+festival[:\s]+/i,
  /^mostovi\s+film\s+collective\s+presents?[:\s]+/i,
  /^waving\s+kites\b[^:]*presents?[:\s]+/i,
  /^re:?mind\s+film\s+festival\s+presents?[:\s]+/i,

  // Generic "[Org] presents:" pattern — org name + "present(s)" + separator
  // Matches "X Film Club presents:", "X Film Festival present:", etc.
  /^[\w\s&''-]+\s+film\s+(?:club|festival|collective|society)\s+presents?[:\s]+/i,

  // Rio Cinema festival/event strands (specific x/slash patterns before general colon)
  /^rio\s+forever\s*[/x]\s+/i,
  /^rio\s+forever[:\s]+/i,

  // Screening format prefixes (Rio, etc.)
  /^naturist\s+screening[:\s]+/i,

  // Doc'n Roll festival prefix
  /^doc['']?n\s+roll\b[^:]*[:\s]+/i,

  // Recurring event series prefixes (identified by data-check patrol cycles 7-12)
  /^lob-?sters\s+tennis\s+anniversary\s+screening[:\s]+/i,
  /^phoenix\s+classics?\s*\+\s*ysp\s+pizza\s+night[:\s]+/i,
  /^spare\s+ribs\s+club[:\s]+/i,
  /^parents?\s+and\s+bab(?:y|ies)\s+screening[:\s]+/i,
  /^the\s+gate[''\u2019]?s?\s+\d+(?:th|st|nd|rd)?\s+birthday[:\s]+/i,
  /^reece\s+shearsmith\s+presents[:\s]+/i,
  /^bloody\s+mary\s+film\s+club[:\s]+/i,
  /^lrb\s+screen\s*x\s*mubi[:\s]+/i,
  /^ukaff\s+\d{4}\s+closing\s+night[:\s]+/i,
  /^\d+\s+and\s+under[:\s]+/i,

  // Castle Cinema family \u2014 recurring catches across cycles 15-17.
  // Patrol noted these are the largest single source of cinema-prefix
  // duplicates in the entire DB. Patterns confirmed by 6+ merges each.
  /^cine[\s-]?real\s+presents?[:\s]+/i,
  /^club\s+room[:\s]+/i,
  /^camp\s+classics\s+presents?[:\s]+/i,
  /^better\s+than\s+nothing\s+presents?[:\s]+/i,
  /^bar\s+trash[:\s]+/i, // bare "Bar Trash:" (no episode number, separate from "Bar Trash 42:")

  // Generic "<Distributor/Org> Films presents:" \u2014 catches "Alborada Films
  // presents:" and similar. Distinct from the existing "X Film Club/Festival
  // presents:" generic.
  // Tightened per code review:
  // - Requires plural "Films" (singular too generic \u2014 "My Film Presents\u2026")
  // - Requires "presents" with the trailing s (singular "present" too generic)
  // - Does NOT catch bare "X Films:" (no "presents"); those route through the
  //   colon handler instead, which is the correct path for venues like
  //   Coldharbour where the colon form is just venue branding, not a strand.
  /^[\w&''\u2019-][\w\s&''\u2019-]*?\s+films\s+presents[:\s]+/i,
];

/** Result of cleaning a film title with metadata about what was stripped */
interface CleanTitleResult {
  cleanedTitle: string;
  strippedPrefix: string | null;
  strippedSuffix: string | null;
}

/**
 * Clean a film title and return metadata about what was stripped.
 *
 * Returns the cleaned title along with the stripped prefix and suffix,
 * so the pipeline can preserve event context (e.g. in screening.eventDescription).
 */
export function cleanFilmTitleWithMetadata(title: string): CleanTitleResult {
  let cleaned = title
    // Decode common HTML entities (scrapers may pass raw entity strings)
    .replace(/&amp;/g, "&")
    // Decode &Acirc; before fraction entities so mojibake fix can work on the result
    .replace(/&Acirc;/g, "\u00C2")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&frac12;/g, "\u00BD")
    .replace(/&frac14;/g, "\u00BC")
    .replace(/&frac34;/g, "\u00BE")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&mdash;/g, "\u2014")
    // Fix common mojibake: UTF-8 high bytes decoded as Latin-1 produce Â prefix
    .replace(/\u00c2([\u0080-\u00bf])/g, "$1")
    // Collapse whitespace (including newlines)
    .replace(/\s+/g, " ")
    .trim();

  let strippedPrefix: string | null = null;

  // Strip known event prefixes to extract actual film title
  for (const prefix of EVENT_PREFIXES) {
    const match = cleaned.match(prefix);
    if (match) {
      strippedPrefix = match[0].replace(/[:\s]+$/, "").trim();
      cleaned = cleaned.replace(prefix, "").trim();
      break;
    }
  }

  // Strip pagination artifacts from BFI titles (e.g. "The Chronology of Water p17")
  cleaned = cleaned.replace(/\s+p\d{1,3}\s*$/i, "").trim();

  // Strip "on 35mm" / "on 70mm" film format suffixes (PCC/Lost Reels style)
  cleaned = cleaned.replace(/\s+on\s+(35mm|70mm)\s*$/i, "").trim();

  // Strip ": 4K Restoration Premiere" / similar format-noise colon suffixes
  // BEFORE the generic colon handler. The colon handler would otherwise
  // mis-identify "Vampire's Kiss" as the event prefix and "4K Restoration
  // Premiere" as the real title (because "Vampire's Kiss" is 2 words and the
  // after-colon is longer). Strip the noise here so the handler doesn't see it.
  cleaned = cleaned.replace(/\s*:\s*4k\s+restoration\s+premiere\s*$/i, "").trim();

  // Handle remaining colon-separated titles where film is after colon
  // but only if the part before colon looks like an event name (not a film title)
  const colonMatch = cleaned.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch) {
    const beforeColon = colonMatch[1].trim();
    const afterColon = colonMatch[2].trim();

    // Check if before-colon looks like a film series/franchise (keep these intact)
    const isFilmSeries = /^(star\s+wars|indiana\s+jones|harry\s+potter|lord\s+of\s+the\s+rings|mission\s+impossible|pirates\s+of\s+the\s+caribbean|fast\s+(&|and)\s+furious|jurassic\s+(park|world)|the\s+matrix|batman|spider[\s-]?man|x[\s-]?men|avengers|guardians\s+of\s+the\s+galaxy|toy\s+story|shrek|finding\s+(nemo|dory)|the\s+dark\s+knight|alien|terminator|mad\s+max|back\s+to\s+the\s+future|die\s+hard|lethal\s+weapon|home\s+alone|rocky|rambo|the\s+godfather|twin\s+peaks|blade\s+runner|john\s+wick|planet\s+of\s+the\s+apes|dune)/i.test(beforeColon);

    // Check if before-colon is a known event-type word pattern
    const isEventPattern = /^(season|series|part|episode|chapter|vol(ume)?|act|double\s+feature|marathon|retrospective|tribute|celebration|anniversary|special|presents?|screening|showing|feature)/i.test(beforeColon);

    // Check if after-colon looks like a subtitle (short, starts with article/adjective)
    const isSubtitle = /^(the|a|an|new|last|final|return|rise|fall|revenge|attack|empire|phantom|force|rogue|solo|part)\s/i.test(afterColon);

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

  // Capture state before suffix stripping to detect what was removed
  const beforeSuffixStrip = cleaned;

  cleaned = cleaned
    // Remove BBFC ratings: (U), (PG), (12), (12A), (15), (18), with optional asterisk
    .replace(/\s*\((U|PG|12A?|15|18)\*?\)\s*$/i, "")
    // Remove bracketed notes like [is a Christmas Movie]
    .replace(/\s*\[.*?\]\s*$/g, "")
    // Remove trailing "- 35mm", "- 70mm" format notes (already captured as format)
    .replace(/\s*-\s*(35mm|70mm|4k|imax)\s*$/i, "")
    // Remove duration-prefixed event suffixes: "(60 mins) + Panel" — must come before Q&A strip
    .replace(/\s*\(\d+\s*mins?\)\s*\+.*$/i, "")
    // Remove complex event suffixes: "+ Live Recording of PPF Podcast...", "+ Panel hosted by..."
    .replace(/\s*\+\s+[A-Z][\w\s]+(?:Q&A|Recording|Podcast|hosted\s+by).*$/i, "")
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
    // Remove re-release / special edition suffixes: "(2026 Re-release)", "(4K Restoration)", "(2026 Encore)"
    .replace(/\s*\(\d{4}\s+(?:re-?release|restoration|reissue|encore)\)\s*$/i, "")
    // Remove anniversary suffixes: "(25th Anniversary)", "(50th Anniversary, 4K Restoration)",
    // "(25th Anniversary Re-release)", "(25th Anniversary 35mm)", "(50th Anniversary IMAX)".
    // The trailing-noise group now matches any anniversary-adjacent qualifier
    // (restoration/release/re-release/35mm/70mm/imax/4k), not just restoration/re-release.
    .replace(/\s*\(\d+(?:th|st|nd|rd)\s+anniversary(?:[\s,]+(?:4k\s+)?(?:re(?:storation|lease|-release)|35mm|70mm|imax))?\)\s*$/i, "")
    // Remove dash-prefixed anniversary: "- 50th Anniversary", "-50th anniversary" (no space).
    // Patrols caught "Bugsy Malone- 50th anniversary" (space-after-dash) and we
    // also see the no-space variant. \s* before the dash allows zero or more,
    // \s+ after still requires whitespace before the number to avoid matching
    // legitimate hyphenated titles.
    .replace(/\s*-\s*\d+(?:th|st|nd|rd)\s+anniversary\b.*$/i, "")
    // Remove "- Birthday Season" / "- Birthday Seaon" suffix (typo-tolerant).
    // Castle Cinema's "Birthday Season" strand. Caught 10+ times across patrol
    // cycles 16-17 — both "- Birthday Season" and the recurring "Birthday Seaon"
    // misspelling. The `s?` on "Seaso?n" matches both "Season" and "Seaon".
    .replace(/\s*-\s*birthday\s+seas?o?n\s*$/i, "")
    // Remove standalone "(4K Restoration)" without year prefix
    .replace(/\s*\(4k\s+restoration\)\s*$/i, "")
    // Remove premiere suffixes: "(World Premiere)", "(UK Premiere)", "(London Premiere)",
    // including variants with " Premiere" trailing word: "(4K Restoration Premiere)".
    // Patrols caught "Vampire's Kiss (4K Restoration Premiere)" — the colon form
    // is handled BEFORE the colon handler runs (above).
    .replace(/\s*\((?:world|uk|london|european?|4k\s+restoration)\s+premiere\)\s*$/i, "")
    // Remove standalone "(Sing-Along)" suffix (prefix version already handled above)
    .replace(/\s*\(sing[\s-]*a[\s-]*long\)\s*$/i, "")
    // Remove "- Weird Wednesdays" and similar event series suffixes
    .replace(/\s*-\s*weird\s+wednesdays?\s*$/i, "")
    .trim();

  const strippedSuffix = beforeSuffixStrip !== cleaned
    ? beforeSuffixStrip.slice(cleaned.length).trim()
    : null;

  return { cleanedTitle: cleaned, strippedPrefix, strippedSuffix };
}

/**
 * Clean a film title by removing common cruft from scrapers.
 *
 * Backward-compatible wrapper around cleanFilmTitleWithMetadata() that
 * returns just the cleaned title string.
 */
export function cleanFilmTitle(title: string): string {
  return cleanFilmTitleWithMetadata(title).cleanedTitle;
}
