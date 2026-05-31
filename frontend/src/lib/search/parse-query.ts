/**
 * Query intent parser for the cmd+k command palette.
 *
 * Tokenises a user query into structured `ParsedIntent` so the server
 * can apply filter predicates (date range, formats, genres, cinema IDs,
 * etc.) alongside the lexical/trigram match.
 *
 * Design constraints:
 *  - **Pure**. `now` is injected — the function never reads `Date.now()`
 *    directly. This keeps Vitest snapshots stable.
 *  - **No external deps**. No chrono-node — the four temporal phrases we
 *    care about (tonight / tomorrow / this weekend / next [day]) are
 *    handled directly.
 *  - **London-timezone aware**. All date math uses `Europe/London` via
 *    `Intl.DateTimeFormat`, matching `filters.setDatePreset` in the
 *    existing filter store.
 *  - **Multi-word phrases first**. A 2/3-word scan over the tokens runs
 *    before single-token lookups so "this weekend" doesn't get split.
 *
 * The parser greedily consumes tokens. Whatever is unconsumed becomes
 * `freeText`, which is what the server's tsvector + trigram match uses.
 */

import { FORMAT_TOKENS, FORMAT_PHRASES_BY_LENGTH } from "./vocab/formats";
import {
  GENRE_TOKENS,
  GENRE_PHRASES_BY_LENGTH,
  GENRE_PHRASE_MAP,
} from "./vocab/genres";
import { DECADE_TOKENS } from "./vocab/decades";
import { COUNTRY_TOKENS, LANGUAGE_TOKENS } from "./vocab/countries";
import {
  CHAIN_TOKENS,
  CINEMA_ALIAS_TOKENS,
  CINEMA_ALIAS_PHRASES_BY_LENGTH,
} from "./vocab/chains";
import { CERTIFICATION_TOKENS } from "./vocab/certifications";
import {
  SPECIAL_TOKENS,
  PREMIERE_TYPE_PHRASES,
  PREMIERE_PHRASES_BY_LENGTH,
  WATCHLIST_PHRASES,
  WATCHLIST_PHRASES_BY_LENGTH,
} from "./vocab/specials";
import { TIME_PRESETS, TIME_PHRASES_BY_LENGTH } from "./vocab/time";

export type PremiereType = "world" | "international" | "european" | "uk";
export type WatchlistFilter = "want_to_see" | "seen";

export interface ChipDescriptor {
  id: string;
  kind: string;
  label: string;
}

export interface ParsedIntent {
  freeText: string;
  dateFrom?: Date;
  dateTo?: Date;
  timeFrom?: number;
  timeTo?: number;
  formats: string[];
  genres: string[];
  decades: string[];
  countries: string[];
  languages: string[];
  cinemaIds: string[];
  chainTokens: string[];
  certification: string[];
  isRepertory?: boolean;
  hasSubtitles?: boolean;
  isRelaxedScreening?: boolean;
  isPremiere?: boolean;
  premiereTypes: PremiereType[];
  contentTypes: string[];
  watchlistFilter?: WatchlistFilter;
  reachable?: boolean;
  minRating?: number;
  chipDescriptors: ChipDescriptor[];
}

function emptyIntent(): ParsedIntent {
  return {
    freeText: "",
    formats: [],
    genres: [],
    decades: [],
    countries: [],
    languages: [],
    cinemaIds: [],
    chainTokens: [],
    certification: [],
    premiereTypes: [],
    contentTypes: [],
    chipDescriptors: [],
  };
}

interface Token {
  raw: string;
  lower: string;
  start: number;
  end: number;
  consumed: boolean;
}

const TOKEN_RE = /[A-Za-z0-9'\-:]+/g;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  // Split on whitespace + most punctuation, but KEEP intra-word digits
  // and hyphens (so "35mm", "4dx", "70mm-imax", "sci-fi" stay intact).
  for (const match of input.matchAll(TOKEN_RE)) {
    const start = match.index ?? 0;
    tokens.push({
      raw: match[0],
      lower: match[0].toLowerCase(),
      start,
      end: start + match[0].length,
      consumed: false,
    });
  }
  return tokens;
}

// London-timezone helpers.
// parseQuery() runs on every command-palette keystroke, so these formatters
// are hoisted to module scope — the Intl.DateTimeFormat constructor (ICU
// locale/timezone load) is the dominant cost; .format()/.formatToParts() are
// cheap. Matches the cached-formatter pattern in $lib/utils.ts. Configs are
// constant, so output is byte-identical to per-call construction.
const LONDON_DATE_ISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const LONDON_WEEKDAY_SHORT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  timeZone: "Europe/London",
});

const LONDON_SHORT_OFFSET = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  timeZoneName: "shortOffset",
});

function londonDateString(d: Date): string {
  return LONDON_DATE_ISO.format(d);
}

function londonDayOfWeek(d: Date): number {
  const short = LONDON_WEEKDAY_SHORT.format(d);
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[short] ?? d.getDay();
}

function londonMidnight(yyyyMmDd: string, hour = 0): Date {
  // Returns a Date representing London midnight (or `hour:00`) on the
  // given date. We compute the London offset for that specific instant
  // (DST-aware) and subtract it from UTC midnight.
  const utcMid = new Date(`${yyyyMmDd}T00:00:00Z`);
  const offsetPart = LONDON_SHORT_OFFSET
    .formatToParts(utcMid)
    .find((p) => p.type === "timeZoneName")?.value;
  let offsetMin = 0;
  if (offsetPart && offsetPart.startsWith("GMT")) {
    const m = offsetPart.match(/GMT([+-]\d+)/);
    if (m) offsetMin = parseInt(m[1], 10) * 60;
  }
  const londonMidUtc = new Date(utcMid.getTime() - offsetMin * 60 * 1000);
  return new Date(londonMidUtc.getTime() + hour * 3600 * 1000);
}

function addDaysToDateString(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ===== Phrase scanning =====

// `scanPhrases` runs ~9x per keystroke over constant module-level tables.
// Memoize the derived `maxLen` and per-length `Set` lookups per table so the
// constant data is only processed once, not rebuilt on every call.
interface CompiledPhrases {
  maxLen: number;
  sets: Map<number, Set<string>>;
}
const COMPILED_PHRASES = new WeakMap<Record<number, string[]>, CompiledPhrases>();

function compilePhrases(phrasesByLength: Record<number, string[]>): CompiledPhrases {
  let compiled = COMPILED_PHRASES.get(phrasesByLength);
  if (!compiled) {
    const sets = new Map<number, Set<string>>();
    let maxLen = 0;
    for (const key of Object.keys(phrasesByLength)) {
      const len = Number(key);
      if (len > maxLen) maxLen = len;
      sets.set(len, new Set(phrasesByLength[len]));
    }
    compiled = { maxLen, sets };
    COMPILED_PHRASES.set(phrasesByLength, compiled);
  }
  return compiled;
}

function scanPhrases(
  tokens: Token[],
  phrasesByLength: Record<number, string[]>,
  onMatch: (matchedPhrase: string, startIdx: number, endIdx: number) => boolean,
) {
  const { maxLen, sets } = compilePhrases(phrasesByLength);
  for (let len = maxLen; len >= 2; len--) {
    const phraseSet = sets.get(len);
    if (!phraseSet || phraseSet.size === 0) continue;
    for (let i = 0; i <= tokens.length - len; i++) {
      if (tokens.slice(i, i + len).some((t) => t.consumed)) continue;
      const joined = tokens.slice(i, i + len).map((t) => t.lower).join(" ");
      if (phraseSet.has(joined)) {
        const accepted = onMatch(joined, i, i + len - 1);
        if (accepted) {
          for (let j = i; j < i + len; j++) tokens[j].consumed = true;
        }
      }
    }
  }
}

// ===== Date scanners =====

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

// Short weekday labels indexed by day-of-week (Sun=0). Shared by the date
// scanners so the literal is allocated once, not per call.
const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// "next <day>" phrases, precomputed once off the keystroke hot path.
const NEXT_DAY_PHRASES_BY_LENGTH: Record<number, string[]> = {
  2: Object.keys(DAY_NAMES).map((d) => `next ${d}`),
};

function applyTonight(intent: ParsedIntent, now: Date) {
  const today = londonDateString(now);
  intent.dateFrom = londonMidnight(today, 0);
  intent.dateTo = londonMidnight(addDaysToDateString(today, 1), 0);
  intent.timeFrom = 18;
  intent.chipDescriptors.push({ id: "date:tonight", kind: "date", label: "TONIGHT" });
}

function applyToday(intent: ParsedIntent, now: Date) {
  const today = londonDateString(now);
  intent.dateFrom = londonMidnight(today, 0);
  intent.dateTo = londonMidnight(addDaysToDateString(today, 1), 0);
  intent.chipDescriptors.push({ id: "date:today", kind: "date", label: "TODAY" });
}

function applyTomorrow(intent: ParsedIntent, now: Date) {
  const today = londonDateString(now);
  const tomorrow = addDaysToDateString(today, 1);
  intent.dateFrom = londonMidnight(tomorrow, 0);
  intent.dateTo = londonMidnight(addDaysToDateString(tomorrow, 1), 0);
  intent.chipDescriptors.push({ id: "date:tomorrow", kind: "date", label: "TOMORROW" });
}

function applyWeekendOffset(intent: ParsedIntent, now: Date, offsetWeeks: number) {
  const today = londonDateString(now);
  const dow = londonDayOfWeek(now);
  let satOffset = (6 - dow + 7) % 7;
  if (offsetWeeks > 0) satOffset += offsetWeeks * 7;
  if (offsetWeeks === 0 && dow === 0) satOffset = -1;
  const sat = addDaysToDateString(today, satOffset);
  const mon = addDaysToDateString(sat, 2);
  intent.dateFrom = londonMidnight(sat, 0);
  intent.dateTo = londonMidnight(mon, 0);
  intent.chipDescriptors.push({
    id: `date:weekend${offsetWeeks > 0 ? `+${offsetWeeks}` : ""}`,
    kind: "date",
    label: offsetWeeks > 0 ? "NEXT WEEKEND" : "THIS WEEKEND",
  });
}

function applyThisWeek(intent: ParsedIntent, now: Date) {
  const today = londonDateString(now);
  intent.dateFrom = londonMidnight(today, 0);
  intent.dateTo = londonMidnight(addDaysToDateString(today, 7), 0);
  intent.chipDescriptors.push({ id: "date:thisweek", kind: "date", label: "THIS WEEK" });
}

function applyNextDay(intent: ParsedIntent, now: Date, dayIdx: number) {
  const today = londonDateString(now);
  const todayDow = londonDayOfWeek(now);
  let offset = (dayIdx - todayDow + 7) % 7;
  if (offset === 0) offset = 7;
  const target = addDaysToDateString(today, offset);
  intent.dateFrom = londonMidnight(target, 0);
  intent.dateTo = londonMidnight(addDaysToDateString(target, 1), 0);
  const dayName = WEEKDAY_LABELS[dayIdx];
  intent.chipDescriptors.push({
    id: `date:next-${dayIdx}`,
    kind: "date",
    label: `NEXT ${dayName}`,
  });
}

function applyDayThisWeek(intent: ParsedIntent, now: Date, dayIdx: number) {
  const today = londonDateString(now);
  const todayDow = londonDayOfWeek(now);
  const offset = (dayIdx - todayDow + 7) % 7;
  const target = addDaysToDateString(today, offset);
  intent.dateFrom = londonMidnight(target, 0);
  intent.dateTo = londonMidnight(addDaysToDateString(target, 1), 0);
  const dayName = WEEKDAY_LABELS[dayIdx];
  intent.chipDescriptors.push({ id: `date:${dayIdx}`, kind: "date", label: dayName });
}

// ===== Time =====

function applyTimePreset(intent: ParsedIntent, presetKey: string) {
  const preset = TIME_PRESETS[presetKey];
  if (!preset) return;
  intent.timeFrom = preset.from;
  intent.timeTo = preset.to;
  intent.chipDescriptors.push({
    id: `time:${presetKey.replace(/\s+/g, "-")}`,
    kind: "time",
    label: presetKey.toUpperCase(),
  });
}

function applyTimeLiteral(intent: ParsedIntent, hour: number, mode: "after" | "before" | "at") {
  if (mode === "after") {
    intent.timeFrom = hour;
    intent.chipDescriptors.push({ id: `time:after-${hour}`, kind: "time", label: `AFTER ${formatHourLabel(hour)}` });
  } else if (mode === "before") {
    intent.timeTo = hour;
    intent.chipDescriptors.push({ id: `time:before-${hour}`, kind: "time", label: `BEFORE ${formatHourLabel(hour)}` });
  } else {
    intent.timeFrom = hour;
    intent.timeTo = Math.min(23, hour + 1);
    intent.chipDescriptors.push({ id: `time:at-${hour}`, kind: "time", label: `AT ${formatHourLabel(hour)}` });
  }
}

function formatHourLabel(h: number): string {
  if (h === 0) return "12AM";
  if (h < 12) return `${h}AM`;
  if (h === 12) return "12PM";
  return `${h - 12}PM`;
}

function parseHourLiteral(raw: string): number | null {
  const m1 = raw.match(/^(\d{1,2})(am|pm)$/i);
  if (m1) {
    let h = parseInt(m1[1], 10);
    if (m1[2].toLowerCase() === "pm" && h < 12) h += 12;
    if (m1[2].toLowerCase() === "am" && h === 12) h = 0;
    if (h >= 0 && h <= 23) return h;
  }
  const m2 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (m2) {
    const h = parseInt(m2[1], 10);
    if (h >= 0 && h <= 23) return h;
  }
  return null;
}

// ===== Main parser =====

export function parseQuery(input: string, now: Date): ParsedIntent {
  const intent = emptyIntent();
  if (!input || !input.trim()) return intent;

  const tokens = tokenize(input);
  if (tokens.length === 0) return intent;

  // --- Pass 1: multi-word phrases ---

  scanPhrases(tokens, { 2: ["this weekend", "next weekend"] }, (phrase) => {
    if (phrase === "this weekend") applyWeekendOffset(intent, now, 0);
    else applyWeekendOffset(intent, now, 1);
    return true;
  });

  scanPhrases(tokens, { 2: ["this week", "next week"] }, (phrase) => {
    if (phrase === "this week") applyThisWeek(intent, now);
    else {
      const today = londonDateString(now);
      intent.dateFrom = londonMidnight(addDaysToDateString(today, 7), 0);
      intent.dateTo = londonMidnight(addDaysToDateString(today, 14), 0);
      intent.chipDescriptors.push({ id: "date:nextweek", kind: "date", label: "NEXT WEEK" });
    }
    return true;
  });

  scanPhrases(
    tokens,
    NEXT_DAY_PHRASES_BY_LENGTH,
    (phrase) => {
      const dayPart = phrase.replace(/^next /, "");
      const idx = DAY_NAMES[dayPart];
      if (idx === undefined) return false;
      applyNextDay(intent, now, idx);
      return true;
    },
  );

  scanPhrases(tokens, TIME_PHRASES_BY_LENGTH, (phrase) => {
    if (TIME_PRESETS[phrase]) {
      applyTimePreset(intent, phrase);
      return true;
    }
    return false;
  });

  // "after Npm" / "before Npm" — pair scan, not phrase scan
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].consumed || tokens[i + 1].consumed) continue;
    const word = tokens[i].lower;
    const next = tokens[i + 1].lower;
    if (word !== "after" && word !== "before") continue;
    const h = parseHourLiteral(next);
    if (h === null) continue;
    applyTimeLiteral(intent, h, word as "after" | "before");
    tokens[i].consumed = true;
    tokens[i + 1].consumed = true;
  }

  scanPhrases(tokens, PREMIERE_PHRASES_BY_LENGTH, (phrase) => {
    const type = PREMIERE_TYPE_PHRASES[phrase];
    if (!type) return false;
    intent.isPremiere = true;
    if (!intent.premiereTypes.includes(type as PremiereType)) {
      intent.premiereTypes.push(type as PremiereType);
    }
    intent.chipDescriptors.push({ id: `premiere:${type}`, kind: "premiere", label: phrase.toUpperCase() });
    return true;
  });

  scanPhrases(tokens, WATCHLIST_PHRASES_BY_LENGTH, (phrase) => {
    const f = WATCHLIST_PHRASES[phrase];
    if (!f) return false;
    intent.watchlistFilter = f;
    intent.chipDescriptors.push({ id: `watchlist:${f}`, kind: "watchlist", label: phrase.toUpperCase() });
    return true;
  });

  scanPhrases(tokens, GENRE_PHRASES_BY_LENGTH, (phrase) => {
    const canonical = GENRE_PHRASE_MAP[phrase];
    if (!canonical) return false;
    if (!intent.genres.includes(canonical)) intent.genres.push(canonical);
    intent.chipDescriptors.push({ id: `genre:${canonical}`, kind: "genre", label: canonical.toUpperCase() });
    return true;
  });

  scanPhrases(tokens, FORMAT_PHRASES_BY_LENGTH, (phrase) => {
    const canonical = FORMAT_TOKENS[phrase];
    if (!canonical) return false;
    if (!intent.formats.includes(canonical)) intent.formats.push(canonical);
    intent.chipDescriptors.push({ id: `format:${canonical}`, kind: "format", label: canonical.toUpperCase() });
    return true;
  });

  scanPhrases(tokens, CINEMA_ALIAS_PHRASES_BY_LENGTH, (phrase) => {
    const slug = CINEMA_ALIAS_TOKENS[phrase];
    if (!slug) return false;
    if (!intent.cinemaIds.includes(slug)) intent.cinemaIds.push(slug);
    intent.chipDescriptors.push({ id: `cinema:${slug}`, kind: "cinema", label: phrase.toUpperCase() });
    return true;
  });

  // --- Pass 2: single tokens ---
  for (const t of tokens) {
    if (t.consumed) continue;
    const w = t.lower;

    if (w === "tonight" && !intent.dateFrom) {
      applyTonight(intent, now);
      t.consumed = true;
      continue;
    }
    if (w === "today" && !intent.dateFrom) {
      applyToday(intent, now);
      t.consumed = true;
      continue;
    }
    if (w === "tomorrow" && !intent.dateFrom) {
      applyTomorrow(intent, now);
      t.consumed = true;
      continue;
    }

    if (DAY_NAMES[w] !== undefined && !intent.dateFrom) {
      applyDayThisWeek(intent, now, DAY_NAMES[w]);
      t.consumed = true;
      continue;
    }

    if (TIME_PRESETS[w] && intent.timeFrom === undefined) {
      applyTimePreset(intent, w);
      t.consumed = true;
      continue;
    }

    const hour = parseHourLiteral(w);
    if (hour !== null && intent.timeFrom === undefined) {
      applyTimeLiteral(intent, hour, "at");
      t.consumed = true;
      continue;
    }

    if (FORMAT_TOKENS[w]) {
      const c = FORMAT_TOKENS[w];
      if (!intent.formats.includes(c)) {
        intent.formats.push(c);
        intent.chipDescriptors.push({ id: `format:${c}`, kind: "format", label: c.toUpperCase() });
      }
      t.consumed = true;
      continue;
    }

    if (GENRE_TOKENS[w]) {
      const c = GENRE_TOKENS[w];
      if (!intent.genres.includes(c)) {
        intent.genres.push(c);
        intent.chipDescriptors.push({ id: `genre:${c}`, kind: "genre", label: c.toUpperCase() });
      }
      t.consumed = true;
      continue;
    }

    if (DECADE_TOKENS[w]) {
      const c = DECADE_TOKENS[w];
      if (!intent.decades.includes(c)) {
        intent.decades.push(c);
        intent.chipDescriptors.push({ id: `decade:${c}`, kind: "decade", label: c.toUpperCase() });
      }
      t.consumed = true;
      continue;
    }

    if (COUNTRY_TOKENS[w]) {
      const c = COUNTRY_TOKENS[w];
      if (!intent.countries.includes(c)) {
        intent.countries.push(c);
        intent.chipDescriptors.push({ id: `country:${c}`, kind: "country", label: w.toUpperCase() });
      }
      t.consumed = true;
      continue;
    }
    if (LANGUAGE_TOKENS[w]) {
      const c = LANGUAGE_TOKENS[w];
      if (!intent.languages.includes(c)) {
        intent.languages.push(c);
        intent.chipDescriptors.push({ id: `lang:${c}`, kind: "language", label: w.toUpperCase() });
      }
      t.consumed = true;
      continue;
    }

    if (CHAIN_TOKENS[w]) {
      const c = CHAIN_TOKENS[w];
      if (!intent.chainTokens.includes(c)) {
        intent.chainTokens.push(c);
        intent.chipDescriptors.push({ id: `chain:${c}`, kind: "chain", label: c.toUpperCase() });
      }
      t.consumed = true;
      continue;
    }

    if (CINEMA_ALIAS_TOKENS[w]) {
      const slug = CINEMA_ALIAS_TOKENS[w];
      if (!intent.cinemaIds.includes(slug)) {
        intent.cinemaIds.push(slug);
        intent.chipDescriptors.push({ id: `cinema:${slug}`, kind: "cinema", label: w.toUpperCase() });
      }
      t.consumed = true;
      continue;
    }

    if (CERTIFICATION_TOKENS[w]) {
      const c = CERTIFICATION_TOKENS[w];
      if (!intent.certification.includes(c)) {
        intent.certification.push(c);
        intent.chipDescriptors.push({ id: `cert:${c}`, kind: "certification", label: c });
      }
      t.consumed = true;
      continue;
    }

    if (SPECIAL_TOKENS.isRepertory.has(w)) {
      intent.isRepertory = true;
      intent.chipDescriptors.push({ id: "rep", kind: "special", label: "REPERTORY" });
      t.consumed = true;
      continue;
    }
    if (SPECIAL_TOKENS.hasSubtitles.has(w)) {
      intent.hasSubtitles = true;
      intent.chipDescriptors.push({ id: "subs", kind: "special", label: "SUBTITLED" });
      t.consumed = true;
      continue;
    }
    if (SPECIAL_TOKENS.isRelaxedScreening.has(w)) {
      intent.isRelaxedScreening = true;
      intent.chipDescriptors.push({ id: "relaxed", kind: "special", label: "RELAXED" });
      t.consumed = true;
      continue;
    }
    if (SPECIAL_TOKENS.isPremiere.has(w) && !intent.isPremiere) {
      intent.isPremiere = true;
      intent.chipDescriptors.push({ id: "premiere", kind: "special", label: "PREMIERE" });
      t.consumed = true;
      continue;
    }
    if (SPECIAL_TOKENS.reachable.has(w)) {
      intent.reachable = true;
      intent.chipDescriptors.push({ id: "reachable", kind: "special", label: "NEARBY" });
      t.consumed = true;
      continue;
    }
    if (SPECIAL_TOKENS.watchlist.has(w) && !intent.watchlistFilter) {
      intent.watchlistFilter = "want_to_see";
      intent.chipDescriptors.push({ id: "watchlist", kind: "watchlist", label: "WATCHLIST" });
      t.consumed = true;
      continue;
    }
    if (SPECIAL_TOKENS.seen.has(w) && !intent.watchlistFilter) {
      intent.watchlistFilter = "seen";
      intent.chipDescriptors.push({ id: "seen", kind: "watchlist", label: "SEEN" });
      t.consumed = true;
      continue;
    }
  }

  // --- Pass 3: leftovers → freeText ---
  intent.freeText = tokens
    .filter((t) => !t.consumed)
    .map((t) => input.slice(t.start, t.end))
    .join(" ")
    .trim();

  return intent;
}
