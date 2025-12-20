/**
 * Chain Scrapers Index
 *
 * Exports all chain cinema scrapers for easy import
 * To add a new chain:
 * 1. Create a new file in this directory (e.g., odeon.ts)
 * 2. Export it here
 */

// Curzon Cinemas
export {
  CurzonScraper,
  createCurzonScraper,
  CURZON_CONFIG,
  CURZON_VENUES,
  getActiveCurzonVenues,
  getLondonCurzonVenues,
} from "./curzon";

// Picturehouse Cinemas
export {
  PicturehouseScraper,
  createPicturehouseScraper,
  PICTUREHOUSE_CONFIG,
  PICTUREHOUSE_VENUES,
  getActivePicturehouseVenues,
  getLondonPicturehouseVenues,
} from "./picturehouse";

// Everyman Cinemas
export {
  EverymanScraper,
  createEverymanScraper,
  EVERYMAN_CONFIG,
  EVERYMAN_VENUES,
  getActiveEverymanVenues,
} from "./everyman";

// Re-export types
export type { ChainConfig, VenueConfig, ChainScraper } from "../types";
