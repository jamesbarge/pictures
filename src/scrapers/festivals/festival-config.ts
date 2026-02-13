/**
 * Festival Configuration
 * Per-festival rules for the reverse-tagger and inline detector.
 *
 * Each entry defines:
 * - Which venues host the festival
 * - Whether to auto-tag all screenings (AUTO) or require title matching (TITLE)
 * - Title keywords and URL patterns for TITLE-strategy festivals
 */

import type { FestivalTaggingConfig, WatchdogProbe } from "./types";

/**
 * Per-festival tagging configuration.
 * Keyed by slugBase — the year is resolved at runtime from the festivals table.
 */
export const FESTIVAL_CONFIGS: Record<string, FestivalTaggingConfig> = {
  // ── AUTO-confidence festivals (exclusive venue during window) ──────────

  frightfest: {
    slugBase: "frightfest",
    venues: ["prince-charles"],
    confidence: "AUTO",
    typicalMonths: [7], // August = month 7 (0-indexed)
  },

  liff: {
    slugBase: "liff",
    venues: ["genesis"],
    confidence: "AUTO",
    typicalMonths: [5, 6], // June-July (recently moved from April)
  },

  // ── TITLE-confidence festivals (shared venues, need signal matching) ───

  "bfi-flare": {
    slugBase: "bfi-flare",
    venues: ["bfi-southbank"],
    confidence: "TITLE",
    titleKeywords: ["flare", "bfi flare"],
    urlPatterns: [/\/flare\//i, /whatson\.bfi\.org\.uk\/flare/i],
    typicalMonths: [2], // March
  },

  raindance: {
    slugBase: "raindance",
    venues: ["curzon-soho"],
    confidence: "TITLE",
    titleKeywords: ["raindance"],
    urlPatterns: [/raindance\.org/i],
    typicalMonths: [5], // June
  },

  lsff: {
    slugBase: "lsff",
    venues: ["ica", "bfi-southbank", "rio-dalston", "rich-mix"],
    confidence: "TITLE",
    titleKeywords: ["lsff", "london short film festival", "short film festival"],
    urlPatterns: [/shortfilms\.org\.uk/i],
    typicalMonths: [0, 1], // January-February
  },

  lkff: {
    slugBase: "lkff",
    venues: ["bfi-southbank", "cine-lumiere", "ica"],
    confidence: "TITLE",
    titleKeywords: ["lkff", "korean film festival", "london korean"],
    urlPatterns: [/koreanfilm\.co\.uk/i],
    typicalMonths: [10], // November
  },

  "open-city": {
    slugBase: "open-city",
    venues: ["ica", "close-up-cinema", "barbican", "rich-mix"],
    confidence: "TITLE",
    titleKeywords: ["open city", "open city docs"],
    urlPatterns: [/opencitylondon\.com/i],
    typicalMonths: [3], // April
  },

  ukjff: {
    slugBase: "ukjff",
    venues: ["barbican", "curzon-soho"],
    confidence: "TITLE",
    titleKeywords: ["ukjff", "jewish film", "uk jewish film"],
    urlPatterns: [/ukjewishfilm/i, /eventive\.org/i],
    typicalMonths: [10], // November
  },

  liaf: {
    slugBase: "liaf",
    venues: ["barbican", "close-up-cinema", "garden"],
    confidence: "TITLE",
    titleKeywords: ["liaf", "animation festival", "london international animation"],
    urlPatterns: [/liaf\.org\.uk/i],
    typicalMonths: [10, 11], // November-December
  },

  docnroll: {
    slugBase: "docnroll",
    venues: ["barbican", "bfi-southbank", "rio-dalston"],
    confidence: "TITLE",
    titleKeywords: ["doc'n roll", "docnroll", "doc n roll"],
    urlPatterns: [/docnrollfestival\.com/i],
    typicalMonths: [9, 10], // October-November
  },

  eeff: {
    slugBase: "eeff",
    venues: ["genesis", "rio-dalston", "rich-mix"],
    confidence: "TITLE",
    titleKeywords: ["eeff", "east end film festival", "east end film"],
    urlPatterns: [/eastendfilmfestival\.com/i],
    typicalMonths: [6], // July
  },

  "sundance-london": {
    slugBase: "sundance-london",
    venues: ["curzon-soho", "picturehouse-central"],
    confidence: "TITLE",
    titleKeywords: ["sundance", "sundance london", "sundance:"],
    urlPatterns: [/sundance\.org/i],
    typicalMonths: [4], // May
  },

  "bfi-lff": {
    slugBase: "bfi-lff",
    venues: ["bfi-southbank", "bfi-imax", "curzon-soho", "curzon-mayfair"],
    confidence: "TITLE",
    titleKeywords: ["lff", "london film festival"],
    urlPatterns: [/\/lff\//i, /london-film-festival/i],
    typicalMonths: [9], // October
  },
};

/**
 * Get all festival config entries as an array.
 */
export function getAllFestivalConfigs(): FestivalTaggingConfig[] {
  return Object.values(FESTIVAL_CONFIGS);
}

/**
 * Get festival configs relevant to a specific cinema.
 */
export function getFestivalConfigsForVenue(
  cinemaId: string
): FestivalTaggingConfig[] {
  return Object.values(FESTIVAL_CONFIGS).filter((config) =>
    config.venues.includes(cinemaId)
  );
}

/**
 * Watchdog probe configurations for detecting programme announcements.
 */
export const WATCHDOG_PROBES: WatchdogProbe[] = [
  {
    slugBase: "bfi-lff",
    probeUrl: "https://www.bfi.org.uk/london-film-festival/programme",
    signal: "content-hash",
  },
  {
    slugBase: "bfi-flare",
    probeUrl: "https://whatson.bfi.org.uk/flare/Online/default.asp",
    signal: "content-hash",
  },
  {
    slugBase: "frightfest",
    probeUrl: (year) => `https://frightfest${String(year).slice(-2)}.eventive.org/films`,
    signal: "page-exists",
  },
  {
    slugBase: "raindance",
    probeUrl: "https://raindance.org/festival/programme",
    signal: "content-hash",
  },
  {
    slugBase: "ukjff",
    probeUrl: (year) => `https://ukjewishfilmfestival${year}.eventive.org/films`,
    signal: "page-exists",
  },
  {
    slugBase: "liff",
    probeUrl: "https://liff.org/programme",
    signal: "content-hash",
  },
  {
    slugBase: "lsff",
    probeUrl: "https://shortfilms.org.uk/programme",
    signal: "content-hash",
  },
  {
    slugBase: "lkff",
    probeUrl: "https://koreanfilm.co.uk/programme",
    signal: "content-hash",
  },
  {
    slugBase: "open-city",
    probeUrl: "https://opencitylondon.com/festival/full-programme",
    signal: "content-hash",
  },
  {
    slugBase: "liaf",
    probeUrl: "https://liaf.org.uk/programme",
    signal: "content-hash",
  },
  {
    slugBase: "docnroll",
    probeUrl: "https://www.docnrollfestival.com/programme",
    signal: "content-hash",
  },
  {
    slugBase: "eeff",
    probeUrl: "https://eastendfilmfestival.com/programme",
    signal: "content-hash",
  },
  {
    slugBase: "sundance-london",
    probeUrl: "https://www.sundance.org/festivals/london",
    signal: "content-hash",
  },
];
