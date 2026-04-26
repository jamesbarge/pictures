/**
 * @deprecated Re-export shim — use `@/lib/scraper-verification` directly.
 * This file will be deleted in Phase 4 of the local-scraping-rebuild.
 *
 * Note: the implementation now uses DeepSeek-V4-Flash (was Gemini).
 */
export { verifyScraperOutput } from "@/lib/scraper-verification";
export type { VerificationIssue, VerificationResult } from "@/lib/scraper-verification";
