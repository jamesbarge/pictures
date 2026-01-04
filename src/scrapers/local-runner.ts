#!/usr/bin/env npx tsx
/**
 * Local Scraper Runner
 *
 * Interactive CLI for running Playwright scrapers locally.
 * Shows scraper status and lets you easily run the ones that need updating.
 *
 * Usage:
 *   npm run scrape:local          # Interactive mode
 *   npm run scrape:local -- --all # Run all Playwright scrapers
 *   npm run scrape:local -- --stale # Run only stale scrapers (>24h old)
 */

import { db } from "@/db";
import { screenings, cinemas } from "@/db/schema";
import { sql, desc, eq } from "drizzle-orm";
import { spawn } from "child_process";
import * as readline from "readline";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

// Playwright scrapers that need local execution (Cloudflare protected)
const PLAYWRIGHT_SCRAPERS = [
  { id: "bfi-southbank", name: "BFI Southbank", script: "scrape:bfi", priority: 1 },
  { id: "bfi-imax", name: "BFI IMAX", script: "scrape:bfi", priority: 1 }, // Same script as BFI
  { id: "barbican-cinema", name: "Barbican Cinema", script: "scrape:barbican", priority: 2 },
  { id: "curzon-soho", name: "Curzon (all venues)", script: "scrape:curzon", priority: 1, isChain: true },
  { id: "picturehouse-central", name: "Picturehouse (all venues)", script: "scrape:picturehouse", priority: 1, isChain: true },
  { id: "everyman-screen-on-the-green", name: "Everyman (all venues)", script: "scrape:everyman", priority: 1, isChain: true },
  { id: "electric-portobello", name: "Electric Portobello", script: "scrape:electric", priority: 3 },
  { id: "lexi-cinema", name: "Lexi Cinema", script: "scrape:lexi", priority: 3 },
  { id: "phoenix-cinema", name: "Phoenix Cinema", script: "scrape:phoenix", priority: 3 },
];

// Dedupe by script (chains share the same script)
const UNIQUE_SCRIPTS = Array.from(
  new Map(PLAYWRIGHT_SCRAPERS.map(s => [s.script, s])).values()
).sort((a, b) => a.priority - b.priority);

interface ScraperStatus {
  id: string;
  name: string;
  script: string;
  lastScreening: Date | null;
  screeningCount: number;
  hoursAgo: number | null;
  isStale: boolean;
}

async function getScraperStatus(): Promise<ScraperStatus[]> {
  const results: ScraperStatus[] = [];

  for (const scraper of UNIQUE_SCRIPTS) {
    // For chains, we check any cinema that starts with the prefix
    let cinemaFilter: string;
    if (scraper.isChain) {
      const prefix = scraper.id.split("-")[0]; // "curzon", "picturehouse", "everyman"
      cinemaFilter = `${prefix}%`;
    } else {
      cinemaFilter = scraper.id;
    }

    // Get latest screening and count for this cinema
    const [stats] = await db
      .select({
        lastScreening: sql<Date>`MAX(${screenings.scrapedAt})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(screenings)
      .innerJoin(cinemas, eq(screenings.cinemaId, cinemas.id))
      .where(
        scraper.isChain
          ? sql`${cinemas.id} LIKE ${cinemaFilter}`
          : eq(cinemas.id, scraper.id)
      );

    const lastScreening = stats?.lastScreening ? new Date(stats.lastScreening) : null;
    const hoursAgo = lastScreening
      ? Math.round((Date.now() - lastScreening.getTime()) / (1000 * 60 * 60))
      : null;

    results.push({
      id: scraper.id,
      name: scraper.name,
      script: scraper.script,
      lastScreening,
      screeningCount: Number(stats?.count) || 0,
      hoursAgo,
      isStale: hoursAgo === null || hoursAgo > 24,
    });
  }

  return results;
}

function formatStatus(status: ScraperStatus): string {
  const { name, hoursAgo, screeningCount, isStale } = status;

  let timeStr: string;
  let timeColor: string;

  if (hoursAgo === null) {
    timeStr = "never";
    timeColor = colors.red;
  } else if (hoursAgo < 1) {
    timeStr = "< 1 hour ago";
    timeColor = colors.green;
  } else if (hoursAgo < 24) {
    timeStr = `${hoursAgo}h ago`;
    timeColor = colors.green;
  } else if (hoursAgo < 48) {
    timeStr = `${hoursAgo}h ago`;
    timeColor = colors.yellow;
  } else {
    timeStr = `${Math.round(hoursAgo / 24)}d ago`;
    timeColor = colors.red;
  }

  const statusIcon = isStale ? `${colors.yellow}!${colors.reset}` : `${colors.green}✓${colors.reset}`;
  const countStr = `${colors.dim}(${screeningCount} screenings)${colors.reset}`;

  return `${statusIcon} ${name.padEnd(25)} ${timeColor}${timeStr.padEnd(12)}${colors.reset} ${countStr}`;
}

async function runScraper(script: string, name: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\n${colors.cyan}━━━ Running ${name} ━━━${colors.reset}\n`);

    const proc = spawn("npm", ["run", script], {
      stdio: "inherit",
      shell: true,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        console.log(`\n${colors.green}✓ ${name} completed successfully${colors.reset}`);
        resolve(true);
      } else {
        console.log(`\n${colors.red}✗ ${name} failed with code ${code}${colors.reset}`);
        resolve(false);
      }
    });

    proc.on("error", (err) => {
      console.log(`\n${colors.red}✗ ${name} error: ${err.message}${colors.reset}`);
      resolve(false);
    });
  });
}

async function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const runAll = args.includes("--all");
  const runStale = args.includes("--stale");

  console.log(`\n${colors.bright}${colors.magenta}🎬 Local Scraper Runner${colors.reset}\n`);
  console.log(`${colors.dim}Checking scraper status...${colors.reset}\n`);

  const statuses = await getScraperStatus();

  // Display status
  console.log(`${colors.bright}Playwright Scrapers (require local execution):${colors.reset}\n`);
  statuses.forEach((s, i) => {
    console.log(`  ${colors.dim}${i + 1}.${colors.reset} ${formatStatus(s)}`);
  });

  const staleCount = statuses.filter(s => s.isStale).length;
  console.log(`\n${colors.dim}─────────────────────────────────────────────────${colors.reset}`);

  if (staleCount > 0) {
    console.log(`${colors.yellow}${staleCount} scraper(s) are stale (>24h since last update)${colors.reset}`);
  } else {
    console.log(`${colors.green}All scrapers are up to date!${colors.reset}`);
  }

  // Determine which scrapers to run
  let toRun: ScraperStatus[] = [];

  if (runAll) {
    toRun = statuses;
    console.log(`\n${colors.cyan}Running all Playwright scrapers...${colors.reset}`);
  } else if (runStale) {
    toRun = statuses.filter(s => s.isStale);
    if (toRun.length === 0) {
      console.log(`\n${colors.green}No stale scrapers to run!${colors.reset}`);
      process.exit(0);
    }
    console.log(`\n${colors.cyan}Running ${toRun.length} stale scraper(s)...${colors.reset}`);
  } else {
    // Interactive mode
    console.log(`\n${colors.bright}Options:${colors.reset}`);
    console.log(`  ${colors.cyan}a${colors.reset} - Run all Playwright scrapers`);
    console.log(`  ${colors.cyan}s${colors.reset} - Run only stale scrapers (${staleCount})`);
    console.log(`  ${colors.cyan}1-${statuses.length}${colors.reset} - Run specific scraper`);
    console.log(`  ${colors.cyan}q${colors.reset} - Quit`);

    const answer = await promptUser(`\n${colors.bright}What would you like to do? ${colors.reset}`);

    if (answer === "q" || answer === "") {
      console.log(`\n${colors.dim}Goodbye!${colors.reset}\n`);
      process.exit(0);
    } else if (answer === "a") {
      toRun = statuses;
    } else if (answer === "s") {
      toRun = statuses.filter(s => s.isStale);
      if (toRun.length === 0) {
        console.log(`\n${colors.green}No stale scrapers to run!${colors.reset}\n`);
        process.exit(0);
      }
    } else {
      const num = parseInt(answer);
      if (num >= 1 && num <= statuses.length) {
        toRun = [statuses[num - 1]];
      } else {
        console.log(`\n${colors.red}Invalid option${colors.reset}\n`);
        process.exit(1);
      }
    }
  }

  // Run the scrapers
  console.log(`\n${colors.bright}Starting ${toRun.length} scraper(s)...${colors.reset}`);

  const results: { name: string; success: boolean }[] = [];

  for (const scraper of toRun) {
    const success = await runScraper(scraper.script, scraper.name);
    results.push({ name: scraper.name, success });
  }

  // Summary
  console.log(`\n${colors.bright}${colors.magenta}━━━ Summary ━━━${colors.reset}\n`);

  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (succeeded.length > 0) {
    console.log(`${colors.green}✓ Succeeded (${succeeded.length}):${colors.reset}`);
    succeeded.forEach(r => console.log(`  - ${r.name}`));
  }

  if (failed.length > 0) {
    console.log(`${colors.red}✗ Failed (${failed.length}):${colors.reset}`);
    failed.forEach(r => console.log(`  - ${r.name}`));
  }

  console.log();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(console.error);
