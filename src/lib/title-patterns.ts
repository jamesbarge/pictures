/**
 * Shared title helpers layered on top of the canonical extraction patterns.
 */
import {
  EVENT_PREFIX_PATTERNS,
  TITLE_SUFFIXES,
} from "./title-extraction/patterns";

export * from "./title-extraction/patterns";

/**
 * Known franchises where colon is part of the title
 */
const FRANCHISE_PREFIXES = [
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
  "twin peaks",
  "blade runner",
  "john wick",
  "planet of the apes",
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

const MOJIBAKE_ENTITY_BYTES: Record<string, number> = {
  Atilde: 0xc3,
  Acirc: 0xc2,
  Aring: 0xc5,
  AElig: 0xc6,
  Ccedil: 0xc7,
  Egrave: 0xc8,
  Eacute: 0xc9,
  Euml: 0xcb,
  Iacute: 0xcd,
  Icirc: 0xce,
  Ntilde: 0xd1,
  Ograve: 0xd2,
  Oacute: 0xd3,
  Ouml: 0xd6,
  Uacute: 0xda,
  Uuml: 0xdc,
  iexcl: 0xa1,
  cent: 0xa2,
  pound: 0xa3,
  curren: 0xa4,
  yen: 0xa5,
  brvbar: 0xa6,
  sect: 0xa7,
  uml: 0xa8,
  copy: 0xa9,
  ordf: 0xaa,
  laquo: 0xab,
  not: 0xac,
  shy: 0xad,
  reg: 0xae,
  macr: 0xaf,
  deg: 0xb0,
  plusmn: 0xb1,
  sup2: 0xb2,
  sup3: 0xb3,
  acute: 0xb4,
  micro: 0xb5,
  para: 0xb6,
  middot: 0xb7,
  cedil: 0xb8,
  sup1: 0xb9,
  ordm: 0xba,
  raquo: 0xbb,
  frac14: 0xbc,
  frac12: 0xbd,
  frac34: 0xbe,
  iquest: 0xbf,
};

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  "#39": "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  rsquo: "\u2019",
  lsquo: "\u2018",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  // frac* also appear in MOJIBAKE_ENTITY_BYTES \u2014 intentional: the mojibake
  // decoder only fires on runs of 2+ entities, so these catch the
  // standalone case. Both paths yield the same character.
  frac12: "\u00bd",
  frac14: "\u00bc",
  frac34: "\u00be",
};

function decodeMojibakeEntityRuns(text: string): string {
  return text.replace(/(?:&[A-Za-z0-9]+;){2,}/g, (run) => {
    const names = Array.from(run.matchAll(/&([A-Za-z0-9]+);/g), (match) => match[1]);
    const bytes = names.map((name) => MOJIBAKE_ENTITY_BYTES[name]);
    if (bytes.some((byte) => byte === undefined)) return run;

    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    } catch {
      return run;
    }
  });
}

function decodeCodePoint(value: string, radix: number, original: string): string {
  const codePoint = Number.parseInt(value, radix);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return original;
  }

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return original;
  }
}

/**
 * Decode the named and numeric entities found in scraped titles, including
 * common HTML-encoded UTF-8 mojibake such as "&Atilde;&iexcl;".
 */
export function decodeHtmlEntities(title: string): string {
  return decodeMojibakeEntityRuns(title)
    .replace(/&#x([0-9a-f]+);/gi, (original, value: string) =>
      decodeCodePoint(value, 16, original))
    .replace(/&#(\d+);/g, (original, value: string) =>
      decodeCodePoint(value, 10, original))
    .replace(/&([A-Za-z0-9]+|#39);/g, (original, name: string) =>
      NAMED_HTML_ENTITIES[name] ?? original);
}

// ============================================================================
// Instalment (sequel) discrimination
// ============================================================================

/**
 * Words that make a following numeral unambiguously an instalment number,
 * including spelled-out ones ("Dune: Part Two").
 */
const INSTALMENT_WORD = /\b(?:part|pt|vol|volume|chapter|episode|ep|book|series|season|day)\.?\s+/i;

/** Spelled-out instalment numbers. Only read after an instalment word. */
const WORD_NUMERALS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20,
};

/**
 * Highest instalment number we will believe. Doubles as the filter that keeps
 * letter runs which merely *look* Roman out of the marker space: "MIX" parses
 * to 1009 and "LIV" to 54, both far above any real instalment.
 */
const MAX_INSTALMENT = 30;

/** Years are part of a film's name, never its instalment number. */
const YEAR_LIKE_MIN = 1900;
const YEAR_LIKE_MAX = 2100;

const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

function romanToInt(token: string): number | null {
  const upper = token.toUpperCase();
  let total = 0;
  for (let i = 0; i < upper.length; i++) {
    const value = ROMAN_VALUES[upper[i]];
    if (value === undefined) return null;
    const next = ROMAN_VALUES[upper[i + 1]];
    total += next !== undefined && next > value ? -value : value;
  }
  return total;
}

function intToRoman(value: number): string {
  const table: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let remaining = value;
  let out = "";
  for (const [n, numeral] of table) {
    while (remaining >= n) {
      out += numeral;
      remaining -= n;
    }
  }
  return out;
}

/** Trailing bracketed decoration: "(4K Restoration)", "[35mm]", "(BIA)". */
const TRAILING_BRACKET = /\s*[([{][^([{)\]}]*[)\]}]\s*$/;

/** A trailing explicit date — "07/10/2026", "31/10" — is not an instalment. */
const TRAILING_DATE = /\d{1,4}[/.]\d{1,2}(?:[/.]\d{2,4})?\s*$/;

/** Separators left behind once the marker is removed: "Mockingjay - ", "Dune: ". */
const TRAILING_SEPARATORS = /[\s\-–—:,.]+$/;

/**
 * The instalment number a title carries, or null when it carries none.
 *
 * Why this exists: trigram similarity cannot see the difference between a film
 * and its sequel. In the 2026-09-09 run "Practical Magic 2" was accepted as
 * "Practical Magic" at 89% in **36** logged matches, and "Mockingjay - Part 2"
 * was accepted as "Mockingjay - Part 1" at 80%. (The run also logged 9
 * year-window rejections of the same title, but each is immediately followed by
 * an acceptance, so those 9 are already inside the 36 rather than additional to
 * it.) A trailing instalment number is
 * the single strongest piece of evidence that two similar titles are different
 * films, so it is read explicitly rather than papered over by raising the
 * global threshold — which would have cost legitimate matches like
 * "Toy Story 5 (BIA)" → "Toy Story 5" (75%).
 *
 * Deliberately conservative about what counts as a marker:
 *   - Trailing bracketed decoration is stripped first, so "Toy Story 5 (BIA)"
 *     and "Sing 2 (Sing-Along)" still read as instalments 5 and 2.
 *   - A four-digit year in range is part of the name: "Blade Runner 2049",
 *     "1917" and "2046" carry NO marker, so decoration differences still match.
 *   - A trailing date carries no marker, so the run's "Baby Comptines
 *     07/10/2026" family is left to whatever guard handles dated instances.
 *     Those merges are real but they are not sequels.
 *   - The marker must have a base title in front of it. "X" (2022), "M" (1931)
 *     and a bare "II" are titles, not instalment numbers.
 *   - Roman numerals must round-trip canonically and land at or below
 *     MAX_INSTALMENT, which excludes letter runs like "MIX" and "LIV".
 *
 * Known imprecision, recorded rather than hidden: a title whose last token is a
 * single Roman letter is read as an instalment, so "Malcolm X" reports 10 and
 * "Who Am I" reports 1. The *outcome* stays conservative — such a title only
 * ever fails to match a candidate whose marker differs, and any true variant of
 * it keeps the same trailing letter — but the number itself is meaningless.
 */
export function sequelMarkerOf(title: string): number | null {
  const parsed = readTrailingNumber(title);
  return parsed?.kind === "instalment" ? parsed.value : null;
}

/**
 * The trailing number that identifies a title, whether or not it is an
 * instalment number.
 *
 * Two things are deliberately kept apart. `sequelMarkerOf` answers "which
 * instalment is this", and refuses to read a four-digit year as one, because
 * calling "Blade Runner 2049" instalment 2049 would be nonsense. But that year
 * still *identifies* the film: "Blade Runner 2049" is not "Blade Runner", and a
 * containment-flavoured similarity score cannot tell them apart. So identity
 * comparison uses this function, which reports the number either way, and the
 * instalment reading stays available separately for logging.
 */
export function trailingNumberOf(title: string): number | null {
  return readTrailingNumber(title)?.value ?? null;
}

type TrailingNumber = { value: number; kind: "instalment" | "name-number" };

function readTrailingNumber(title: string): TrailingNumber | null {
  let base = title.trim();
  // Peel every trailing bracketed group, not just the last one.
  let previous: string;
  do {
    previous = base;
    base = base.replace(TRAILING_BRACKET, "").trim();
  } while (base !== previous);

  if (TRAILING_DATE.test(base)) return null;

  const instalmentWord = base.match(new RegExp(INSTALMENT_WORD.source + "(\\S+)$", "i"));
  const token = instalmentWord ? instalmentWord[1] : (base.split(/\s+/).pop() ?? "");
  if (!token) return null;

  // The number needs a base title to belong to. "X" (2022), "M" (1931), "1917"
  // and a bare "II" are titles, not numbers attached to something.
  const withoutToken = base
    .slice(0, base.length - (instalmentWord ? instalmentWord[0].length : token.length))
    .replace(TRAILING_SEPARATORS, "")
    .trim();
  if (withoutToken === "") return null;

  if (/^\d{1,4}$/.test(token)) {
    const parsed = Number.parseInt(token, 10);
    if (parsed < 1) return null;
    // A year is part of the name, not an instalment, unless an instalment word
    // insists otherwise ("Part 2026" would be absurd but is at least explicit).
    if (!instalmentWord && parsed >= YEAR_LIKE_MIN && parsed <= YEAR_LIKE_MAX) {
      return { value: parsed, kind: "name-number" };
    }
    return parsed <= MAX_INSTALMENT
      ? { value: parsed, kind: "instalment" }
      : { value: parsed, kind: "name-number" };
  }

  if (/^[IVXLCDMivxlcdm]+$/.test(token)) {
    const parsed = romanToInt(token);
    if (parsed === null || parsed < 1 || parsed > MAX_INSTALMENT) return null;
    if (intToRoman(parsed) !== token.toUpperCase()) return null;
    return { value: parsed, kind: "instalment" };
  }

  if (instalmentWord) {
    const parsed = WORD_NUMERALS[token.toLowerCase()];
    if (parsed === undefined) return null;
    return { value: parsed, kind: "instalment" };
  }

  return null;
}

/**
 * Whether two titles disagree about their trailing number.
 *
 * Compares VALUES, so "Halloween II" and "Halloween 2" agree — the same film
 * rendered two ways must keep matching — and so do "Blade Runner 2049" and
 * "BLADE RUNNER 2049 (4K Restoration)". A number on one side only is a
 * disagreement: "Practical Magic 2" against "Practical Magic" is the observed
 * defect, "Blade Runner 2049" against "Blade Runner" is the same shape with a
 * year, and so is a bare base title against a "… Part 1" candidate.
 */
export function disagreesOnTrailingNumber(
  sourceTitle: string,
  candidateTitle: string
): boolean {
  return trailingNumberOf(sourceTitle) !== trailingNumberOf(candidateTitle);
}
