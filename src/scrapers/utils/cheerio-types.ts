/**
 * Cheerio type helpers
 * Works around cheerio type export issues in some TypeScript configurations
 */

import * as cheerio from "cheerio";

export type CheerioAPI = ReturnType<typeof cheerio.load>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CheerioSelection = any;
