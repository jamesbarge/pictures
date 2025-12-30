/**
 * Debug script for Lexi Cinema
 */
import { chromium } from "playwright";

async function debug() {
  console.log("[debug-lexi] Starting browser...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Capture network requests
  const apiCalls: string[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("api") || url.includes(".json") || url.includes("ajax")) {
      apiCalls.push(url);
    }
  });

  try {
    console.log("[debug-lexi] Navigating to Lexi homepage...");
    await page.goto("https://thelexicinema.co.uk/TheLexiCinema.dll/Home", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    console.log("[debug-lexi] Page loaded. URL:", page.url());
    console.log("[debug-lexi] Title:", await page.title());

    // Check for film cards
    const h3Count = await page.locator("h3").count();
    console.log(`[debug-lexi] Found ${h3Count} h3 elements`);

    const linkCount = await page.locator("a").count();
    console.log(`[debug-lexi] Found ${linkCount} links`);

    // Look for WhatsOn links
    const whatsOnLinks = await page.locator('a[href*="WhatsOn"]').count();
    console.log(`[debug-lexi] Found ${whatsOnLinks} WhatsOn links`);

    // Get sample text content
    const bodyText = await page.locator("body").textContent();
    if (bodyText) {
      console.log("[debug-lexi] Sample body text (first 2000 chars):");
      console.log(bodyText.substring(0, 2000));
    }

    // Look for date patterns in page text
    const datePatterns = bodyText?.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/gi) || [];
    console.log(`\n[debug-lexi] Found ${datePatterns.length} date patterns:`, datePatterns.slice(0, 10));

    // Get all h3 texts
    const h3Texts = await page.locator("h3").allTextContents();
    console.log("\n[debug-lexi] H3 texts:", h3Texts.slice(0, 20));

    // Check for API calls
    console.log("\n[debug-lexi] API calls detected:", apiCalls);

    // Save screenshot
    await page.screenshot({ path: "/tmp/lexi-debug.png", fullPage: true });
    console.log("[debug-lexi] Screenshot saved to /tmp/lexi-debug.png");

    // Get HTML sample
    const html = await page.content();
    console.log("\n[debug-lexi] HTML sample (first 3000 chars):");
    console.log(html.substring(0, 3000));

    // Look at the structure around film cards
    console.log("\n[debug-lexi] Investigating WhatsOn link structure...");
    const filmLinks = await page.locator('a[href*="WhatsOn?f="]').all();
    for (let i = 0; i < Math.min(5, filmLinks.length); i++) {
      const link = filmLinks[i];
      const href = await link.getAttribute("href") || "";
      const innerHtml = await link.innerHTML();
      const parentHtml = await link.evaluate(el => el.parentElement?.outerHTML?.substring(0, 500) || "");
      console.log(`\n[debug-lexi] Film ${i + 1}:`);
      console.log(`  href: ${href}`);
      console.log(`  innerHTML (first 200): ${innerHtml.substring(0, 200)}`);
      console.log(`  parent (first 500): ${parentHtml}`);
    }

    // Navigate directly to a film detail page (avoid modal issues)
    console.log("\n[debug-lexi] Navigating directly to film detail page...");
    await page.goto("https://thelexicinema.co.uk/TheLexiCinema.dll/WhatsOn?f=9276501", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    const detailUrl = page.url();
    console.log(`[debug-lexi] Detail page URL: ${detailUrl}`);

    const detailBody = await page.locator("body").textContent() || "";
    console.log(`[debug-lexi] Detail page text (first 3000 chars):`);
    console.log(detailBody.substring(0, 3000));

    // Look for time patterns on detail page
    const timePatterns = detailBody.match(/\d{1,2}:\d{2}(?:\s*(am|pm))?/gi) || [];
    console.log(`\n[debug-lexi] Time patterns on detail page: ${timePatterns.slice(0, 20)}`);

    // Get detail page HTML to see structure
    const detailHtml = await page.content();

    // Look for session/showtime containers
    console.log("\n[debug-lexi] Looking for session containers...");
    const sessionContainers = await page.locator('.session, .showtime, [class*="session"], [class*="show"]').count();
    console.log(`  Found ${sessionContainers} session containers`);

    // Look for date elements
    const dateElements = await page.locator('[class*="date"], .day, .performance').count();
    console.log(`  Found ${dateElements} date-related elements`);

    // Try to find a pattern with dates and times
    const performanceLinks = await page.locator('a[href*="Performances"], a[href*="performance"], a[id*="Performance"]').all();
    console.log(`  Found ${performanceLinks.length} performance links`);

    for (let i = 0; i < Math.min(5, performanceLinks.length); i++) {
      const link = performanceLinks[i];
      const text = await link.textContent() || "";
      const href = await link.getAttribute("href") || "";
      const id = await link.getAttribute("id") || "";
      console.log(`  Performance ${i + 1}: text="${text.trim()}", href="${href}", id="${id}"`);
    }

    // Look for date groupings in the HTML
    const dateMatch = detailHtml.match(/class="[^"]*date[^"]*"[^>]*>([^<]+)</gi);
    console.log(`\n[debug-lexi] Date class matches: ${(dateMatch || []).slice(0, 5)}`);

    // Get the full body text to analyze structure
    console.log(`\n[debug-lexi] Detail body text around times:`);
    const fullText = detailBody.replace(/\s+/g, ' ');

    // Find patterns like "Mon 30 Dec ... 12:00" or dates near times
    const dateTimePattern = fullText.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^0-9]{0,50}\d{1,2}:\d{2}/gi);
    console.log(`  Date-time patterns: ${(dateTimePattern || []).slice(0, 10)}`);

  } catch (err) {
    console.error("[debug-lexi] Error:", err);
  } finally {
    await browser.close();
  }
}

debug().catch(console.error);
