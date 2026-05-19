/**
 * Country/language tokens.
 *
 * Maps adjectives ("French") to canonical lowercase country names
 * and language codes/names. Since films.countries[] in our DB uses
 * lowercase TMDB-style names ("france", "japan", "united kingdom"),
 * we store those forms.
 */

export const COUNTRY_TOKENS: Record<string, string> = {
  french: "france",
  france: "france",
  japanese: "japan",
  japan: "japan",
  korean: "south korea",
  korea: "south korea",
  italian: "italy",
  italy: "italy",
  german: "germany",
  germany: "germany",
  spanish: "spain",
  spain: "spain",
  russian: "russia",
  russia: "russia",
  chinese: "china",
  china: "china",
  american: "united states of america",
  british: "united kingdom",
  english: "united kingdom",
  indian: "india",
  india: "india",
  mexican: "mexico",
  mexico: "mexico",
  brazilian: "brazil",
  iranian: "iran",
  polish: "poland",
  swedish: "sweden",
  danish: "denmark",
  finnish: "finland",
  norwegian: "norway",
  dutch: "netherlands",
  belgian: "belgium",
  austrian: "austria",
  turkish: "turkey",
  greek: "greece",
  argentine: "argentina",
  australian: "australia",
};

export const LANGUAGE_TOKENS: Record<string, string> = {
  french: "french",
  japanese: "japanese",
  korean: "korean",
  italian: "italian",
  german: "german",
  spanish: "spanish",
  russian: "russian",
  mandarin: "mandarin",
  cantonese: "cantonese",
  hindi: "hindi",
  arabic: "arabic",
  portuguese: "portuguese",
  // "english" deliberately omitted — too common in queries to assume language intent
};
