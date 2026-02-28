/**
 * Targeted enrichment for upcoming films missing TMDB data
 *
 * Finds films with tmdbId IS NULL that have screenings in the next 14 days,
 * cleans their titles (HTML entities, event prefixes, AI extraction),
 * fixes bad years, and attempts TMDB matching.
 *
 * Usage:
 *   npm run enrich:upcoming            # run for real
 *   npm run enrich:upcoming -- --dry-run  # preview only
 */

import { db } from "@/db";
import { films, screenings } from "@/db/schema";
import { eq, isNull, gte, and } from "drizzle-orm";
import { matchFilmToTMDB, getTMDBClient } from "@/lib/tmdb";
import { extractFilmTitle } from "@/lib/title-extraction";
import { cleanFilmTitle } from "@/scrapers/pipeline";

const DRY_RUN = process.argv.includes("--dry-run");
const RATE_LIMIT_MS = 300;

// ---------------------------------------------------------------------------
// HTML entity decoding
// ---------------------------------------------------------------------------

/**
 * Decode HTML entities and mojibake (double-encoded UTF-8 via Latin-1).
 * Example: "S&Atilde;&iexcl;t&Atilde;&iexcl;ntang&Atilde;&sup3;" → "Sátántangó"
 */
export function decodeHtmlEntities(text: string): string {
  // First pass: named + numeric HTML entities
  let decoded = text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Common mojibake: UTF-8 bytes interpreted as Latin-1 then HTML-encoded
  // &Atilde; is Ã (0xC3), which is the leading byte of 2-byte UTF-8 sequences
  if (/&[A-Za-z]+;/.test(decoded)) {
    // Build a full entity map for Latin-1 range used in mojibake
    const entityMap: Record<string, number> = {
      "&Atilde;": 0xC3, "&Acirc;": 0xC2, "&Aring;": 0xC5,
      "&AElig;": 0xC6, "&Ccedil;": 0xC7, "&Egrave;": 0xC8,
      "&Eacute;": 0xC9, "&Euml;": 0xCB, "&Iacute;": 0xCD,
      "&Icirc;": 0xCE, "&Ntilde;": 0xD1, "&Ograve;": 0xD2,
      "&Oacute;": 0xD3, "&Ouml;": 0xD6, "&Uacute;": 0xDA,
      "&Uuml;": 0xDC,
      // Continuation bytes (0x80–0xBF range)
      "&iexcl;": 0xA1, "&cent;": 0xA2, "&pound;": 0xA3,
      "&curren;": 0xA4, "&yen;": 0xA5, "&brvbar;": 0xA6,
      "&sect;": 0xA7, "&uml;": 0xA8, "&copy;": 0xA9,
      "&ordf;": 0xAA, "&laquo;": 0xAB, "&not;": 0xAC,
      "&shy;": 0xAD, "&reg;": 0xAE, "&macr;": 0xAF,
      "&deg;": 0xB0, "&plusmn;": 0xB1, "&sup2;": 0xB2,
      "&sup3;": 0xB3, "&acute;": 0xB4, "&micro;": 0xB5,
      "&para;": 0xB6, "&middot;": 0xB7, "&cedil;": 0xB8,
      "&sup1;": 0xB9, "&ordm;": 0xBA, "&raquo;": 0xBB,
      "&frac14;": 0xBC, "&frac12;": 0xBD, "&frac34;": 0xBE,
      "&iquest;": 0xBF,
    };

    // Replace entity pairs that represent UTF-8 byte sequences
    const entityPattern = /&[A-Za-z]+;/g;
    const bytes: number[] = [];
    let lastIndex = 0;
    let result = "";
    let match: RegExpExecArray | null;

    while ((match = entityPattern.exec(decoded)) !== null) {
      const entity = match[0];
      const byteVal = entityMap[entity];

      if (byteVal !== undefined) {
        // Flush any plain text before this entity
        if (match.index > lastIndex) {
          // If we had accumulated bytes, try to decode them first
          if (bytes.length > 0) {
            result += new TextDecoder().decode(new Uint8Array(bytes));
            bytes.length = 0;
          }
          result += decoded.slice(lastIndex, match.index);
        }
        bytes.push(byteVal);
        lastIndex = match.index + entity.length;
      } else {
        // Unknown entity: flush bytes and keep it as-is
        if (bytes.length > 0) {
          result += new TextDecoder().decode(new Uint8Array(bytes));
          bytes.length = 0;
        }
        if (match.index > lastIndex) {
          result += decoded.slice(lastIndex, match.index);
        }
        result += entity;
        lastIndex = match.index + entity.length;
      }
    }

    // Flush remaining
    if (bytes.length > 0) {
      result += new TextDecoder().decode(new Uint8Array(bytes));
    }
    if (lastIndex < decoded.length) {
      result += decoded.slice(lastIndex);
    }

    if (result) {
      decoded = result;
    }
  }

  return decoded;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no changes will be written\n" : "Enriching upcoming films with missing TMDB data\n");

  const now = new Date();

  // Find films with upcoming screenings that have no TMDB data
  const rows = await db
    .selectDistinct({
      id: films.id,
      title: films.title,
      year: films.year,
      directors: films.directors,
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(
      and(
        isNull(films.tmdbId),
        gte(screenings.datetime, now),
      )
    );

  console.log(`Found ${rows.length} films with upcoming screenings missing TMDB data\n`);

  if (rows.length === 0) {
    console.log("Nothing to do!");
    return;
  }

  const client = getTMDBClient();
  let matched = 0;
  let unmatched = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const film = rows[i];
    const originalTitle = film.title;

    // Step 1: Decode HTML entities
    let cleanedTitle = decodeHtmlEntities(originalTitle);
    const htmlDecoded = cleanedTitle !== originalTitle;

    // Step 2: Apply cleanFilmTitle (strip event prefixes/suffixes)
    cleanedTitle = cleanFilmTitle(cleanedTitle);
    const prefixStripped = cleanedTitle !== decodeHtmlEntities(originalTitle);

    // Step 3: AI title extraction for complex cases
    let aiExtracted = false;
    if (cleanedTitle.includes(":") || cleanedTitle.includes("+") || cleanedTitle.includes("\u2013")) {
      try {
        const extraction = await extractFilmTitle(cleanedTitle);
        if (extraction.confidence !== "low" && extraction.filmTitle !== cleanedTitle) {
          cleanedTitle = extraction.filmTitle;
          aiExtracted = true;
        }
        // Small delay for AI calls
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch {
        // AI extraction failed, continue with cleaned title
      }
    }

    // Step 4: Fix bad years — if year > 2025 it's likely scraper metadata, not the film's year
    let yearHint = film.year ?? undefined;
    if (yearHint && yearHint > 2025) {
      console.log(`  Warning: Clearing suspicious year ${yearHint} for "${cleanedTitle}"`);
      yearHint = undefined;
    }

    const changes: string[] = [];
    if (htmlDecoded) changes.push("decoded HTML entities");
    if (prefixStripped) changes.push("stripped prefix/suffix");
    if (aiExtracted) changes.push("AI-cleaned title");
    if (film.year && film.year > 2025) changes.push(`cleared bad year ${film.year}`);

    console.log(`[${i + 1}/${rows.length}] "${originalTitle}"`);
    if (changes.length > 0) {
      console.log(`  -> "${cleanedTitle}" (${changes.join(", ")})`);
    }

    // Step 5: Match to TMDB
    try {
      const tmdbMatch = await matchFilmToTMDB(cleanedTitle, {
        year: yearHint,
        director: film.directors[0],
        skipAmbiguityCheck: true, // We've already cleaned the title
      });

      if (!tmdbMatch) {
        console.log(`  X No TMDB match\n`);
        unmatched++;
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
        continue;
      }

      console.log(`  -> TMDB match: "${tmdbMatch.title}" (${tmdbMatch.year}) [ID: ${tmdbMatch.tmdbId}, confidence: ${tmdbMatch.confidence.toFixed(2)}]`);

      if (DRY_RUN) {
        console.log(`  [dry-run] Would update film record\n`);
        matched++;
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
        continue;
      }

      // Check if another film already has this TMDB ID (duplicate)
      const existing = await db
        .select({ id: films.id, title: films.title })
        .from(films)
        .where(eq(films.tmdbId, tmdbMatch.tmdbId))
        .limit(1);

      if (existing.length > 0) {
        console.log(`  ~ Skipped: TMDB ID ${tmdbMatch.tmdbId} already assigned to "${existing[0].title}" (duplicate)\n`);
        skipped++;
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
        continue;
      }

      // Step 6: Fetch full TMDB data and update the film record
      const details = await client.getFullFilmData(tmdbMatch.tmdbId);

      await db
        .update(films)
        .set({
          tmdbId: tmdbMatch.tmdbId,
          imdbId: details.details.imdb_id || null,
          title: details.details.title,
          originalTitle: details.details.original_title,
          year: tmdbMatch.year,
          runtime: details.details.runtime || null,
          directors: details.directors.length > 0 ? details.directors : film.directors,
          cast: details.cast.length > 0 ? details.cast : [],
          genres: details.details.genres.map((g) => g.name.toLowerCase()),
          countries: details.details.production_countries.map((c) => c.iso_3166_1),
          languages: details.details.spoken_languages.map((l) => l.iso_639_1),
          certification: details.certification || null,
          synopsis: details.details.overview || null,
          tagline: details.details.tagline || null,
          posterUrl: details.details.poster_path
            ? `https://image.tmdb.org/t/p/w500${details.details.poster_path}`
            : null,
          backdropUrl: details.details.backdrop_path
            ? `https://image.tmdb.org/t/p/w1280${details.details.backdrop_path}`
            : null,
          tmdbRating: details.details.vote_average,
          matchConfidence: tmdbMatch.confidence,
          matchStrategy: "auto-enrichment-upcoming",
          matchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(films.id, film.id));

      console.log(`  -> Updated film record\n`);
      matched++;
    } catch (error) {
      console.error(`  X Error: ${error}\n`);
      skipped++;
    }

    // Rate limit TMDB calls
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`Matched: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);
  if (skipped > 0) console.log(`Skipped (errors): ${skipped}`);
  console.log(`Total: ${rows.length}`);
  if (DRY_RUN) console.log("\n(Dry run — no changes were written)");
}

// Only run when called directly (not when imported as a module)
const isDirectRun =
  process.argv[1]?.endsWith("enrich-upcoming-films.ts") ||
  process.argv[1]?.endsWith("enrich-upcoming-films.js");

if (isDirectRun) {
  main()
    .then(() => {
      console.log("\nDone!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
