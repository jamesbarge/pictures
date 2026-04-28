/**
 * Maps cinema IDs to their the cloud orchestrator task IDs.
 * Used by admin routes to trigger individual scrapers.
 */

import { getCinemaById } from "@/config/cinema-registry";

// Chain cinema IDs → chain task IDs
const CHAIN_TASK_MAP: Record<string, string> = {
  curzon: "scraper-chain-curzon",
  picturehouse: "scraper-chain-picturehouse",
  everyman: "scraper-chain-everyman",

};

// Independent cinema IDs → task IDs
const INDEPENDENT_TASK_MAP: Record<string, string> = {
  "castle": "scraper-castle",
  "rio-dalston": "scraper-rio",
  "prince-charles": "scraper-prince-charles",
  "ica": "scraper-ica",
  "genesis": "scraper-genesis",
  "peckhamplex": "scraper-peckhamplex",
  "the-nickel": "scraper-nickel",
  "garden": "scraper-garden",
  "close-up-cinema": "scraper-close-up",
  "cine-lumiere": "scraper-cine-lumiere",
  "castle-sidcup": "scraper-castle-sidcup",
  "arthouse-crouch-end": "scraper-arthouse",
  "coldharbour-blue": "scraper-coldharbour-blue",
  "olympic-studios": "scraper-olympic",
  "david-lean-cinema": "scraper-david-lean",
  "riverside-studios": "scraper-riverside",
  "bfi-southbank": "scraper-bfi",
  "bfi-imax": "scraper-bfi",
  "barbican": "scraper-barbican",
  "phoenix-east-finchley": "scraper-phoenix",
  "electric-portobello": "scraper-electric",
  "electric-white-city": "scraper-electric",
  "lexi": "scraper-lexi",
  "regent-street": "scraper-regent-street",
  "rich-mix": "scraper-rich-mix",
};

/** Resolve a cinema ID to its the cloud orchestrator task ID, or `null` if unmapped. */
export function getTriggerTaskId(cinemaId: string): string | null {
  // Check independent first
  if (INDEPENDENT_TASK_MAP[cinemaId]) {
    return INDEPENDENT_TASK_MAP[cinemaId];
  }

  // Check if it's a chain cinema
  const cinema = getCinemaById(cinemaId);
  if (cinema?.chain && CHAIN_TASK_MAP[cinema.chain]) {
    return CHAIN_TASK_MAP[cinema.chain];
  }

  return null;
}

/** Return the deduplicated set of all registered the cloud orchestrator task IDs. */
export function getAllTriggerTaskIds(): string[] {
  const ids = new Set([
    ...Object.values(CHAIN_TASK_MAP),
    ...Object.values(INDEPENDENT_TASK_MAP),
  ]);
  return [...ids];
}
