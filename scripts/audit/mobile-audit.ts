#!/usr/bin/env npx tsx
/**
 * Mobile UI Audit — Layout, Touch Targets, and Visual Checks
 *
 * Tests every major page at 3 mobile viewports for:
 *   - Horizontal overflow
 *   - Elements exceeding viewport bounds
 *   - Touch target sizing (WCAG 2.5.8: 24px minimum)
 *   - Dropdown/panel containment
 *
 * Usage:
 *   npx tsx scripts/audit/mobile-audit.ts                 # test against localhost:5173
 *   npx tsx scripts/audit/mobile-audit.ts --prod          # test against pictures.london
 *   npx tsx scripts/audit/mobile-audit.ts --no-ai         # accepted and ignored (the AI check was removed)
 *   npx tsx scripts/audit/mobile-audit.ts --screenshots   # save screenshots for each page
 *
 * Prerequisites:
 *   - Frontend dev server running (npm run dev in frontend/)
 */

import { chromium, type Browser, type BrowserContext, type Page } from "rebrowser-playwright";
import * as fs from "fs";
import * as path from "path";

// ── Configuration ──────────────────────────────────────────────────

const args = process.argv.slice(2);
const USE_PROD = args.includes("--prod");
const SAVE_SCREENSHOTS = args.includes("--screenshots");

const BASE_URL = USE_PROD ? "https://pictures.london" : "http://localhost:5173";
const OBSIDIAN_VAULT = "/Users/jamesbarge/Documents/Obsidian Vault/Pictures";

const today = new Date().toISOString().split("T")[0];
const OBSIDIAN_OUTPUT = `${OBSIDIAN_VAULT}/mobile-audit-${today}.md`;
const SCREENSHOT_DIR = "scripts/audit/results/mobile-screenshots";

const MIN_TOUCH_TARGET = 24; // WCAG 2.5.8 minimum (px)

// ── Viewports ──────────────────────────────────────────────────────

interface Viewport {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}

const VIEWPORTS: Viewport[] = [
  { name: "Small Android (360x640)", width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: "iPhone SE (375x667)", width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: "iPhone 12 Pro (390x844)", width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];

// ── Routes ─────────────────────────────────────────────────────────

const ROUTES = [
  "/",
  "/cinemas",
  "/tonight",
  "/this-weekend",
  "/reachable",
  "/directors",
  "/festivals",
  "/search?q=godfather",
  "/about",
  "/settings",
  "/map",
  "/seasons",
  "/letterboxd",
];

// ── Issue Types ────────────────────────────────────────────────────

type IssueSeverity = "critical" | "warning" | "info";

interface MobileIssue {
  severity: IssueSeverity;
  viewport: string;
  route: string;
  category: string;
  message: string;
  details?: Record<string, unknown>;
}

// ── Helpers ────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function logPhase(phase: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${phase}`);
  console.log(`${"═".repeat(60)}\n`);
}

// ── Layout Checks ──────────────────────────────────────────────────

async function checkHorizontalOverflow(page: Page, route: string, viewport: Viewport): Promise<MobileIssue[]> {
  const issues: MobileIssue[] = [];

  const overflow = await page.evaluate(() => {
    const bodyWidth = document.body.scrollWidth;
    const viewportWidth = window.innerWidth;
    return { bodyWidth, viewportWidth, hasOverflow: bodyWidth > viewportWidth + 1 };
  });

  if (overflow.hasOverflow) {
    issues.push({
      severity: "critical",
      viewport: viewport.name,
      route,
      category: "horizontal_overflow",
      message: `Body scrollWidth (${overflow.bodyWidth}px) exceeds viewport (${overflow.viewportWidth}px)`,
      details: overflow,
    });
  }

  return issues;
}

async function checkElementBounds(page: Page, route: string, viewport: Viewport): Promise<MobileIssue[]> {
  const issues: MobileIssue[] = [];

  const overflowingElements = await page.evaluate(() => {
    const vw = window.innerWidth;
    const results: Array<{ tag: string; className: string; right: number; width: number }> = [];

    // Check key interactive/container elements
    const selectors = [
      ".dropdown-panel",
      ".cinema-dropdown",
      ".datetime-dropdown",
      ".search-input",
      ".filter-grid",
      ".film-grid",
      ".cinema-grid",
      ".table-view",
      ".mobile-panel",
      "header",
      "main",
      "nav",
    ];

    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      els.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > vw + 2 || rect.left < -2) {
          results.push({
            tag: el.tagName.toLowerCase(),
            className: sel,
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          });
        }
      });
    }

    return results;
  });

  for (const el of overflowingElements) {
    issues.push({
      severity: "critical",
      viewport: viewport.name,
      route,
      category: "element_overflow",
      message: `${el.className} exceeds viewport bounds (right: ${el.right}px, width: ${el.width}px)`,
      details: el,
    });
  }

  return issues;
}

// ── Touch Target Checks ────────────────────────────────────────────

async function checkTouchTargets(page: Page, route: string, viewport: Viewport): Promise<MobileIssue[]> {
  const issues: MobileIssue[] = [];

  const smallTargets = await page.evaluate((minSize: number) => {
    const results: Array<{ selector: string; width: number; height: number; text: string }> = [];

    // Check all interactive elements
    const interactiveSelectors = [
      "a.screening-pill",
      ".cinema-card",
      ".calculate-btn",
      ".preset-btn",
      ".cal-day",
      ".nav-link",
      ".picker-trigger",
      ".table-row",
    ];

    for (const sel of interactiveSelectors) {
      const els = document.querySelectorAll(sel);
      els.forEach((el) => {
        const rect = el.getBoundingClientRect();
        // Only check visible, on-screen elements
        if (rect.width === 0 || rect.height === 0) return;
        if (rect.top > window.innerHeight * 2) return; // off-screen

        if (rect.height < minSize || rect.width < minSize) {
          results.push({
            selector: sel,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            text: (el.textContent ?? "").trim().slice(0, 40),
          });
        }
      });
    }

    return results;
  }, MIN_TOUCH_TARGET);

  // Group by selector to avoid flooding with hundreds of identical issues
  const grouped = new Map<string, typeof smallTargets>();
  for (const target of smallTargets) {
    const existing = grouped.get(target.selector) ?? [];
    existing.push(target);
    grouped.set(target.selector, existing);
  }

  grouped.forEach((targets, selector) => {
    const sample = targets[0];
    issues.push({
      severity: "warning",
      viewport: viewport.name,
      route,
      category: "small_touch_target",
      message: `${targets.length}x ${selector} below ${MIN_TOUCH_TARGET}px minimum (sample: ${sample.width}x${sample.height}px "${sample.text}")`,
      details: { count: targets.length, sample },
    });
  });

  return issues;
}

// ── Dropdown Interaction Checks ────────────────────────────────────

async function checkDropdowns(page: Page, route: string, viewport: Viewport): Promise<MobileIssue[]> {
  const issues: MobileIssue[] = [];

  // Only check dropdowns on the homepage where filters exist
  if (route !== "/") return issues;

  // Try to open the FILTERS mobile panel first
  try {
    const filterToggle = page.getByRole("button", { name: "Toggle filters" });
    if (await filterToggle.isVisible({ timeout: 2000 })) {
      await filterToggle.click();
      await page.waitForTimeout(400);
    }
  } catch {
    // No filter toggle visible — may already be showing
  }

  // Check cinema picker dropdown
  try {
    const cinemaBtn = page.getByLabel("Cinema filter").last();
    if (await cinemaBtn.isVisible({ timeout: 1000 })) {
      await cinemaBtn.click();
      await page.waitForTimeout(300);

      const dropdown = page.locator(".dropdown-panel");
      if (await dropdown.isVisible({ timeout: 1000 })) {
        const box = await dropdown.boundingBox();
        if (box) {
          if (box.x + box.width > viewport.width + 2) {
            issues.push({
              severity: "critical",
              viewport: viewport.name,
              route,
              category: "dropdown_overflow",
              message: `Cinema dropdown right edge (${Math.round(box.x + box.width)}px) exceeds viewport (${viewport.width}px)`,
              details: { x: box.x, width: box.width, right: box.x + box.width },
            });
          }
          if (box.x < -2) {
            issues.push({
              severity: "critical",
              viewport: viewport.name,
              route,
              category: "dropdown_overflow",
              message: `Cinema dropdown left edge (${Math.round(box.x)}px) is off-screen`,
            });
          }
          // Check if dropdown extends beyond viewport bottom without scroll
          if (box.y + box.height > viewport.height) {
            const hasScroll = await dropdown.evaluate((el) => el.scrollHeight > el.clientHeight);
            if (!hasScroll) {
              issues.push({
                severity: "warning",
                viewport: viewport.name,
                route,
                category: "dropdown_no_scroll",
                message: `Cinema dropdown extends beyond viewport bottom (${Math.round(box.y + box.height)}px) without scrolling`,
              });
            }
          }
        }
      }

      // Close dropdown
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
  } catch {
    // Cinema picker may not be available
  }

  return issues;
}

// ── Report Generator ───────────────────────────────────────────────

function generateReport(issues: MobileIssue[], durationMs: number): string {
  const critical = issues.filter((i) => i.severity === "critical");
  const warnings = issues.filter((i) => i.severity === "warning");
  const info = issues.filter((i) => i.severity === "info");

  const lines: string[] = [
    `# Mobile UI Audit — ${today}`,
    "",
    `**Target:** ${BASE_URL}`,
    `**Viewports tested:** ${VIEWPORTS.map((v) => v.name).join(", ")}`,
    `**Routes tested:** ${ROUTES.length}`,
    `**Duration:** ${(durationMs / 1000).toFixed(1)}s`,
    "",
    `## Summary`,
    "",
    `| Severity | Count |`,
    `|----------|-------|`,
    `| Critical | ${critical.length} |`,
    `| Warning  | ${warnings.length} |`,
    `| Info     | ${info.length} |`,
    `| **Total** | **${issues.length}** |`,
    "",
  ];

  // Group by viewport
  for (const vp of VIEWPORTS) {
    const vpIssues = issues.filter((i) => i.viewport === vp.name);
    if (vpIssues.length === 0) {
      lines.push(`## ${vp.name} — ✅ No issues`);
      lines.push("");
      continue;
    }

    lines.push(`## ${vp.name} — ${vpIssues.length} issues`);
    lines.push("");

    // Group by route
    const byRoute = new Map<string, MobileIssue[]>();
    for (const issue of vpIssues) {
      const existing = byRoute.get(issue.route) ?? [];
      existing.push(issue);
      byRoute.set(issue.route, existing);
    }

    byRoute.forEach((routeIssues, route) => {
      lines.push(`### ${route}`);
      for (const issue of routeIssues) {
        const icon = issue.severity === "critical" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵";
        lines.push(`- ${icon} **${issue.category}**: ${issue.message}`);
      }
      lines.push("");
    });
  }

  return lines.join("\n");
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const allIssues: MobileIssue[] = [];

  logPhase("Mobile UI Audit");
  log(`Target: ${BASE_URL}`);
  log(`Viewports: ${VIEWPORTS.map((v) => `${v.name} (${v.width}x${v.height})`).join(", ")}`);
  log(`Routes: ${ROUTES.length}`);

  // Create screenshot dir if needed
  if (SAVE_SCREENSHOTS) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // Launch browser for layout/touch checks
  const browser: Browser = await chromium.launch({ headless: true });

  for (const viewport of VIEWPORTS) {
    logPhase(`Testing: ${viewport.name} (${viewport.width}x${viewport.height})`);

    const context: BrowserContext = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    });

    const page = await context.newPage();

    for (const route of ROUTES) {
      const url = `${BASE_URL}${route}`;
      log(`  ${route}`);

      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
        await page.waitForTimeout(1000); // Let animations settle

        // Save screenshot if requested
        if (SAVE_SCREENSHOTS) {
          const filename = `${viewport.width}x${viewport.height}_${route.replace(/[/\\?=]/g, "_")}.png`;
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: true });
        }

        // Run all checks
        const overflowIssues = await checkHorizontalOverflow(page, route, viewport);
        const boundsIssues = await checkElementBounds(page, route, viewport);
        const touchIssues = await checkTouchTargets(page, route, viewport);
        const dropdownIssues = await checkDropdowns(page, route, viewport);

        allIssues.push(...overflowIssues, ...boundsIssues, ...touchIssues, ...dropdownIssues);

        const routeTotal = overflowIssues.length + boundsIssues.length + touchIssues.length + dropdownIssues.length;
        if (routeTotal > 0) {
          log(`    → ${routeTotal} issues found`);
        }
      } catch (err) {
        log(`    ⚠ Failed to test ${route}: ${err instanceof Error ? err.message : err}`);
        allIssues.push({
          severity: "critical",
          viewport: viewport.name,
          route,
          category: "page_load_failure",
          message: `Failed to load page: ${err instanceof Error ? err.message : err}`,
        });
      }
    }

    await context.close();
  }

  await browser.close();

  // ── Report ─────────────────────────────────────────────────────

  const durationMs = Date.now() - startTime;
  const report = generateReport(allIssues, durationMs);

  logPhase("Results");

  const critical = allIssues.filter((i) => i.severity === "critical").length;
  const warnings = allIssues.filter((i) => i.severity === "warning").length;

  console.log(report);

  // Save to Obsidian vault
  try {
    fs.mkdirSync(path.dirname(OBSIDIAN_OUTPUT), { recursive: true });
    fs.writeFileSync(OBSIDIAN_OUTPUT, report);
    log(`\nReport saved to: ${OBSIDIAN_OUTPUT}`);
  } catch (err) {
    log(`⚠ Could not save to Obsidian: ${err instanceof Error ? err.message : err}`);
  }

  // Save JSON results
  const jsonOutput = `scripts/audit/results/mobile-audit-${today}.json`;
  fs.mkdirSync(path.dirname(jsonOutput), { recursive: true });
  fs.writeFileSync(jsonOutput, JSON.stringify({ issues: allIssues, summary: { critical, warnings, total: allIssues.length, duration: durationMs } }, null, 2));
  log(`JSON saved to: ${jsonOutput}`);

  log(`\nDone in ${(durationMs / 1000).toFixed(1)}s — ${critical} critical, ${warnings} warnings, ${allIssues.length} total issues`);

  // Exit with error code if critical issues found
  if (critical > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
