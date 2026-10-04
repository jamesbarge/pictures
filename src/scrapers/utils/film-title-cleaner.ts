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
 * The exception is the small reviewed set both paths share:
 * `REVIEWED_WRAPPER_PREFIXES` and `TERMINAL_DECORATION_SUFFIXES`.
 *
 * Contract difference from `extractFilmTitleSync`: this cleaner moves a trailing
 * release year such as "(1954)" into `extractedYear`, while the sync extractor
 * keeps it in the title.
 *
 * Two of the strip lists are extended at module init from `.claude/data-check-learnings.json`
 * (gitignored — only present in dev). `/data-check` writes recurring patrol fixes there;
 * loading them here closes the feedback loop so scrapes apply the same patterns at
 * write time instead of letting bad titles enter the DB and rely on patrol to fix.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  decodeHtmlEntities,
  REVIEWED_WRAPPER_PREFIXES,
  stripTerminalDecorations,
  unwrapQuotedTitle,
} from "@/lib/title-patterns";

// ---------- Learnings loader (declared FIRST so it's available at the module
// init of EVENT_PREFIXES below) -------------------------------------------------

interface KnownNonFilm {
  /** Literal title to match (case-insensitive when `exact: true`). */
  title?: string;
  /** Discriminator: when true, treat `pattern` as a regex source string. */
  regex?: boolean;
  /** Regex source string (used when `regex: true`). Compiled with case-insensitive flag. */
  pattern?: string;
  /** When true, match `title` exactly (case-insensitive). */
  exact?: boolean;
  /** Content type to assign on match. Defaults to "event". */
  type?: KnownNonFilmContentType | string;
}

export type KnownNonFilmContentType = "concert" | "event" | "live_broadcast";

interface Learnings {
  prefixesToStrip?: string[];
  suffixesToStrip?: string[];
  knownNonFilmTitles?: KnownNonFilm[];
}

let learningsCache: Learnings | null | undefined = undefined;

function loadLearnings(): Learnings | null {
  if (learningsCache !== undefined) return learningsCache;
  try {
    // Use cwd-relative resolution so this works under both raw tsx (`/scrape`)
    // AND the Next.js server bundle path (the route at /api/admin/scrape/all
    // transitively imports this module). `__dirname` would point at the
    // compiled output dir under `.next/server/...` and the file wouldn't be
    // found — silent fallback to "no learnings" was masking a real prod
    // failure mode. See code-review feedback.
    const path = resolve(process.cwd(), ".claude/data-check-learnings.json");
    if (!existsSync(path)) {
      learningsCache = null;
      return null;
    }
    const raw = readFileSync(path, "utf-8");
    learningsCache = JSON.parse(raw) as Learnings;
    return learningsCache;
  } catch {
    learningsCache = null;
    return null;
  }
}

/**
 * Escape a literal prefix string for use as the body of a regex.
 *
 * The patrol's `prefixesToStrip` entries are literal substrings like
 * "Funeral Parade presents " or "Film Club: " — they end in either whitespace
 * or a colon-and-space. We anchor at start (`^`) and accept any trailing
 * combination of `:|\s` after the literal body to match the existing
 * EVENT_PREFIXES contract.
 */
function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadLearnedPrefixRegexes(): RegExp[] {
  const data = loadLearnings();
  if (!data?.prefixesToStrip?.length) return [];
  return data.prefixesToStrip.map((raw) => {
    const body = raw.replace(/[\s:]+$/u, "");
    return new RegExp(`^${escapeRegexLiteral(body)}\\s*[:|]?\\s+`, "i");
  });
}

function loadLearnedSuffixRegexes(): RegExp[] {
  const data = loadLearnings();
  if (!data?.suffixesToStrip?.length) return [];
  return data.suffixesToStrip.map((raw) => {
    const body = raw.replace(/^\s+/u, "");
    return new RegExp(`\\s*${escapeRegexLiteral(body)}\\s*$`, "i");
  });
}

/**
 * Known event prefixes that should be stripped to find the actual film title.
 * These are screening event names, not part of the film title itself.
 */
export const EVENT_PREFIXES = [
  // Reviewed wrappers shared with the sync extractor (relaxed and senior
  // community screenings, Cine-Real, LAFS, Funeral Parade)
  ...REVIEWED_WRAPPER_PREFIXES,

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
  // Glued form with no space at all: "UK PREMIEREThe Night is Fading Away".
  // Case-sensitive, and the next word must start upper-then-lower, so
  // "UK PREMIERES: …" keeps its S.
  /^(?:UK|LONDON|WORLD|EUROPEAN?)\s+PREMIERE(?=[A-Z][a-z])/,
  // "Special Preview of Fatherland with Katja Hoyer". Ahead of the bare
  // "Preview" rule, which would leave "of Fatherland". The guest credit is
  // dropped after the loop, only for titles this rule matched. No "A Preview
  // of" form: after "MilkTea Presents:" it would only strip on a second clean.
  /^(?:special\s+)?preview\s+of\s+/i,
  /^preview[:\s]+/i,
  /^sneak\s+preview[:\s]+/i,
  /^advance\s+screening[:\s]+/i,
  /^special\s+screening[:\s]+/i,
  /^member(?:s['’]?|['’]s)?\s+screening[:\s]+/i,
  // Festival gala slots. The colon is required, so Cassavetes' bare
  // "Opening Night" stays a title.
  /^(?:opening|closing)\s+night(?:\s+gala)?\s*:\s*/i,
  /^centrepiece\s+gala\s*:\s*/i,
  /^screening\s+[-–]\s+/i,

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
  // Optional season code in the same match, as for Met Opera below:
  // "RBO Encore 2026-27: Manon"
  /^rbo\s+encore(?:\s+20\d{2}[-–/]\d{2})?[:\s]+/i,
  /^roh\s+encore(?:\s+20\d{2}[-–/]\d{2})?[:\s]+/i,
  /^encore[:\s]+/i,
  /^rbo[:\s]+/i,
  /^nt\s+live[:\s]+/i,
  // "Met Opera: Tosca" and "Met Opera 2026-27: Tosca". The season code must go
  // in the same match, or the colon handler keeps "2026-27" as the title.
  /^met\s+opera(?:\s+live)?(?:\s+20\d{2}[-–/]\d{2})?[:\s]+/i,
  // The season code on its own, where the venue dropped the company name:
  // "2026-27: Tosca", "Live 2026-27: Gotterdammerung", and the venue's own
  // "2026-26" typo. The dash-year form leaves "2001: A Space Odyssey" alone.
  /^(?:live\s+)?20\d{2}[-–/]\d{2}\s*:\s*/i,

  // Community / cultural screening series
  /^screen\s+cuba\s+presents?[:\s]+/i,
  /^shasha\s+movies?\s+presents?[:\s]+/i,
  /^lost\s+reels[:\s]+/i,
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
  // Festival programme tags: the acronym, an optional year and an optional
  // strand name, then a colon or a spaced dash ("LPFF 2026 Short Session: …",
  // "UKJFF: …", "FFFL Opening Gala - …"). Case-sensitive so ordinary words
  // never match.
  /^(?:LPFF|UKJFF|HKFF|LIFF|FFFL|LoLaFF)(?:\s+\d{4})?(?:\s+[^:]{1,30}?)?(?:\s*:|\s+[-–])\s+/,
  /^london\s+palestine\s+film\s+festival(?:\s+\d{4})?\s*:\s*/i,
  /^london\s+breeze\s+film\s+festival(?:\s+shorts)?\s*:\s*/i,
  /^sheffield\s+docfest(?:\s+spotlights?)?\s*:\s*/i,
  /^hackney\s+children['’]?s\s+film\s+fest(?:ival)?\s*:\s*/i,

  // Venue strands found in the 2026-10-04 coverage pass. Most are followed by
  // a title starting "The", which the colon handler keeps as a subtitle.
  /^black\s+history\s+month(?:\s+\d{4})?\s*:\s*/i,
  /^classroom\s+cinema\s*:\s*/i,
  /^babykino\s*:\s*/i,
  /^odyssey\s+\d{4}\s*:\s*/i,
  /^crafty\s+movie\s+night\s*[-–:]\s*/i,
  /^girl,?\s+so\s+cinema\s+club\s*:\s*/i,

  // Generic "[Org] presents:" pattern — org name + "present(s)" + separator
  // Matches "X Film Club presents:", "X Film Festival present:", etc.
  /^[\w\s&''-]+\s+film\s+(?:club|festival|collective|society)\s+presents?[:\s]+/i,

  // Rio Cinema festival/event strands (specific x/slash patterns before general colon)
  /^rio\s+forever\s*[/x]\s+/i,
  /^rio\s+forever[:\s]+/i,

  // Screening format prefixes (Rio, etc.)
  /^naturist\s+screening[:\s]+/i,

  // Doc'n Roll festival prefix, including the spaced curly form "Doc’ n Roll"
  /^doc\s*['’]?\s*n\s+roll\b[^:]*[:\s]+/i,

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
  /^club\s+room[:\s]+/i,
  /^camp\s+classics\s+presents?[:\s]+/i,
  /^better\s+than\s+nothing\s+presents?[:\s]+/i,
  // bare "Bar Trash:" (no episode number, separate from "Bar Trash 42:"), and
  // "BAR TRASH presents X", which used to leave "presents X" behind
  /^bar\s+trash(?:\s+presents)?[:\s]+/i,

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

  // Generic "<Org> presents:" with a colon and at most four words of org name
  // ("Evolution of Horror Presents:", "We Are Doc Women presents:"). Plural
  // only, like the Films rule above. Without the colon, only the presenters
  // seen in listings are stripped, so a title such as "Christmas Presents" is
  // safe.
  /^(?:[\w'\u2019&.!-]+\s+){1,4}presents\s*:\s*/i,
  /^(?:cinecarib|peer|evolution\s+of\s+horror)\s+presents?\s+/i,
  // A presenter the venue already cut, leaving "presents MIRACLE MILE"
  /^presents\s+/i,

  // Patrol-learned prefixes from `.claude/data-check-learnings.json`. Compiled
  // and appended at module init so re-running /data-check naturally adds new
  // patterns to the scraper at next restart. Empty in CI / fresh checkouts
  // where the learnings file isn't present.
  ...loadLearnedPrefixRegexes(),
];

/** Compiled at module init from learnings.json — appended in the suffix-strip block. */
const LEARNED_SUFFIX_REGEXES = loadLearnedSuffixRegexes();

/**
 * Pure matching function — public for testability.
 *
 * Mirrors data-check's `buildNonFilmMatchers` so the scraper-time
 * classification and patrol-time detection use the same rules.
 *
 *   - Exact (case-insensitive) literal match when entry has `title` and not `regex`.
 *   - Regex match when entry has `regex: true` and `pattern: "<re-source>"`.
 */
export function getKnownNonFilmTypeFromEntries(
  title: string,
  entries: KnownNonFilm[] | undefined | null,
): string | null {
  if (!entries?.length) return null;
  const norm = title.trim().toLowerCase();
  // Exact-match pass first (faster, deterministic).
  for (const entry of entries) {
    if (!entry?.title) continue;
    if (entry.regex) continue; // regex entries are handled below
    if (entry.title.trim().toLowerCase() === norm) {
      return entry.type ?? "event";
    }
  }
  // Regex-match pass. Compile inline — caller is expected to be either the
  // test path (small entry counts) or the cached scraper path below.
  for (const entry of entries) {
    if (!entry?.regex || !entry.pattern) continue;
    try {
      const re = new RegExp(entry.pattern, "i");
      if (re.test(title)) return entry.type ?? "event";
    } catch {
      // Bad regex in learnings — skip silently rather than break all scrapes.
    }
  }
  return null;
}

/**
 * Look up a known non-film title in the data-check learnings file. Returns
 * the recorded `content_type` (e.g. "event", "live_broadcast") when the title
 * matches, or `null` when it doesn't.
 *
 * Used by the pipeline to set the correct content_type BEFORE attempting film
 * resolution — avoids creating film rows for quiz nights, placeholders, and
 * recurring music events.
 *
 * Now supports BOTH exact-match and regex entries — see
 * `getKnownNonFilmTypeFromEntries` for the matching contract. The previous
 * implementation only handled exact-match, which left a gap vs. data-check.
 */
export function getKnownNonFilmType(title: string): KnownNonFilmContentType | null {
  const data = loadLearnings();
  const type = getKnownNonFilmTypeFromEntries(title, data?.knownNonFilmTitles);
  if (!type) return null;
  if (type === "concert" || type === "live_broadcast") return type;
  return "event";
}

/** Boolean convenience wrapper around getKnownNonFilmType. */
export function isKnownNonFilmTitle(title: string): boolean {
  return getKnownNonFilmType(title) !== null;
}

/**
 * Foreign-title-bracket: detects `Original (English Translation)` pattern
 * used at Garden Cinema, Cine Lumi\u00e8re, and BFI for foreign-language repertory.
 * Returns the bracketed English form as the `lookup` (for TMDB matching) and
 * keeps the original `display` value for storage.
 *
 * Triggers only when the part before the bracket contains a non-ASCII
 * character \u2014 without that guard "Cabaret (1972 Restoration)" would match,
 * and the user's "Nine Queens (Nueve reinas)" English-first case wouldn't
 * trigger (good \u2014 that's already the form we want).
 */
export function extractEnglishFromBracket(title: string): { display: string; lookup: string } {
  const display = title;
  const match = title.match(/^([^()]+?)\s+\(([A-Za-z][A-Za-z\s,:'!?.\-&]+)\)\s*$/u);
  if (!match) return { display, lookup: title };
  const original = match[1];
  const english = match[2];
  // Require a non-ASCII character in the `original` part \u2014 that's the
  // signal that the bracket holds an English translation, not a subtitle.
  if (!/[^\x00-\x7f]/u.test(original)) return { display, lookup: title };
  return { display, lookup: english.trim() };
}

/** Result of cleaning a film title with metadata about what was stripped */
interface CleanTitleResult {
  cleanedTitle: string;
  strippedPrefix: string | null;
  strippedSuffix: string | null;
  /**
   * Year extracted from a stripped trailing "(YYYY)" or from a decoration
   * suffix like "(2026 Re-release)". A plain trailing release year wins over
   * a decoration year when both are present. Callers may use it as a TMDB
   * year hint — subject to the usual year discipline (screening-year
   * pollution means current/future years must be discarded by the caller).
   */
  extractedYear?: number;
}

/**
 * What may follow an extra such as "+ talk" or "+ Q&A" for it to count as one:
 * the end of the title, punctuation, or a word that describes the extra
 * ("with", "by", "presented", "film critic"). Any other word means the plus
 * joins a second film, as in "Tony Takitani + Talk Radio", and the title is
 * left whole.
 */
const EXTRA_TAIL = String.raw`(?=\s*$|\s*[:;,.(…–+-]|\s+(?:with|by|from|and|&|presented|hosted|chaired|moderated|featuring|feat\.?|ft\.?|followed|in\s+conversation|film\s+critic|director|curator|writer|tbc|liff\d*|lpff\d*|fffl)\b)`;

/** "+ Q&A" / "+ Q+A" (including HTML-encoded &amp;), "+ Introduction", "+ Director Introduction",
 * "+ discussion with ...", "+ Panel Discussion", "+ ScreenTalk", "+ talk", "+ Book Launch", "+ Live Music" */
const PLUS_EXTRA = new RegExp(
  String.raw`\s*\+\s*(?:q\s*(?:&amp;|&|\+)\s*a|(?:panel\s+)?discussion|(?:director\s+)?introduction|screen\s?talk|talk|book\s+launch|live\s+music)${EXTRA_TAIL}.*$`,
  "i",
);

/** "+ intro ...", "+ Recorded Intro", "+ pre-recorded intro by ...", "+ extended intro with ...".
 * Unanchored, as before: the short word "intro" never starts a second film. */
const PLUS_INTRO = /\s*\+\s*(?:(?:pre-?)?recorded\s+|extended\s+)?intro\b.*$/i;

/** "plus Q&A" / "plus Director Q&A" */
const PLUS_WORD_QA = new RegExp(
  String.raw`\s+plus\s+(?:director\s+)?q\s*(?:&amp;|&|\+)\s*a${EXTRA_TAIL}.*$`,
  "i",
);

/**
 * Clean a film title and return metadata about what was stripped.
 *
 * Returns the cleaned title along with the stripped prefix and suffix,
 * so the pipeline can preserve event context (e.g. in screening.eventDescription).
 */
export function cleanFilmTitleWithMetadata(title: string): CleanTitleResult {
  let cleaned = decodeHtmlEntities(title)
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
      // "Funeral Parade presents "The Long Day Closes"" leaves the quotes behind
      if (REVIEWED_WRAPPER_PREFIXES.includes(prefix)) cleaned = unwrapQuotedTitle(cleaned);
      break;
    }
  }

  // A "Special Preview of" event usually ends with its guest: "Fatherland with
  // Katja Hoyer". Only here, and only for a name of two or three capitalised
  // words, so "Dances with Wolves" keeps its wolves.
  if (strippedPrefix && /preview\s+of$/i.test(strippedPrefix)) {
    cleaned = cleaned.replace(/\s+with\s+\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){1,2}$/u, "").trim();
  }

  // Strip pagination artifacts from BFI titles (e.g. "The Chronology of Water p17")
  cleaned = cleaned.replace(/\s+p\d{1,3}\s*$/i, "").trim();

  // Strip "on 16mm" / "on 35mm" / "on 70mm" film format suffixes (PCC/Lost Reels style)
  cleaned = cleaned.replace(/\s+on\s+(16mm|35mm|70mm)\s*$/i, "").trim();

  // Strip ": 4K Restoration Premiere" / similar format-noise colon suffixes
  // BEFORE the generic colon handler. The colon handler would otherwise
  // mis-identify "Vampire's Kiss" as the event prefix and "4K Restoration
  // Premiere" as the real title (because "Vampire's Kiss" is 2 words and the
  // after-colon is longer). Strip the noise here so the handler doesn't see it.
  cleaned = cleaned.replace(/\s*:\s*4k\s+restoration\s+premiere\s*$/i, "").trim();
  // Same reason for ": The Director's Cut": "Brazil: Director's Cut" would
  // otherwise come out as "Director's Cut". A director's cut also drops its
  // two- or three-word possessive credit ("Ken Russell's The Devils: The
  // Director's Cut"). Elsewhere that credit can be the film's own TMDB title
  // ("Lee Cronin's The Mummy", "Bram Stoker's Dracula"), so it stays.
  const directorsCut = cleaned.match(/\s*:\s*(?:the\s+)?director['’]?s\s+cut\s*$/i);
  if (directorsCut) {
    cleaned = cleaned
      .slice(0, directorsCut.index)
      .replace(/^(?:\p{Lu}[\p{L}.-]*\s+){1,2}\p{Lu}[\p{L}.-]*['’][sS]?\s+/u, "")
      .trim();
  }

  // Handle remaining colon-separated titles where film is after colon
  // but only if the part before colon looks like an event name (not a film title)
  const colonMatch = cleaned.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch) {
    const beforeColon = colonMatch[1].trim();
    const afterColon = colonMatch[2].trim();

    // Check if before-colon looks like a film series/franchise (keep these intact)
    const isFilmSeries = /^(star\s+wars|indiana\s+jones|harry\s+potter|lord\s+of\s+the\s+rings|mission(?:\s+impossible|$)|pirates\s+of\s+the\s+caribbean|fast\s+(&|and)\s+furious|jurassic\s+(park|world)|the\s+matrix|batman|spider[\s-]?man|x[\s-]?men|avengers|guardians\s+of\s+the\s+galaxy|toy\s+story|shrek|finding\s+(nemo|dory)|the\s+dark\s+knight|alien|terminator|mad\s+max|back\s+to\s+the\s+future|die\s+hard|lethal\s+weapon|home\s+alone|rocky|rambo|the\s+godfather|twin\s+peaks|blade\s+runner|john\s+wick|planet\s+of\s+the\s+apes|dune|jlg\s*\/?\s*jlg|bookish)/i.test(beforeColon);

    // Check if before-colon is a known event-type word pattern
    const isEventPattern = /^(season|series|part|episode|chapter|vol(ume)?|act|double\s+feature|marathon|retrospective|tribute|celebration|anniversary|special|presents?|screening|showing|feature)/i.test(beforeColon);

    // Check if after-colon looks like a subtitle (short, starts with article/adjective).
    // "Vol." keeps "Kill Bill: Vol. 2" whole; it used to come out as "Vol. 2".
    const isSubtitle = /^(the|a|an|new|last|final|return|rise|fall|revenge|attack|empire|phantom|force|rogue|solo|part|vol(?:ume)?\.?)\s/i.test(afterColon);

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

  // Strip trailing year like "(1997)" or "(2026)" — captured as a TMDB year
  // hint instead of silently discarded (plan 008). A plain trailing release
  // year overwrites a decoration year captured below ("Akira (1988) (2026
  // Re-release)" should hint 1988, not 2026).
  let extractedYear: number | undefined;
  const stripTrailingYear = (input: string): string => {
    const match = input.match(/\s*\((\d{4})\)\s*$/);
    if (!match) return input;
    // A double bill with a year per film ("Speak (1962) and The Committee
    // (1968)") has no single release year; the last one is the second film's.
    if (/\(\d{4}\)/.test(input.slice(0, match.index))) return input;
    extractedYear = parseInt(match[1], 10);
    return input.slice(0, match.index).trim();
  };
  cleaned = stripTrailingYear(cleaned);

  // Capture state before suffix stripping to detect what was removed
  const beforeSuffixStrip = cleaned;

  // Decoration suffixes stack — "AKIRA (2026 Re-release) (Subbed)" needs one
  // pass to remove "(Subbed)" and a second for "(2026 Re-release)". Apply the
  // suffix strips iteratively until fixpoint, max 3 passes (plan 008).
  for (let pass = 0; pass < 3; pass++) {
    const beforePass = cleaned;

    // Capture the year inside "(2026 Re-release)"-style decorations as a
    // year hint before the chain below discards it. `??=` so a plain
    // trailing release year (stripTrailingYear above/below) wins on collision.
    // Known limitation (reviewed, accepted): only decorations trailing at the
    // START of a pass are seen — "Film (2026 Re-release) (PG)" loses the 2026
    // because one pass strips "(PG)" and "(2026 Re-release)" in a single
    // chain. Decoration years are almost always current-year and get
    // discarded by year discipline anyway.
    const decorationYear = cleaned.match(
      /\((\d{4})\s+(?:re-?release|restoration|reissue|encore)\)\s*$/i,
    );
    if (decorationYear) extractedYear ??= parseInt(decorationYear[1], 10);

    cleaned = stripTerminalDecorations(cleaned
    // Remove festival tags: "Madame FFFL", "Coward - FFFL", "Case 137 FFF",
    // "Between Worlds (LPFF)". Case-sensitive so real words never match
    // ("The Meaning of Liff").
    .replace(/\s+(?:[-–]\s+)?(?:FFFL|FFF|LIFF|LPFF|LoLaFF)\s*$|\s*\((?:FFFL|LIFF|LPFF|LoLaFF)\)\s*$/, "")
    // Remove London Breeze Film Festival notes, often with the closing bracket
    // cut off: "The Crowd (London Breeze Film Festival UK Premiere"
    .replace(/\s*\(london\s+breeze\s+film\s+festival\b[^)]*\)?\s*$/i, "")
    // Remove BBFC ratings: (U), (PG), (12), (12A), (15), (18), with optional asterisk
    .replace(/\s*\((U|PG|12A?|15|18)\*?\)\s*$/i, "")
    // Remove bracketed notes like [is a Christmas Movie]
    .replace(/\s*\[.*?\]\s*$/g, "")
    // Remove trailing "- 35mm", "- 70mm" format notes (already captured as format)
    .replace(/\s*-\s*(35mm|70mm|4k|imax)\s*$/i, ""))
    // Complete decorations such as "(London Premiere + Q&A)" are stripped
    // above, before the "+ Q&A" rules below can cut them at the plus sign.
    // Remove duration-prefixed event suffixes: "(60 mins) + Panel" — must come before Q&A strip
    .replace(/\s*\(\d+\s*mins?\)\s*\+.*$/i, "")
    // Remove complex event suffixes: "+ Live Recording of PPF Podcast...", "+ Panel hosted by..."
    .replace(/\s*\+\s+[A-Z][\w\s]+(?:Q&A|Recording|Podcast|hosted\s+by).*$/i, "")
    // Remove trailing extras: "+ Q&A", "+ pre-recorded intro by ...", "plus Director Q&A".
    // All but the intros are anchored by EXTRA_TAIL so a double bill keeps its
    // second film.
    .replace(PLUS_INTRO, "")
    .replace(PLUS_EXTRA, "")
    .replace(PLUS_WORD_QA, "")
    // Remove a bracketed "(+Q&A)"
    .replace(/\s*\(\s*\+\s*q\s*(?:&amp;|&|\+)\s*a\s*\)\s*$/i, "")
    // Remove live-score notes: "Nosferatu with Live Score", "(Live Score)"
    .replace(/\s+with\s+live\s+score\s*$|\s*\(live\s+score\)\s*$/i, "")
    // Remove programme notes: "- Preview", "- Black History Month 2026",
    // "I Trans Awareness programme 2026" (the I stands in for a pipe),
    // "Edition w/ Bonus Footage"
    .replace(/\s+[-–]\s+preview\s*$/i, "")
    .replace(/\s+[-–]\s+black\s+history\s+month(?:\s+\d{4})?\s*$/i, "")
    .replace(/\s+[I|]\s+trans\s+awareness\s+programme(?:\s+\d{4})?\s*$/i, "")
    .replace(/\s+edition\s+w\/\s*bonus\s+footage\s*$/i, "")
    // Remove trailing format parentheticals like "(ON VHS)", "(ON 16MM)", and
    // the unclosed "(ON 16MM" some listings truncate to
    .replace(/\s*\(on\s+(vhs|16mm|35mm|70mm|blu-?ray|dvd|4k)\)?\s*$/i, "")
    // Remove "(16mm)" / "(35mm)" / "(70mm)" / "(35 mm)" format parentheticals
    .replace(/\s*\((?:16|35|70)\s?mm\)\s*$/i, "")
    // Remove undated version notes: "(Re-release)", "(Remastered)",
    // "(Theatrical Cut)", "(North American Cut)"
    .replace(/\s*\((?:re-?release|remastered|theatrical\s+cut|north\s+american\s+cut)\)\s*$/i, "")
    // Remove 4K notes: "(4K reissue)", "(4K Re-release)", "- 4K Restoration",
    // "Sexy Beast- 4K Restoration", "Halloween 4K Restoration", "La Boum 4K"
    .replace(/(?:\s*[-–]\s*|\s*\(|\s+)4k(?:\s+(?:restoration|re-?release|reissue))?\)?\s*$/i, "")
    // Remove "(aka The Silk Noose)" alternate-title notes
    .replace(/\s*\(aka\s+[^)]*\)\s*$/i, "")
    // Remove the "(BIA)" screening-type tag: "The Invite (BIA)"
    .replace(/\s*\(BIA\)\s*$/i, "")
    // Remove a venue's part marker after a title that ends in a letter:
    // "Liberté (Pt2)", "Resistance - part1". Only the abbreviated "(Pt2)" and
    // the lowercase "- part 2". Canonical sequel naming ("Mockingjay - Part 2",
    // "Che - Part 2", "Dune: Part Two") is the film's identity and stays.
    .replace(/(?<=\p{L})\s*\(pt\.?\s*\d+\)\s*$/iu, "")
    .replace(/(?<=\p{L})\s+[-–]\s*part\s*\d+\s*$/u, "")
    // Remove "Presented by ..." suffixes
    .replace(/\s+presented\s+by\s+.*$/i, "")
    // Remove "• Nth Anniversary" suffixes
    .replace(/\s*[•·]\s*\d+\w*\s+anniversary\b.*$/i, "")
    // Remove other bullet-separated decorations: "Nadja • 4K Restoration • London Premiere".
    // "• Double Feature" is deliberately absent: stripping it from
    // "Halloween (1978) + Halloween II (1981) • Double Feature" exposes the
    // second film's year as the hint for the whole double bill.
    .replace(/\s*[•·]\s*(?:4k|restoration|(?:uk|london|world|european?)\s+premiere)\b.*$/i, "")
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
    // Remove a bare "25th Anniversary" with no brackets, with any separator in
    // front of it ("Lola – 25th Anniversary", "The Movie: 40th Anniversary").
    // The required space means a row literally named "30th Anniversary" is
    // left alone.
    .replace(/\s*[-–:]?\s+\d+(?:th|st|nd|rd)\s+anniversary\s*$/i, "")
    // Remove an unclosed "(20th Anniversary" the listing cut short
    .replace(/\s*\(\d+(?:th|st|nd|rd)\s+anniversary\b[^)]*$/i, "")
    // Remove "- (24 Year Anniversary)" / "(24 Year Anniversary)"
    .replace(/\s*(?:[-–]\s*)?\(\d+\s+years?\s+anniversary\)\s*$/i, "")
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
    // Remove "(Subbed)" / "(Dubbed)" language-presentation decorations
    .replace(/\s*\((?:subbed|dubbed)\)\s*$/i, "")
    // Remove bare "(4K)" format decoration ("(4K Restoration)" handled above)
    .replace(/\s*\(4k\)\s*$/i, "")
    // Remove "- Weird Wednesdays" and similar event series suffixes
    .replace(/\s*-\s*weird\s+wednesdays?\s*$/i, "")
    .trim();

    // Apply patrol-learned suffixes after the hand-curated list, since the
    // hand-curated patterns are tighter and should win on collision.
    for (const re of LEARNED_SUFFIX_REGEXES) {
      cleaned = cleaned.replace(re, "").trim();
    }

    // A stripped decoration can expose a trailing "(YYYY)" that was hidden
    // mid-string on entry — capture it too.
    cleaned = stripTrailingYear(cleaned);

    if (cleaned === beforePass) break;
  }

  const strippedSuffix = beforeSuffixStrip !== cleaned
    ? beforeSuffixStrip.slice(cleaned.length).trim()
    : null;

  return { cleanedTitle: cleaned, strippedPrefix, strippedSuffix, extractedYear };
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
