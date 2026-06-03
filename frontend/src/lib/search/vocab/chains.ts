/**
 * Cinema chain + alias tokens.
 *
 * `CHAIN_TOKENS` maps a chain-name keyword to the canonical `chain`
 * field used in cinemas.chain. The parser surfaces these as
 * `chainTokens` so the intent-to-action mapper can resolve them to
 * cinema IDs by looking up `cinemas.where(chain = ...)`.
 *
 * `CINEMA_ALIAS_TOKENS` maps short codes / common aliases to specific
 * cinema slugs (cinemas.id). These resolve directly to cinemaIds.
 */

export const CHAIN_TOKENS: Record<string, string> = {
  curzon: "Curzon",
  picturehouse: "Picturehouse",
  everyman: "Everyman",
  bfi: "BFI",
  vue: "Vue",
  cineworld: "Cineworld",
  odeon: "Odeon",
};

// Specific cinema aliases → slug (cinemas.id).
// IMPORTANT: these slugs must match real cinemas.id values in the
// database. Verify with `SELECT id FROM cinemas` after any change.
export const CINEMA_ALIAS_TOKENS: Record<string, string> = {
  pcc: "prince-charles-cinema",
  "prince charles": "prince-charles-cinema",
  ica: "ica",
  barbican: "barbican",
  rio: "rio-cinema",
  genesis: "genesis-cinema",
  phoenix: "phoenix-cinema",
  garden: "garden-cinema",
  castle: "castle-cinema",
  "close-up": "close-up",
  closeup: "close-up",
  "bfi southbank": "bfi-southbank",
  "bfi imax": "bfi-imax",
};

export const CINEMA_ALIAS_PHRASES_BY_LENGTH: Record<number, string[]> = {
  2: ["prince charles", "bfi southbank", "bfi imax"],
};
