/**
 * Decade tokens accepted by search. The homepage's curated chip values live
 * in `DECADE_OPTIONS` in `$lib/constants/filters.ts`.
 *
 * NOTE: "20s" alone is ambiguous (1920s vs 2020s). We default it
 * to 1920s — more common in cinema discourse (silent era,
 * pre-code, etc.). Users wanting the modern decade should type
 * "2020s" explicitly.
 */

export const DECADE_TOKENS: Record<string, string> = {
  "20s": "1920s",
  "1920s": "1920s",
  "30s": "1930s",
  "1930s": "1930s",
  "40s": "1940s",
  "1940s": "1940s",
  "50s": "1950s",
  "1950s": "1950s",
  "60s": "1960s",
  "1960s": "1960s",
  "70s": "1970s",
  "1970s": "1970s",
  "80s": "1980s",
  "1980s": "1980s",
  "90s": "1990s",
  "1990s": "1990s",
  "00s": "2000s",
  "2000s": "2000s",
  "10s": "2010s",
  "2010s": "2010s",
  "2020s": "2020s",
};
