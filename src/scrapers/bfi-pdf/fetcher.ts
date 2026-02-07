/**
 * BFI PDF Fetcher
 *
 * Discovers and downloads BFI Southbank monthly guide PDFs.
 * Uses the accessible (text-based) PDF version for parsing.
 *
 * Discovery page: https://whatson.bfi.org.uk/Online/default.asp?BOparam::WScontent::loadArticle::permalink=bfisouthbankguide
 * PDF URL pattern: https://core-cms.bfi.org.uk/media/{mediaId}/download
 *
 * Proxy Support:
 * Set SCRAPER_API_KEY env var to use ScraperAPI for Cloudflare bypass.
 * ScraperAPI automatically handles JavaScript rendering and anti-bot protection.
 */

import * as cheerio from "cheerio";
import { createHash } from "crypto";
import { fetchWithRetry } from "../utils/fetch-with-retry";

/**
 * Fetches a URL, optionally through a proxy service.
 * Uses ScraperAPI if SCRAPER_API_KEY is set, otherwise direct fetch.
 */
async function proxyFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const scraperApiKey = process.env.SCRAPER_API_KEY;

  // For PDF downloads, try direct first (faster) - only proxy if blocked
  const isPdfDownload = url.includes("core-cms.bfi.org.uk");

  if (isPdfDownload) {
    console.log(`[BFI-PDF] Trying direct download for PDF: ${url.slice(0, 60)}...`);
    const directResponse = await fetch(url, {
      ...options,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/pdf,*/*",
        "Accept-Language": "en-GB,en;q=0.9",
        ...options.headers,
      },
    });

    // If direct download works, return it
    if (directResponse.ok) {
      console.log(`[BFI-PDF] Direct download succeeded`);
      return directResponse;
    }

    // If blocked and we have ScraperAPI, try proxy
    if (scraperApiKey && (directResponse.status === 403 || directResponse.status === 500)) {
      console.log(`[BFI-PDF] Direct download blocked (${directResponse.status}), trying ScraperAPI...`);
      const trimmedKey = scraperApiKey.trim();
      const proxyUrl = new URL("https://api.scraperapi.com/");
      proxyUrl.searchParams.set("api_key", trimmedKey);
      proxyUrl.searchParams.set("url", url);
      return fetchWithRetry(proxyUrl.toString(), undefined, "[BFI-PDF] ScraperAPI PDF proxy");
    }

    // Return the failed response
    return directResponse;
  }

  // For non-PDF URLs (HTML pages), use ScraperAPI if available
  if (scraperApiKey) {
    // Use ScraperAPI to bypass Cloudflare
    // Note: render=true was causing timeouts (~12s per request). Without it, requests take ~1s
    // and still bypass Cloudflare protection successfully.
    const trimmedKey = scraperApiKey.trim();
    const proxyUrl = new URL("https://api.scraperapi.com/");
    proxyUrl.searchParams.set("api_key", trimmedKey);
    proxyUrl.searchParams.set("url", url);

    console.log(`[BFI-PDF] Using ScraperAPI proxy for: ${url.slice(0, 60)}...`);


    return fetchWithRetry(proxyUrl.toString(), {
      ...options,
      // ScraperAPI handles headers, but we can pass some through
      headers: {
        ...options.headers,
      },
    }, "[BFI-PDF] ScraperAPI HTML proxy");
  }

  // Direct fetch with browser-like headers
  return fetch(url, {
    ...options,
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-GB,en;q=0.9",
      ...options.headers,
    },
  });
}

export interface PDFInfo {
  /** Month(s) covered by this guide, e.g., "February / March 2026" */
  label: string;
  /** URL to the full visual PDF */
  fullPdfUrl: string;
  /** URL to the accessible (text-based) PDF - this is what we parse */
  accessiblePdfUrl: string;
  /** Media ID extracted from URL */
  mediaId: string;
  /** Parsed month range */
  months: { start: Date; end: Date } | null;
}

export interface FetchedPDF {
  info: PDFInfo;
  /** Raw PDF buffer */
  buffer: Buffer;
  /** SHA-256 hash of the PDF content */
  contentHash: string;
  /** When this was fetched */
  fetchedAt: Date;
}

const GUIDE_PAGE_URL = "https://whatson.bfi.org.uk/Online/default.asp?BOparam::WScontent::loadArticle::permalink=bfisouthbankguide";
const PDF_BASE_URL = "https://core-cms.bfi.org.uk/media";

/**
 * Fetches the BFI guide page and discovers available PDF downloads.
 * Handles Cloudflare protection by using browser-like headers.
 */
export async function discoverPDFs(): Promise<PDFInfo[]> {
  console.log("[BFI-PDF] Discovering available PDFs...");

  const response = await proxyFetch(GUIDE_PAGE_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch BFI guide page: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Check for actual Cloudflare challenge (not just script references)
  // The page may contain challenge-platform scripts as part of normal operation
  const isActualChallenge =
    (html.includes("Checking your browser") && html.includes("before accessing")) ||
    (html.includes("Just a moment") && html.includes("Enable JavaScript")) ||
    (!html.includes("<title>BFI") && html.includes("challenge-platform"));

  if (isActualChallenge) {
    throw new Error("BFI guide page is behind Cloudflare challenge - consider using Playwright fallback");
  }

  const $ = cheerio.load(html);
  const pdfs: PDFInfo[] = [];

  // Find all PDF download links
  // Pattern: "February / March 2026 guide and calendar" + "accessible version"
  $('a[href*="core-cms.bfi.org.uk/media"]').each((_, el) => {
    const $link = $(el);
    const href = $link.attr("href") || "";
    const text = $link.text().trim();

    // Skip if not a guide link
    if (!text.toLowerCase().includes("guide")) return;

    // Extract media ID from URL
    const mediaIdMatch = href.match(/\/media\/(\d+)\/download/);
    if (!mediaIdMatch) return;

    const mediaId = mediaIdMatch[1];
    const isAccessible = text.toLowerCase().includes("accessible");

    // Parse the month label
    const monthMatch = text.match(/^([\w\s\/]+\d{4})/);
    const label = monthMatch ? monthMatch[1].trim() : text;

    // Find or create entry for this guide
    let pdfInfo = pdfs.find(p => p.label === label.replace(" – accessible version", "").replace(" guide and calendar", "").trim());

    if (!pdfInfo) {
      pdfInfo = {
        label: label.replace(" guide and calendar", "").replace(" – accessible version", "").trim(),
        fullPdfUrl: "",
        accessiblePdfUrl: "",
        mediaId: "",
        months: parseMonthRange(label),
      };
      pdfs.push(pdfInfo);
    }

    if (isAccessible) {
      pdfInfo.accessiblePdfUrl = href;
      pdfInfo.mediaId = mediaId;
    } else {
      pdfInfo.fullPdfUrl = href;
      // Use non-accessible ID as fallback
      if (!pdfInfo.mediaId) {
        pdfInfo.mediaId = mediaId;
      }
    }
  });

  // Filter to only include entries with accessible versions (what we need for parsing)
  const validPdfs = pdfs.filter(p => p.accessiblePdfUrl);

  console.log(`[BFI-PDF] Found ${validPdfs.length} PDFs with accessible versions`);
  validPdfs.forEach(p => console.log(`  - ${p.label}: ${p.accessiblePdfUrl}`));

  return validPdfs;
}

/**
 * Parse month range from label like "February / March 2026" or "January 2026"
 */
function parseMonthRange(label: string): { start: Date; end: Date } | null {
  const months: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3,
    may: 4, june: 5, july: 6, august: 7,
    september: 8, october: 9, november: 10, december: 11,
  };

  // Pattern: "February / March 2026" or "January 2026"
  const match = label.toLowerCase().match(/(\w+)(?:\s*\/\s*(\w+))?\s+(\d{4})/);
  if (!match) return null;

  const [, startMonth, endMonth, yearStr] = match;
  const year = parseInt(yearStr, 10);

  const startMonthNum = months[startMonth];
  if (startMonthNum === undefined) return null;

  const start = new Date(year, startMonthNum, 1);

  if (endMonth && months[endMonth] !== undefined) {
    const endMonthNum = months[endMonth];
    // End month might be in the next year if it wraps
    const endYear = endMonthNum < startMonthNum ? year + 1 : year;
    const end = new Date(endYear, endMonthNum + 1, 0); // Last day of end month
    return { start, end };
  }

  // Single month guide
  const end = new Date(year, startMonthNum + 1, 0); // Last day of the month
  return { start, end };
}

/**
 * Downloads a PDF and returns its content with hash.
 */
export async function downloadPDF(info: PDFInfo): Promise<FetchedPDF> {
  const url = info.accessiblePdfUrl || info.fullPdfUrl;
  if (!url) {
    throw new Error(`No PDF URL available for ${info.label}`);
  }

  console.log(`[BFI-PDF] Downloading ${info.label} from ${url}...`);

  const response = await proxyFetch(url);

  if (!response.ok) {
    // Log detailed error info for debugging
    const responseText = await response.text().catch(() => 'Unable to read response body');
    console.error(`[BFI-PDF] Download failed for ${url}`);
    console.error(`[BFI-PDF] Status: ${response.status} ${response.statusText}`);
    console.error(`[BFI-PDF] Response preview: ${responseText.slice(0, 500)}`);
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Calculate content hash for change detection
  const contentHash = createHash("sha256").update(buffer).digest("hex");

  console.log(`[BFI-PDF] Downloaded ${info.label} (${buffer.length} bytes, hash: ${contentHash.slice(0, 12)}...)`);

  return {
    info,
    buffer,
    contentHash,
    fetchedAt: new Date(),
  };
}

/**
 * Discovers and downloads the latest BFI guide PDF.
 * Returns the most recent guide that covers upcoming dates.
 */
export async function fetchLatestPDF(): Promise<FetchedPDF | null> {
  const pdfs = await discoverPDFs();

  if (pdfs.length === 0) {
    console.log("[BFI-PDF] No PDFs found");
    return null;
  }

  // Sort by start date descending to get the most recent
  const sortedPdfs = [...pdfs].sort((a, b) => {
    if (!a.months || !b.months) return 0;
    return b.months.start.getTime() - a.months.start.getTime();
  });

  // Find the first PDF that covers future dates
  const now = new Date();
  const relevantPdf = sortedPdfs.find(p => {
    if (!p.months) return false;
    return p.months.end >= now;
  });

  if (!relevantPdf) {
    console.log("[BFI-PDF] No PDF found covering future dates, using most recent");
    return downloadPDF(sortedPdfs[0]);
  }

  return downloadPDF(relevantPdf);
}

/**
 * Fetches all available PDFs that might contain relevant screenings.
 */
export async function fetchAllRelevantPDFs(): Promise<FetchedPDF[]> {
  const pdfs = await discoverPDFs();
  const now = new Date();

  // Filter to PDFs covering current or future dates
  const relevantPdfs = pdfs.filter(p => {
    if (!p.months) return true; // Include if we can't determine dates
    return p.months.end >= now;
  });

  console.log(`[BFI-PDF] Downloading ${relevantPdfs.length} relevant PDFs...`);

  const results: FetchedPDF[] = [];
  for (const pdf of relevantPdfs) {
    try {
      const fetched = await downloadPDF(pdf);
      results.push(fetched);
    } catch (error) {
      console.error(`[BFI-PDF] Failed to download ${pdf.label}:`, error);
    }
  }

  return results;
}
