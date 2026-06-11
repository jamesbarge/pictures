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
