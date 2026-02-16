/**
 * Manual Title Fixes + TMDB Matching
 *
 * Performs the work that the fallback enrichment agent (Claude Haiku) would
 * normally do, but using pre-identified title mappings instead of AI calls.
 *
 * Phase 1: Reclassify non-film content (events, TV, ballet, etc.)
 * Phase 2: Apply explicit title fixes and match to TMDB
 * Phase 3: Auto-match remaining films by searching TMDB with existing title + year
 */

import { db } from "../src/db";
import { films } from "../src/db/schema/films";
import { screenings } from "../src/db/schema/screenings";
import { eq, and, gte, isNull, inArray } from "drizzle-orm";
import { matchFilmToTMDB } from "../src/lib/tmdb/match";
import { getTMDBClient, TMDBClient } from "../src/lib/tmdb/client";
import type { ContentType } from "../src/types/film";

// ─── Non-film content to reclassify ────────────────────────────────────────

interface Reclassification {
  /** Substring match on title (case-insensitive) */
  pattern: string;
  action: "reclassify" | "delete";
  contentType?: ContentType;
}

const NON_FILM_PATTERNS: Reclassification[] = [
  // Events / talks / curated programs
  { pattern: "John Schlesinger Season", action: "delete" },
  { pattern: "Mystery Movie Marathon", action: "delete" },
  { pattern: "Mystery Movie", action: "delete" },
  { pattern: "Academy Awards Best Picture Winner", action: "delete" },
  { pattern: "Kieslowski Docs 1972-1980", action: "delete" },
  { pattern: "Photographers on Film", action: "delete" },
  { pattern: "Rave Culture", action: "delete" },
  { pattern: "Surrealism in Cinema", action: "delete" },
  { pattern: "What is Sixth Generation Chinese Cinema", action: "delete" },
  { pattern: "MY NAME IS MONDAY: A NIGHT OF", action: "delete" },
  { pattern: "Moving Image – A User's Manual", action: "delete" },
  { pattern: "Reflecting on Stuart Hall", action: "delete" },
  { pattern: "SHRIME TIME", action: "delete" },
  { pattern: "TV PARTY, TONIGHT!", action: "delete" },
  { pattern: "New Writings: The Story of British Video", action: "delete" },
  { pattern: "The Revolution Was Televised", action: "delete" },
  { pattern: "I'm Migrant Film Festival", action: "delete" },
  { pattern: "Koutaiba al Janabi and Nabeel Yasin", action: "delete" },
  { pattern: "London International Animation Festival presents", action: "delete" },
  { pattern: "Mihály Víg", action: "delete" }, // Concert/music event
  { pattern: "Peaking – Euphoric Psychedelia", action: "delete" },
  { pattern: "Bad Trip – Horror Psychedelia", action: "delete" },
  { pattern: "New American Revolution", action: "delete" },
  { pattern: "Iris LGBTQ+ Film Festival On the Move", action: "delete" },
  { pattern: "nventing the Future", action: "delete" }, // Truncated title
  { pattern: "An Introduction to Andrzej Wajda", action: "delete" },
  { pattern: "Arabic Cinema Club curated by", action: "delete" },
  { pattern: "The Ritzy's 115th Anniversary", action: "delete" },
  { pattern: "115 Years of the Ritzy", action: "delete" },
  { pattern: "Cinemagoers Welcome", action: "delete" },
  { pattern: "Sumud / Life endures", action: "delete" },
  { pattern: "Three stories of migration", action: "delete" },
  { pattern: "Shorts exploring relationships", action: "delete" },
  { pattern: "Short films by Isiah Medina", action: "delete" },
  { pattern: "BAFTA-nominated Shorts", action: "delete" },
  { pattern: "Neurasia, Argila & Aggression", action: "delete" },
  { pattern: "The Machine That Kills Bad People:", action: "delete" },
  { pattern: "Pip and Posy: The Cinema Show", action: "delete" },
  { pattern: "Search for Squarepants", action: "delete" },
  { pattern: "Pilot - Northwest Passage", action: "delete" },

  // TV series (not films)
  { pattern: "Big Mood series 2", action: "reclassify", contentType: "event" },
  { pattern: "Big Mood Series 2", action: "reclassify", contentType: "event" },

  // Ballet / opera (not films)
  { pattern: "Giselle", action: "reclassify", contentType: "live_broadcast" },
  { pattern: "Siegfried", action: "reclassify", contentType: "live_broadcast" },
];

// ─── Explicit title fixes ─────────────────────────────────────────────────

interface TitleFix {
  /** Exact title match (case-sensitive) */
  exactTitle: string;
  cleanTitle: string;
  year: number;
  /** If multiple films share same title, use ID for disambiguation */
  id?: string;
}

const TITLE_FIXES: TitleFix[] = [
  // Throwback / anniversary series
  { exactTitle: "Throwback: The Fifth Element", cleanTitle: "The Fifth Element", year: 1997 },
  { exactTitle: "Throwback: A Knight's Tale (25th Anniversary)", cleanTitle: "A Knight's Tale", year: 2001 },
  { exactTitle: "A Knight's Tale (25th Anniversary, 4k Restoration)", cleanTitle: "A Knight's Tale", year: 2001 },
  { exactTitle: "The Conversation (50th Anniversary 4K Restoration)", cleanTitle: "The Conversation", year: 1974 },
  { exactTitle: "RIVER'S EDGE: 40TH ANNIVERSARY", cleanTitle: "River's Edge", year: 1986 },
  { exactTitle: "Labyrinth - 40th Anniversary", cleanTitle: "Labyrinth", year: 1986 },
  { exactTitle: "Labyrinth (40th Anniversary)", cleanTitle: "Labyrinth", year: 1986 },
  { exactTitle: "La Vérité (4K Restoration)", cleanTitle: "La Vérité", year: 1960 },
  { exactTitle: "The Bride Is Much Too Beautiful (4K Restoration)", cleanTitle: "The Bride Is Much Too Beautiful", year: 1956 },
  { exactTitle: "Young Frankenstein (relaxed)", cleanTitle: "Young Frankenstein", year: 1974 },
  { exactTitle: "The Knack (35mm)", cleanTitle: "The Knack ...and How to Get It", year: 1965 },

  // Repertory with parenthetical info
  { exactTitle: "Le Mépris + Le Parti des choses", cleanTitle: "Contempt", year: 1963 },
  { exactTitle: "Amelie (Le fabuleux destin d'Amélie Poulain)", cleanTitle: "Amélie", year: 2001 },
  { exactTitle: "Daisies (Sedmikrásky)", cleanTitle: "Daisies", year: 1966 },
  { exactTitle: "Grease Sing-Along!", cleanTitle: "Grease", year: 1978 },
  { exactTitle: "DOA: A Right of Passage", cleanTitle: "D.O.A.: A Rite of Passage", year: 1980 },

  // Event prefix cleanup
  { exactTitle: "Funeral Parade presents \"Theorem [Teorema]\"", cleanTitle: "Theorem", year: 1968 },
  { exactTitle: "Funeral Parade presents \"Young Soul Rebels\"", cleanTitle: "Young Soul Rebels", year: 1991 },
  { exactTitle: "Spike Lee's SCHOOL DAZE", cleanTitle: "School Daze", year: 1988 },
  { exactTitle: "Team Picks: The Man in the White Suit", cleanTitle: "The Man in the White Suit", year: 1951 },
  { exactTitle: "CLUB ROOM: The Lodger (1927) with Live Score", cleanTitle: "The Lodger: A Story of the London Fog", year: 1927 },
  { exactTitle: "Lexi Seniors' Film Club: Out of Africa", cleanTitle: "Out of Africa", year: 1985 },
  { exactTitle: "Licorice Pizza + Pizza Night", cleanTitle: "Licorice Pizza", year: 2021 },
  { exactTitle: "Lunch Screening: The Princess Bride - Quote-Along", cleanTitle: "The Princess Bride", year: 1987 },
  { exactTitle: "Lob-sters Tennis Anniversary Screening:Challengers", cleanTitle: "Challengers", year: 2024 },
  { exactTitle: "East London Doc Club: Red Herring", cleanTitle: "Red Herring", year: 2025 },
  { exactTitle: "LAFS PRESENTS: THE CASTLE – 4th ANNUAL SCREENING", cleanTitle: "The Castle", year: 1997 },
  { exactTitle: "Girls in Film Presents: If I Had Legs I'd Kick You", cleanTitle: "If I Had Legs I'd Kick You", year: 2024 },
  { exactTitle: "Romy and Michele's High School Reunion + Performance by The Mildmay Choir", cleanTitle: "Romy and Michele's High School Reunion", year: 1997 },
  { exactTitle: "Spicy cocktail hour + Ash is Purest White", cleanTitle: "Ash Is Purest White", year: 2018 },
  { exactTitle: "Lost Reels Gas Food Lodging on 35mm", cleanTitle: "Gas Food Lodging", year: 1992 },
  { exactTitle: "Lost Reels Mi Vida Loca on 35mm", cleanTitle: "Mi Vida Loca", year: 1993 },
  { exactTitle: "Queer East presents Edhi Alice: Reverse", cleanTitle: "Edhi Alice: Reverse", year: 2025 },
  { exactTitle: "Queer East presents Miracle on Jongno Street", cleanTitle: "Miracle on Jongno Street", year: 2025 },
  { exactTitle: "MilkTea presents – UK Premiere: Last Days", cleanTitle: "Last Days", year: 2025 },
  { exactTitle: "Drag performance, Scarlett Spritzes + Sylvia Scarlett", cleanTitle: "Sylvia Scarlett", year: 1935 },
  { exactTitle: "SCARECROW IN A GARDEN OF CUCUMBERS (1972) with Avery McNeilly", cleanTitle: "Scarecrow in a Garden of Cucumbers", year: 1972 },
  { exactTitle: "RON ORMOND DOUBLE BILL: THE BURNING HELL & IF FOOTMEN TIRE YOU, WHAT WILL HORSES DO?", cleanTitle: "The Burning Hell", year: 1974 },
  { exactTitle: "TERMINAL ISLAND (1973) with Selina Robertson & Isabel Moir", cleanTitle: "Terminal Island", year: 1973 },
  { exactTitle: "KISS TOMORROW GOODBYE + THE MUSKETEERS OF PIG ALLEY", cleanTitle: "Kiss Tomorrow Goodbye", year: 1950 },
  { exactTitle: "Video Bazaar presents He Who Gets Slapped w/ Live Score", cleanTitle: "He Who Gets Slapped", year: 1924 },
  { exactTitle: "Women's History Month Special: My Dear Theo", cleanTitle: "My Dear Theo", year: 2025 },
  { exactTitle: "Sinners + Listening Party", cleanTitle: "Sinners", year: 2025 },
  { exactTitle: "The Ponds + Swim Peeps Social", cleanTitle: "The Ponds", year: 2025 },
  { exactTitle: "Katyn + pre-recorded intro by film critic Carmen Gray", cleanTitle: "Katyn", year: 2007 },
  { exactTitle: "Resurrection + live broadcast Q&A with Bi Gan", cleanTitle: "Resurrection", year: 2025 },
  { exactTitle: "Sentimental Value + Soundtrack", cleanTitle: "Sentimental Value", year: 2025 },
  { exactTitle: "Blue Has No Borders + Jessi Gutch Q&A", cleanTitle: "Blue Has No Borders", year: 2025 },
  { exactTitle: "Molly Vs the Machines + Recorded Q&A", cleanTitle: "Molly Vs the Machines", year: 2025 },
  { exactTitle: "Collective Monologue + director Jessica Sarah Rinland in conversation with Erika Balsom", cleanTitle: "Collective Monologue", year: 2025 },
  { exactTitle: "Earth Day 2026: Colossal Wreck with Josh Appignanesi", cleanTitle: "Colossal Wreck", year: 2025 },
  { exactTitle: "The Report + So Can I", cleanTitle: "The Report", year: 2025 },
  { exactTitle: "The Experience + Orderly or Disorderly", cleanTitle: "The Experience", year: 1973 },
  { exactTitle: "Death (True)² + The End of Evangelion", cleanTitle: "The End of Evangelion", year: 1997 },
  { exactTitle: "A Wedding Suit + Bread and Alley", cleanTitle: "A Wedding Suit", year: 1976 },
  { exactTitle: "The Traveler + Breaktime", cleanTitle: "The Traveler", year: 1974 },

  // ALL CAPS titles
  { exactTitle: "BLONDE DEATH", cleanTitle: "Blonde Death", year: 1984 },
  { exactTitle: "THE GIRL WHO LEPT THROUGH TIME", cleanTitle: "The Girl Who Leapt Through Time", year: 2006 },
  { exactTitle: "OPENING Eika Katappa on 35mm", cleanTitle: "Eika Katappa", year: 1969 },
  { exactTitle: "LONDON PREMIEREBouchra", cleanTitle: "Bouchra", year: 2025 },
  { exactTitle: "FATAL PULSE + SECRET COMEDY PERFORMANCE!", cleanTitle: "Fatal Pulse", year: 2018 },
  { exactTitle: "DANCE FREAK + VIDEO INTRO", cleanTitle: "Dance Freak", year: 2025 },
  { exactTitle: "VANILLA IS A TURKISH WORD", cleanTitle: "Vanilla Is a Turkish Word", year: 2025 },

  // Missing year hints for well-known films
  { exactTitle: "Casablanca", cleanTitle: "Casablanca", year: 1942 },
  { exactTitle: "Easy Rider", cleanTitle: "Easy Rider", year: 1969 },
  { exactTitle: "Dark City", cleanTitle: "Dark City", year: 1998 },
  { exactTitle: "Dirty Dancing", cleanTitle: "Dirty Dancing", year: 1987 },
  { exactTitle: "Fire Walk With Me", cleanTitle: "Twin Peaks: Fire Walk with Me", year: 1992 },
  { exactTitle: "Bottle Rocket", cleanTitle: "Bottle Rocket", year: 1996 },
  { exactTitle: "Interview With A Vampire", cleanTitle: "Interview with the Vampire", year: 1994 },
  { exactTitle: "Cartouche", cleanTitle: "Cartouche", year: 1962 },
  { exactTitle: "Audition", cleanTitle: "Audition", year: 1999 },
  { exactTitle: "Convoy", cleanTitle: "Convoy", year: 1978 },
  { exactTitle: "Damnation", cleanTitle: "Damnation", year: 1988 },
  { exactTitle: "Pretty Woman", cleanTitle: "Pretty Woman", year: 1990 },
  { exactTitle: "Speed Racer", cleanTitle: "Speed Racer", year: 2008 },
  { exactTitle: "Melancholia", cleanTitle: "Melancholia", year: 2011 },
  { exactTitle: "Man of Iron", cleanTitle: "Man of Iron", year: 1981 },
  { exactTitle: "Man of Hope", cleanTitle: "Man of Hope", year: 2013 },
  { exactTitle: "Walesa: Man of Hope", cleanTitle: "Walesa: Man of Hope", year: 2013 },
  { exactTitle: "Thief", cleanTitle: "Thief", year: 1981 },
  { exactTitle: "Police Story", cleanTitle: "Police Story", year: 1985 },
  { exactTitle: "The Hitcher", cleanTitle: "The Hitcher", year: 1986 },
  { exactTitle: "Hunger", cleanTitle: "Hunger", year: 2008 },
  { exactTitle: "Singin' in the Rain", cleanTitle: "Singin' in the Rain", year: 1952 },
  { exactTitle: "The Princess and the Frog", cleanTitle: "The Princess and the Frog", year: 2009 },
  { exactTitle: "Kung Fu Panda", cleanTitle: "Kung Fu Panda", year: 2008 },
  { exactTitle: "Thundercrack!", cleanTitle: "Thundercrack!", year: 1975 },
  { exactTitle: "The King & The Mockingbird", cleanTitle: "The King and the Mockingbird", year: 1980 },
  { exactTitle: "Vie privée (4K Restoration)", cleanTitle: "A Very Private Affair", year: 1962 },
  { exactTitle: "Vie privée (4K) + extended intro", cleanTitle: "A Very Private Affair", year: 1962 },
  { exactTitle: "Vie Privée + Introduction", cleanTitle: "A Very Private Affair", year: 1962 },
  { exactTitle: "Wallace & Gromit : A Matter of Loaf and Death", cleanTitle: "A Matter of Loaf and Death", year: 2008 },
  { exactTitle: "Looney Tunes: The Day the Earth Blew Up", cleanTitle: "Looney Tunes: The Day the Earth Blew Up - A Looney Tunes Movie", year: 2025 },
  { exactTitle: "How to Train Your Dragon", cleanTitle: "How to Train Your Dragon", year: 2025 },
  { exactTitle: "Frankenstein", cleanTitle: "Frankenstein", year: 2025 },
  { exactTitle: "F1® The Movie", cleanTitle: "F1", year: 2025 },
  { exactTitle: "Avala Film at 80: Dušan Makavejev's Man is Not a Bird", cleanTitle: "Man Is Not a Bird", year: 1965 },
  { exactTitle: "LITTLE AMELIE", cleanTitle: "Little Amélie", year: 2025 },
  { exactTitle: "Little Amélie - dubbed", cleanTitle: "Little Amélie", year: 2025 },
  { exactTitle: "Little Amélie - Family Screening", cleanTitle: "Little Amélie", year: 2025 },
  { exactTitle: "Little Amélie - subtitled", cleanTitle: "Little Amélie", year: 2025 },
  { exactTitle: "The Judgement Hall Festival: The Legend of Suram Fortress + Live Score", cleanTitle: "The Legend of the Suram Fortress", year: 1985 },
  { exactTitle: "Tribute to Claudia Cardinale: The Facts of Murder", cleanTitle: "The Facts of Murder", year: 1959 },

  // Cuban films
  { exactTitle: "Capablanca", cleanTitle: "Capablanca", year: 1987 },

  // Wajda trilogy
  { exactTitle: "The Human Condition - Part 1 - No Greater Love", cleanTitle: "The Human Condition I: No Greater Love", year: 1959 },
  { exactTitle: "The Human Condition - Part 2 - Road to Eternity", cleanTitle: "The Human Condition II: Road to Eternity", year: 1959 },
  { exactTitle: "The Human Condition - Part 3 - A Soldier's Prayer", cleanTitle: "The Human Condition III: A Soldier's Prayer", year: 1961 },

  // Craft Club prefix
  { exactTitle: "Craft Club: The Muppets", cleanTitle: "The Muppet Movie", year: 1979 },

  // Candyman - new 2026 version based on year tag
  { exactTitle: "Candyman", cleanTitle: "Candyman", year: 2021 },

  // Everybody to Kenmure Street
  { exactTitle: "Everybody to Kenmure Street (London Premiere", cleanTitle: "Everybody to Kenmure Street", year: 2025 },

  // Club Room prefix
  { exactTitle: "Club Room x Muse: The Chronology of Water", cleanTitle: "The Chronology of Water", year: 2025 },

  // Cinema Made in Italy
  { exactTitle: "Cinema Made in Italy Closing Night: Three Goodbyes", cleanTitle: "Three Goodbyes", year: 2026 },

  // Xiao Wu / Jia Zhangke
  { exactTitle: "Xiao Wu", cleanTitle: "Xiao Wu", year: 1997 },

  // Homeward Bound
  { exactTitle: "Homeward Bound", cleanTitle: "Homeward Bound: The Incredible Journey", year: 1993 },
];

// ─── TMDB IDs that should NOT be used for merges (false positives) ─────────

const BAD_MERGE_TMDB_IDS = new Set([
  1599207,  // "The Bird's Placebo" (not Hitchcock's "The Birds")
  45924,    // "The World According To Bush" (not Jia Zhangke's "The World")
  29545,    // "Auditions from Beyond" (not Takashi Miike's "Audition")
  912784,   // "O Doador Sexual" (not the 1980 DOA punk doc)
]);

// ─── Helper: Enrich film with TMDB data ────────────────────────────────────

async function enrichWithTMDB(
  filmId: string,
  tmdbId: number,
  displayTitle: string,
  posterPath: string | null,
  dryRun: boolean
): Promise<void> {
  const client = getTMDBClient();
  const details = await client.getFullFilmData(tmdbId);

  const updateData: Record<string, unknown> = {
    tmdbId,
    title: displayTitle,
    year: details.details.release_date
      ? parseInt(details.details.release_date.split("-")[0], 10)
      : undefined,
    matchConfidence: 0.95,
    matchStrategy: "manual-batch-fix",
    matchedAt: new Date(),
    updatedAt: new Date(),
  };

  if (details.details.overview) updateData.synopsis = details.details.overview;
  if (details.details.runtime) updateData.runtime = details.details.runtime;
  if (details.directors.length > 0) updateData.directors = details.directors;
  if (posterPath) updateData.posterUrl = TMDBClient.getPosterUrl(posterPath, "w500");
  if (details.details.backdrop_path) {
    updateData.backdropUrl = TMDBClient.getBackdropUrl(details.details.backdrop_path);
  }
  if (details.details.genres) {
    updateData.genres = details.details.genres.map((g: { name: string }) => g.name);
  }
  if (details.details.production_countries) {
    updateData.countries = details.details.production_countries.map(
      (c: { iso_3166_1: string }) => c.iso_3166_1
    );
  }
  if (details.details.spoken_languages) {
    updateData.languages = details.details.spoken_languages.map(
      (l: { iso_639_1: string }) => l.iso_639_1
    );
  }
  if (details.details.tagline) updateData.tagline = details.details.tagline;
  if (details.certification) updateData.certification = details.certification;
  if (details.cast.length > 0) updateData.cast = details.cast;
  if (details.details.imdb_id) updateData.imdbId = details.details.imdb_id;
  if (details.details.release_date) {
    const releaseYear = parseInt(details.details.release_date.split("-")[0], 10);
    const currentYear = new Date().getFullYear();
    updateData.isRepertory = releaseYear < currentYear - 2;
    updateData.decade = `${Math.floor(releaseYear / 10) * 10}s`;
  }

  if (!dryRun) {
    await db.update(films).set(updateData).where(eq(films.id, filmId));
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Get all unmatched upcoming films
  const now = new Date();
  const unmatchedFilms = await db
    .select({
      id: films.id,
      title: films.title,
      year: films.year,
      tmdbId: films.tmdbId,
      contentType: films.contentType,
    })
    .from(films)
    .innerJoin(screenings, eq(screenings.filmId, films.id))
    .where(
      and(
        gte(screenings.datetime, now),
        isNull(films.tmdbId),
        eq(films.contentType, "film")
      )
    )
    .groupBy(films.id, films.title, films.year, films.tmdbId, films.contentType)
    .orderBy(films.title);

  console.log(`Found ${unmatchedFilms.length} unmatched upcoming films\n`);

  // ─── Phase 1: Reclassify non-film content ─────────────────────────────

  console.log("=== Phase 1: Reclassify non-film content ===\n");
  let reclassified = 0;
  let deleted = 0;
  const processedIds = new Set<string>();

  for (const film of unmatchedFilms) {
    const match = NON_FILM_PATTERNS.find((p) =>
      film.title.toLowerCase().includes(p.pattern.toLowerCase())
    );
    if (!match) continue;

    processedIds.add(film.id);

    if (match.action === "delete") {
      console.log(`  🗑 Delete: "${film.title}"`);
      if (!dryRun) {
        await db.delete(screenings).where(eq(screenings.filmId, film.id));
        await db.delete(films).where(eq(films.id, film.id));
      }
      deleted++;
    } else {
      console.log(`  🔄 Reclassify → ${match.contentType}: "${film.title}"`);
      if (!dryRun) {
        await db
          .update(films)
          .set({ contentType: match.contentType!, updatedAt: new Date() })
          .where(eq(films.id, film.id));
      }
      reclassified++;
    }
  }

  console.log(`\n  Deleted: ${deleted}, Reclassified: ${reclassified}\n`);

  // ─── Phase 2: Explicit title fixes + TMDB match ──────────────────────

  console.log("=== Phase 2: Explicit title fixes + TMDB match ===\n");
  let fixMatched = 0;
  let fixMerged = 0;
  let fixFailed = 0;

  // Build lookup by exact title (may have multiple entries per title)
  const remainingFilms = unmatchedFilms.filter((f) => !processedIds.has(f.id));

  for (const film of remainingFilms) {
    // Find all matching fixes for this title
    const fix = TITLE_FIXES.find((f) =>
      f.id ? f.id === film.id : f.exactTitle === film.title
    );
    if (!fix) continue;

    processedIds.add(film.id);

    try {
      const match = await matchFilmToTMDB(fix.cleanTitle, {
        year: fix.year,
        skipAmbiguityCheck: true,
      });

      if (!match) {
        console.log(`  ✗ No TMDB: "${film.title}" → searched "${fix.cleanTitle}" (${fix.year})`);
        // Still update the title even without TMDB match
        if (!dryRun) {
          await db
            .update(films)
            .set({ title: fix.cleanTitle, year: fix.year, updatedAt: new Date() })
            .where(eq(films.id, film.id));
        }
        fixFailed++;
        continue;
      }

      // Check for bad merge targets
      if (BAD_MERGE_TMDB_IDS.has(match.tmdbId)) {
        console.log(`  ⚠ Blocked bad merge: "${film.title}" → TMDB ${match.tmdbId}`);
        fixFailed++;
        continue;
      }

      // Check for existing film with same TMDB ID
      const existing = await db
        .select({ id: films.id, title: films.title })
        .from(films)
        .where(eq(films.tmdbId, match.tmdbId))
        .limit(1);

      if (existing.length > 0 && existing[0].id !== film.id) {
        console.log(`  ⇒ Merge: "${film.title}" → "${existing[0].title}" (TMDB ${match.tmdbId})`);
        if (!dryRun) {
          // Move screenings, handling unique constraint conflicts
          const filmScreenings = await db
            .select({ id: screenings.id, datetime: screenings.datetime, cinemaId: screenings.cinemaId })
            .from(screenings)
            .where(eq(screenings.filmId, film.id));

          for (const s of filmScreenings) {
            try {
              await db
                .update(screenings)
                .set({ filmId: existing[0].id })
                .where(eq(screenings.id, s.id));
            } catch {
              // Duplicate screening - just delete it
              await db.delete(screenings).where(eq(screenings.id, s.id));
            }
          }
          await db.delete(films).where(eq(films.id, film.id));
        }
        fixMerged++;
      } else {
        // New match - enrich with full TMDB data
        await enrichWithTMDB(film.id, match.tmdbId, fix.cleanTitle, match.posterPath, dryRun);
        console.log(`  ✓ Fixed: "${film.title}" → "${fix.cleanTitle}" (${match.year}) [TMDB ${match.tmdbId}]`);
        fixMatched++;
      }

      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`  ✗ Error: "${film.title}":`, (error as Error).message);
      fixFailed++;
    }
  }

  console.log(`\n  Matched: ${fixMatched}, Merged: ${fixMerged}, Failed: ${fixFailed}\n`);

  // ─── Phase 3: Auto-match remaining with existing titles ──────────────

  console.log("=== Phase 3: Auto-match remaining films ===\n");
  let autoMatched = 0;
  let autoMerged = 0;
  let autoFailed = 0;

  const stillUnmatched = remainingFilms.filter((f) => !processedIds.has(f.id));

  for (const film of stillUnmatched) {
    if (!film.title || film.title.length < 2) continue;

    try {
      const match = await matchFilmToTMDB(film.title, {
        year: film.year || undefined,
        skipAmbiguityCheck: true,
      });

      if (!match) {
        console.log(`  ✗ No TMDB: "${film.title}" (${film.year || "no year"})`);
        autoFailed++;
        continue;
      }

      // Check for bad merge targets
      if (BAD_MERGE_TMDB_IDS.has(match.tmdbId)) {
        console.log(`  ⚠ Blocked bad merge: "${film.title}" → TMDB ${match.tmdbId}`);
        autoFailed++;
        continue;
      }

      const existing = await db
        .select({ id: films.id, title: films.title })
        .from(films)
        .where(eq(films.tmdbId, match.tmdbId))
        .limit(1);

      if (existing.length > 0 && existing[0].id !== film.id) {
        console.log(`  ⇒ Merge: "${film.title}" → "${existing[0].title}" (TMDB ${match.tmdbId})`);
        if (!dryRun) {
          const filmScreenings = await db
            .select({ id: screenings.id })
            .from(screenings)
            .where(eq(screenings.filmId, film.id));

          for (const s of filmScreenings) {
            try {
              await db
                .update(screenings)
                .set({ filmId: existing[0].id })
                .where(eq(screenings.id, s.id));
            } catch {
              await db.delete(screenings).where(eq(screenings.id, s.id));
            }
          }
          await db.delete(films).where(eq(films.id, film.id));
        }
        autoMerged++;
      } else {
        await enrichWithTMDB(film.id, match.tmdbId, match.title, match.posterPath, dryRun);
        console.log(`  ✓ Matched: "${film.title}" → "${match.title}" (${match.year}) [conf: ${match.confidence.toFixed(2)}]`);
        autoMatched++;
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`  ✗ Error: "${film.title}":`, (error as Error).message);
      autoFailed++;
    }
  }

  console.log(`\n  Matched: ${autoMatched}, Merged: ${autoMerged}, Failed: ${autoFailed}\n`);

  // ─── Summary ─────────────────────────────────────────────────────────

  const totalFixed = deleted + reclassified + fixMatched + fixMerged + autoMatched + autoMerged;
  console.log("=== TOTAL SUMMARY ===");
  console.log(`  Starting unmatched:  ${unmatchedFilms.length}`);
  console.log(`  Non-film deleted:    ${deleted}`);
  console.log(`  Non-film reclassed:  ${reclassified}`);
  console.log(`  Title fix matched:   ${fixMatched}`);
  console.log(`  Title fix merged:    ${fixMerged}`);
  console.log(`  Auto matched:        ${autoMatched}`);
  console.log(`  Auto merged:         ${autoMerged}`);
  console.log(`  Still unmatched:     ${unmatchedFilms.length - totalFixed}`);
  if (dryRun) console.log(`  (DRY RUN - no changes made)`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
