/**
 * Browser utilities for Playwright-based scraping
 * Handles sites with JavaScript rendering and bot protection
 * Uses playwright-extra with stealth plugin to bypass Cloudflare
 */

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "playwright";

// Add stealth plugin to evade bot detection
chromium.use(StealthPlugin());

let browser: Browser | null = null;

/**
 * Get or create a shared browser instance with stealth mode
 */
export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    // Use "new" headless mode which is harder to detect than legacy headless
    browser = await chromium.launch({
      headless: true,
      args: [
        "--headless=new", // New headless mode, harder to detect
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1920,1080",
        "--start-maximized",
        "--disable-extensions",
        "--disable-plugins",
      ],
    });
  }
  return browser;
}

/**
 * Close the shared browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

/**
 * Create a new page with anti-detection settings
 */
export async function createPage(): Promise<Page> {
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    locale: "en-GB",
    timezoneId: "Europe/London",
  });

  const page = await context.newPage();

  // Remove webdriver property to avoid detection
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });

  return page;
}

/**
 * Fetch HTML from a URL using Playwright
 */
export async function fetchWithBrowser(
  url: string,
  options: {
    waitFor?: string; // CSS selector to wait for
    timeout?: number;
    delay?: number; // Additional delay after page load
  } = {}
): Promise<string> {
  const { waitFor, timeout = 30000, delay = 2000 } = options;

  const page = await createPage();

  try {
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout,
    });

    // Wait for specific element if provided
    if (waitFor) {
      await page.waitForSelector(waitFor, { timeout });
    }

    // Additional delay to ensure dynamic content loads
    if (delay > 0) {
      await page.waitForTimeout(delay);
    }

    return await page.content();
  } finally {
    await page.close();
  }
}
