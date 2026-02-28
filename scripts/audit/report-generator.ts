/**
 * Report Generator
 * Produces an Obsidian-formatted markdown report from audit results.
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { AuditResult, AuditIssue, CinemaDetailData } from "./types";

/**
 * Generate the Obsidian markdown report.
 */
export function generateObsidianReport(result: AuditResult, outputPath: string): void {
  const { summary, issues, cinemaReports } = result;

  const critical = issues.filter((i) => i.severity === "critical");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  const lines: string[] = [];

  // Frontmatter
  lines.push("---");
  lines.push("tags: [audit, data-quality, front-end]");
  lines.push(`date: ${result.timestamp.split("T")[0]}`);
  lines.push("---");
  lines.push("");

  // Title
  lines.push(`# Front-End Audit Report — ${result.timestamp.split("T")[0]}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Cinemas tested | ${summary.cinemasTested}/${summary.cinemasTotal} |`);
  lines.push(`| Films tested | ${summary.filmsTested} |`);
  lines.push(`| Booking links tested | ${summary.bookingLinksTested} |`);
  lines.push(`| **Issues found** | **${summary.issuesTotal}** (${summary.issuesCritical} critical, ${summary.issuesWarning} warning, ${summary.issuesInfo} info) |`);
  lines.push(`| Duration | ${Math.round(summary.duration / 1000)}s |`);
  lines.push("");

  // Critical Issues
  if (critical.length > 0) {
    lines.push("## Critical Issues");
    lines.push("");

    // Missing Posters
    const missingPosters = critical.filter((i) => i.category === "missing_poster");
    if (missingPosters.length > 0) {
      lines.push(`### Missing Posters (${missingPosters.length})`);
      lines.push("");
      lines.push("| Film | Film ID | Link |");
      lines.push("|------|---------|------|");
      for (const issue of missingPosters) {
        const filmId = issue.details.filmId || "";
        lines.push(`| ${escMd(issue.entity)} | \`${filmId}\` | [view](${issue.url || ""}) |`);
      }
      lines.push("");
    }

    // Broken Booking Links
    const brokenLinks = critical.filter((i) => i.category === "broken_booking_link");
    if (brokenLinks.length > 0) {
      lines.push(`### Broken Booking Links (${brokenLinks.length})`);
      lines.push("");
      lines.push("| Film | Cinema | Status | URL |");
      lines.push("|------|--------|--------|-----|");
      for (const issue of brokenLinks) {
        const cinema = String(issue.details.cinema || "");
        const status = String(issue.details.status || issue.details.error || "error");
        const url = String(issue.details.url || "");
        lines.push(`| ${escMd(issue.entity)} | ${escMd(cinema)} | ${status} | \`${truncate(url, 60)}\` |`);
      }
      lines.push("");
    }

    // Non-Film Content
    const nonFilm = critical.filter((i) => i.category === "non_film_content");
    if (nonFilm.length > 0) {
      lines.push(`### Non-Film Content in Calendar (${nonFilm.length})`);
      lines.push("");
      lines.push("| Title | Film ID | Why Flagged |");
      lines.push("|-------|---------|-------------|");
      for (const issue of nonFilm) {
        const filmId = issue.details.filmId || "";
        const pattern = issue.details.pattern || "";
        lines.push(`| ${escMd(issue.entity)} | \`${filmId}\` | Pattern: \`${pattern}\` |`);
      }
      lines.push("");
    }

    // No Screenings
    const noScreenings = critical.filter((i) => i.category === "no_screenings");
    if (noScreenings.length > 0) {
      lines.push(`### Cinemas with No Screenings (${noScreenings.length})`);
      lines.push("");
      for (const issue of noScreenings) {
        lines.push(`- **${escMd(issue.entity)}** — [view](${issue.url || ""})`);
      }
      lines.push("");
    }

    // Broken Pages
    const brokenPages = critical.filter((i) => i.category === "broken_page");
    if (brokenPages.length > 0) {
      lines.push(`### Broken Pages (${brokenPages.length})`);
      lines.push("");
      for (const issue of brokenPages) {
        lines.push(`- **${escMd(issue.entity)}** — ${issue.message}`);
      }
      lines.push("");
    }

    // Duplicate Cinemas
    const dupes = critical.filter((i) => i.category === "duplicate_cinema");
    if (dupes.length > 0) {
      lines.push(`### Duplicate Cinemas (${dupes.length})`);
      lines.push("");
      for (const issue of dupes) {
        lines.push(`- **${escMd(issue.entity)}** — slugs: \`${issue.details.slug1}\`, \`${issue.details.slug2}\``);
      }
      lines.push("");
    }
  }

  // Warnings
  if (warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");

    // Title Cleaning Issues
    const titleIssues = warnings.filter((i) => i.category === "title_not_clean");
    if (titleIssues.length > 0) {
      lines.push(`### Title Cleaning Issues (${titleIssues.length})`);
      lines.push("");
      lines.push("| Title | Film ID | Issue |");
      lines.push("|-------|---------|-------|");
      for (const issue of titleIssues) {
        const filmId = issue.details.filmId || "";
        lines.push(`| ${escMd(issue.entity)} | \`${filmId}\` | ${escMd(issue.message)} |`);
      }
      lines.push("");
    }

    // Data Gaps (missing TMDB data)
    const dataGaps = warnings.filter((i) => i.category === "missing_tmdb_data");
    if (dataGaps.length > 0) {
      lines.push(`### Data Gaps — Missing TMDB Data (${dataGaps.length})`);
      lines.push("");
      // Group by film
      const byFilm = new Map<string, AuditIssue[]>();
      for (const issue of dataGaps) {
        const key = String(issue.details.filmId || issue.entity);
        if (!byFilm.has(key)) byFilm.set(key, []);
        byFilm.get(key)!.push(issue);
      }
      lines.push("| Film | Missing |");
      lines.push("|------|---------|");
      for (const [filmId, filmIssues] of Array.from(byFilm.entries())) {
        const missing = filmIssues.map((i) => {
          if (i.message.includes("no year")) return "year";
          if (i.message.includes("no directors")) return "directors";
          if (i.message.includes("no synopsis")) return "synopsis";
          if (i.message.includes("no TMDB")) return "TMDB link";
          return "data";
        });
        lines.push(`| ${escMd(filmIssues[0].entity)} (\`${filmId}\`) | ${missing.join(", ")} |`);
      }
      lines.push("");
    }

    // Screening Gaps
    const gaps = warnings.filter((i) => i.category === "screening_gap");
    if (gaps.length > 0) {
      lines.push(`### Screening Date Gaps (${gaps.length})`);
      lines.push("");
      for (const issue of gaps) {
        lines.push(`- **${escMd(issue.entity)}** — last visible date: "${issue.details.lastDate}", ${issue.details.screeningCount} screenings`);
      }
      lines.push("");
    }

    // Unreasonable Times
    const badTimes = warnings.filter((i) => i.category === "unreasonable_time");
    if (badTimes.length > 0) {
      lines.push(`### Unreasonable Screening Times (${badTimes.length})`);
      lines.push("");
      lines.push("| Film | Cinema | Time | Date |");
      lines.push("|------|--------|------|------|");
      for (const issue of badTimes) {
        lines.push(`| ${escMd(issue.entity)} | ${escMd(String(issue.details.cinema))} | ${issue.details.time} | ${issue.details.date} |`);
      }
      lines.push("");
    }

    // Card-Detail Mismatches
    const mismatches = warnings.filter((i) => i.category === "card_detail_mismatch");
    if (mismatches.length > 0) {
      lines.push(`### Card-Detail Mismatches (${mismatches.length})`);
      lines.push("");
      for (const issue of mismatches) {
        lines.push(`- ${escMd(issue.message)}`);
      }
      lines.push("");
    }

    // Booking Domain Mismatches
    const domainMismatches = warnings.filter((i) => i.category === "booking_domain_mismatch");
    if (domainMismatches.length > 0) {
      lines.push(`### Booking Domain Mismatches (${domainMismatches.length})`);
      lines.push("");
      lines.push("| Film | Cinema | Got Domain | Expected |");
      lines.push("|------|--------|-----------|----------|");
      for (const issue of domainMismatches) {
        lines.push(`| ${escMd(issue.entity)} | ${escMd(String(issue.details.cinema))} | \`${issue.details.hostname}\` | ${(issue.details.expectedDomains as string[]).map(d => `\`${d}\``).join(", ")} |`);
      }
      lines.push("");
    }

    // Duplicate Film Cards
    const dupCards = warnings.filter((i) => i.category === "duplicate_film_card");
    if (dupCards.length > 0) {
      lines.push(`### Duplicate Film Cards (${dupCards.length})`);
      lines.push("");
      for (const issue of dupCards) {
        lines.push(`- **${escMd(issue.entity)}** (\`${issue.details.filmId}\`)`);
      }
      lines.push("");
    }
  }

  // Info
  if (infos.length > 0) {
    lines.push("## Info");
    lines.push("");

    // Suspicious Screening Patterns
    const suspicious = infos.filter((i) => i.category === "suspicious_screening_pattern");
    if (suspicious.length > 0) {
      lines.push(`### Suspicious Screening Patterns (${suspicious.length})`);
      lines.push("");
      lines.push("| Film | Cinema | Date | Count | Times |");
      lines.push("|------|--------|------|-------|-------|");
      for (const issue of suspicious) {
        const times = (issue.details.times as string[]).join(", ");
        lines.push(`| ${escMd(issue.entity)} | ${escMd(String(issue.details.cinema))} | ${issue.details.date} | ${issue.details.count} | ${times} |`);
      }
      lines.push("");
    }
  }

  // Cinema Coverage Report
  if (cinemaReports.length > 0) {
    lines.push("## Cinema Coverage Report");
    lines.push("");
    lines.push("| Cinema | Screenings | Latest Date | Issues |");
    lines.push("|--------|------------|-------------|--------|");

    for (const cinema of cinemaReports.sort((a, b) => a.name.localeCompare(b.name))) {
      const cinemaIssues = issues.filter(
        (i) => i.details.slug === cinema.slug || i.details.cinemaSlug === cinema.slug
      );
      const issueCount = cinemaIssues.length;
      const latestDate = cinema.latestScreeningDate || "—";

      lines.push(`| ${escMd(cinema.name)} | ${cinema.screeningCount} | ${latestDate} | ${issueCount} |`);
    }
    lines.push("");
  }

  // Next Steps
  lines.push("## Next Steps");
  lines.push("");

  const brokenBookingCinemas = new Set(
    critical.filter((i) => i.category === "broken_booking_link").map((i) => String(i.details.cinema))
  );
  if (brokenBookingCinemas.size > 0) {
    lines.push(`- [ ] Fix broken booking links for: ${Array.from(brokenBookingCinemas).join(", ")}`);
  }

  const noScreeningCinemas = critical.filter((i) => i.category === "no_screenings").map((i) => i.entity);
  if (noScreeningCinemas.length > 0) {
    lines.push(`- [ ] Re-scrape cinemas with no screenings: ${noScreeningCinemas.join(", ")}`);
  }

  const gapCinemas = warnings.filter((i) => i.category === "screening_gap").map((i) => i.entity);
  if (gapCinemas.length > 0) {
    lines.push(`- [ ] Re-scrape cinemas with date gaps: ${gapCinemas.join(", ")}`);
  }

  const titleIssueCount = warnings.filter((i) => i.category === "title_not_clean").length;
  if (titleIssueCount > 0) {
    lines.push(`- [ ] Clean ${titleIssueCount} titles with remaining prefixes/suffixes`);
  }

  const missingPosterCount = critical.filter((i) => i.category === "missing_poster").length;
  if (missingPosterCount > 0) {
    lines.push(`- [ ] Run enrichment for ${missingPosterCount} films missing posters`);
  }

  const nonFilmCount = critical.filter((i) => i.category === "non_film_content").length;
  if (nonFilmCount > 0) {
    lines.push(`- [ ] Review and filter out ${nonFilmCount} non-film content items`);
  }

  lines.push("");

  // Write file
  const content = lines.join("\n");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content, "utf-8");
}

/**
 * Save raw JSON results for machine consumption.
 */
export function saveJsonResults(result: AuditResult, outputPath: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");
}

// Helpers
function escMd(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
