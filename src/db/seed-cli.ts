#!/usr/bin/env npx tsx
/**
 * Unified Seed CLI
 *
 * Usage:
 *   npm run db:seed                  Run all production seeds (cinemas + festivals)
 *   npm run db:seed -- --cinemas     Seed cinemas only
 *   npm run db:seed -- --festivals   Seed festivals only
 *   npm run db:seed -- --screenings  Seed test screenings (development only)
 *   npm run db:seed -- --all         Run all seeds including test data
 *   npm run db:seed -- --list        List available seed operations
 */

import { db } from "./index";
import { cinemas, films, screenings, festivals } from "./schema";
import { v4 as uuidv4, v4 } from "uuid";
import { addDays, setHours, setMinutes } from "date-fns";
import type { ScreeningFormat, EventType } from "@/types/screening";
import { sql } from "drizzle-orm";
import { getCinemasSeedData } from "@/config/cinema-registry";

// ============================================================================
// Cinema Seed Data — sourced from the cinema registry (single source of truth)
// via getCinemasSeedData(). The old hand-maintained LONDON_CINEMAS array was
// removed 2026-07-14: it had drifted to deprecated ids (garden-cinema,
// genesis-mile-end) with stale addresses, so `db:seed:cinemas` created empty
// zombie cinemas and left canonical `garden` without coordinates (no map pin).
// ============================================================================


// ============================================================================
// Festival Seed Data
// ============================================================================

const LONDON_FESTIVALS = [
  {
    id: v4(),
    name: "BFI London Film Festival 2026",
    slug: "bfi-lff-2026",
    shortName: "LFF",
    year: 2026,
    description: "The UK's leading film festival, showcasing the best of world cinema.",
    websiteUrl: "https://www.bfi.org.uk/london-film-festival",
    logoUrl: null,
    startDate: "2026-10-07",
    endDate: "2026-10-18",
    programmAnnouncedDate: "2026-09-02",
    memberSaleDate: new Date("2026-09-07T10:00:00+01:00"),
    publicSaleDate: new Date("2026-09-15T10:00:00+01:00"),
    genreFocus: ["international", "arthouse", "documentary", "shorts"],
    venues: ["bfi-southbank", "bfi-imax", "curzon-soho"],
    isActive: true,
  },
  {
    id: v4(),
    name: "FrightFest 2026",
    slug: "frightfest-2026",
    shortName: "FrightFest",
    year: 2026,
    description: "The UK's premier horror and fantasy film festival.",
    websiteUrl: "https://www.frightfest.co.uk",
    logoUrl: null,
    startDate: "2026-08-27",
    endDate: "2026-08-31",
    programmAnnouncedDate: "2026-07-15",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-07-20T10:00:00+01:00"),
    genreFocus: ["horror", "fantasy", "sci-fi", "thriller", "cult"],
    venues: ["vue-leicester-square", "prince-charles-cinema"],
    isActive: true,
  },
  {
    id: v4(),
    name: "BFI Flare 2026",
    slug: "bfi-flare-2026",
    shortName: "Flare",
    year: 2026,
    description: "The UK's longest-running LGBTQIA+ film festival.",
    websiteUrl: "https://www.bfi.org.uk/flare",
    logoUrl: null,
    startDate: "2026-03-18",
    endDate: "2026-03-29",
    programmAnnouncedDate: "2026-02-20",
    memberSaleDate: new Date("2026-02-25T10:00:00+00:00"),
    publicSaleDate: new Date("2026-03-04T10:00:00+00:00"),
    genreFocus: ["lgbtqia", "international", "documentary", "shorts"],
    venues: ["bfi-southbank"],
    isActive: true,
  },
  {
    id: v4(),
    name: "London Short Film Festival 2026",
    slug: "lsff-2026",
    shortName: "LSFF",
    year: 2026,
    description: "The UK's leading short film festival.",
    websiteUrl: "https://shortfilms.org.uk",
    logoUrl: null,
    startDate: "2026-01-09",
    endDate: "2026-01-18",
    programmAnnouncedDate: "2025-12-10",
    memberSaleDate: null,
    publicSaleDate: new Date("2025-12-15T10:00:00+00:00"),
    genreFocus: ["shorts", "animation", "experimental", "music-video"],
    venues: ["ica", "bfi-southbank", "rio-cinema"],
    isActive: true,
  },
];

// ============================================================================
// Test Films Data (for development)
// ============================================================================

const TEST_FILMS = [
  {
    title: "2001: A Space Odyssey",
    year: 1968,
    directors: ["Stanley Kubrick"],
    cast: ["Keir Dullea", "Gary Lockwood"],
    genres: ["science fiction", "drama"],
    runtime: 149,
    posterUrl: "https://image.tmdb.org/t/p/w500/ve72VxNqjGM69Pk8gWyuEnRq2mF.jpg",
    synopsis: "Humanity finds a mysterious object buried beneath the lunar surface.",
    isRepertory: true,
    decade: "1960s",
    tmdbRating: 8.3,
    tmdbPopularity: 25.1,
  },
  {
    title: "In the Mood for Love",
    year: 2000,
    directors: ["Wong Kar-wai"],
    cast: ["Tony Leung Chiu-wai", "Maggie Cheung"],
    genres: ["drama", "romance"],
    runtime: 98,
    posterUrl: "https://image.tmdb.org/t/p/w500/iYypPT4bhqXfq1b6EnmxvRt6b2Y.jpg",
    synopsis: "Two neighbors form a strong bond after discovering their spouses are having an affair.",
    isRepertory: true,
    decade: "2000s",
    tmdbRating: 8.1,
    tmdbPopularity: 22.8,
  },
  {
    title: "The Substance",
    year: 2024,
    directors: ["Coralie Fargeat"],
    cast: ["Demi Moore", "Margaret Qualley"],
    genres: ["horror", "science fiction"],
    runtime: 141,
    posterUrl: "https://image.tmdb.org/t/p/w500/lqoMzCcZYEFK729d6qzt349fB4o.jpg",
    synopsis: "A fading celebrity discovers a black market drug.",
    isRepertory: false,
    decade: "2020s",
    tmdbRating: 7.3,
    tmdbPopularity: 64.4,
  },
  {
    title: "Stalker",
    year: 1979,
    directors: ["Andrei Tarkovsky"],
    cast: ["Alisa Freyndlikh", "Aleksandr Kaydanovskiy"],
    genres: ["science fiction", "drama"],
    runtime: 162,
    posterUrl: "https://image.tmdb.org/t/p/w500/3PVLxpQbwLXcBGUV3AAVnqj7rmJ.jpg",
    synopsis: "A guide leads two men through an apocalyptic wasteland called the Zone.",
    isRepertory: true,
    decade: "1970s",
    tmdbRating: 8.1,
    tmdbPopularity: 18.7,
  },
];

// ============================================================================
// Seed Functions
// ============================================================================

async function seedCinemas(): Promise<number> {
  console.log("  Seeding cinemas...");
  let count = 0;

  for (const { active, ...cinema } of getCinemasSeedData()) {
    await db
      .insert(cinemas)
      // isActive is set ONLY on INSERT (respects the registry's `active` flag —
      // e.g. everyman-walthamstow stays inactive) and kept OUT of the update
      // `set` below, so re-seeding never flips a manually-toggled venue.
      .values({ ...cinema, isActive: active })
      .onConflictDoUpdate({
        target: cinemas.id,
        set: {
          name: cinema.name,
          shortName: cinema.shortName,
          chain: cinema.chain,
          address: cinema.address,
          // COALESCE only the NULLABLE columns so a null-in-registry value never
          // blanks existing DB data — the registry has coords for only ~53/71
          // cinemas, and 11 live-pinned venues (lexi, several Picturehouse/
          // Everyman) have no registry coords. Registry wins when present; DB
          // value preserved when the registry is null.
          coordinates: sql`coalesce(excluded.coordinates, ${cinemas.coordinates})`,
          screens: sql`coalesce(excluded.screens, ${cinemas.screens})`,
          description: sql`coalesce(excluded.description, ${cinemas.description})`,
          // NOT NULL columns — honest overwrite from the registry (source of truth).
          programmingFocus: cinema.programmingFocus,
          features: cinema.features,
          website: cinema.website,
          bookingUrl: cinema.bookingUrl,
          dataSourceType: cinema.dataSourceType,
          updatedAt: new Date(),
        },
      });
    count++;
  }

  return count;
}

async function seedFestivals(): Promise<number> {
  console.log("  Seeding festivals...");
  let count = 0;

  for (const festival of LONDON_FESTIVALS) {
    await db
      .insert(festivals)
      .values(festival)
      .onConflictDoUpdate({
        target: festivals.slug,
        set: {
          name: festival.name,
          shortName: festival.shortName,
          description: festival.description,
          websiteUrl: festival.websiteUrl,
          startDate: festival.startDate,
          endDate: festival.endDate,
          programmAnnouncedDate: festival.programmAnnouncedDate,
          memberSaleDate: festival.memberSaleDate,
          publicSaleDate: festival.publicSaleDate,
          genreFocus: festival.genreFocus,
          venues: festival.venues,
          isActive: festival.isActive,
          updatedAt: new Date(),
        },
      });
    count++;
  }

  return count;
}

async function seedTestScreenings(): Promise<{ films: number; screenings: number }> {
  console.log("  Seeding test films and screenings...");

  // Get all cinemas first
  const allCinemas = await db.select().from(cinemas);
  if (allCinemas.length === 0) {
    throw new Error("No cinemas found! Run --cinemas first.");
  }

  // Insert films
  const filmIds: string[] = [];
  for (const film of TEST_FILMS) {
    const id = uuidv4();
    filmIds.push(id);

    await db.insert(films).values({
      id,
      title: film.title,
      year: film.year,
      directors: film.directors,
      cast: film.cast.map((name, index) => ({ name, order: index })),
      genres: film.genres,
      runtime: film.runtime,
      posterUrl: film.posterUrl,
      synopsis: film.synopsis,
      isRepertory: film.isRepertory,
      decade: film.decade,
      tmdbRating: film.tmdbRating,
      tmdbPopularity: film.tmdbPopularity,
      countries: [],
      languages: [],
    });
  }

  // Create screenings for the next 14 days
  const today = new Date();
  const screeningTimes = [14, 16, 18, 20, 21];
  let screeningCount = 0;

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const date = addDays(today, dayOffset);

    for (const cinema of allCinemas) {
      const numScreenings = Math.floor(Math.random() * 3) + 2;
      const usedFilms = new Set<number>();

      for (let i = 0; i < numScreenings; i++) {
        let filmIndex: number;
        do {
          filmIndex = Math.floor(Math.random() * filmIds.length);
        } while (usedFilms.has(filmIndex) && usedFilms.size < filmIds.length);
        usedFilms.add(filmIndex);

        const hour = screeningTimes[Math.floor(Math.random() * screeningTimes.length)];
        const datetime = setMinutes(setHours(date, hour), Math.random() > 0.5 ? 0 : 30);

        let format: string | undefined;
        if (cinema.features?.includes("imax") && Math.random() > 0.7) format = "imax";
        else if (cinema.features?.includes("35mm") && Math.random() > 0.6) format = "35mm";

        let eventType: string | undefined;
        if (Math.random() > 0.85) eventType = Math.random() > 0.5 ? "q_and_a" : "intro";

        await db.insert(screenings).values({
          id: uuidv4(),
          filmId: filmIds[filmIndex],
          cinemaId: cinema.id,
          datetime,
          format: format as ScreeningFormat | null,
          screen: `Screen ${Math.floor(Math.random() * 4) + 1}`,
          eventType: eventType as EventType | null,
          bookingUrl: `${cinema.website}/book/${filmIds[filmIndex]}`,
          scrapedAt: new Date(),
        });

        screeningCount++;
      }
    }
  }

  return { films: filmIds.length, screenings: screeningCount };
}

// ============================================================================
// CLI
// ============================================================================

function printHelp(): void {
  console.log(`
Unified Seed CLI

Usage:
  npm run db:seed                  Run production seeds (cinemas + festivals)
  npm run db:seed -- --cinemas     Seed cinemas only
  npm run db:seed -- --festivals   Seed festivals only
  npm run db:seed -- --screenings  Seed test screenings (development only)
  npm run db:seed -- --all         Run all seeds including test data
  npm run db:seed -- --list        List available seed operations
  npm run db:seed -- --help        Show this help
`);
}

function listOperations(): void {
  console.log(`
Available seed operations:

  --cinemas     ${getCinemasSeedData().length} London cinemas (from registry)
  --festivals   ${LONDON_FESTIVALS.length} London festivals (production data)
  --screenings  ${TEST_FILMS.length} test films + random screenings (development only)

Default (no flags): cinemas + festivals
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (args.includes("--list") || args.includes("-l")) {
    listOperations();
    return;
  }

  console.log("🌱 Running seed operations...\n");

  const runCinemas = args.includes("--cinemas") || args.includes("--all") || args.length === 0;
  const runFestivals = args.includes("--festivals") || args.includes("--all") || args.length === 0;
  const runScreenings = args.includes("--screenings") || args.includes("--all");

  try {
    if (runCinemas) {
      const count = await seedCinemas();
      console.log(`  ✓ Seeded ${count} cinemas`);
    }

    if (runFestivals) {
      const count = await seedFestivals();
      console.log(`  ✓ Seeded ${count} festivals`);
    }

    if (runScreenings) {
      const result = await seedTestScreenings();
      console.log(`  ✓ Seeded ${result.films} test films and ${result.screenings} screenings`);
    }

    console.log("\n✅ Seed complete!");
  } catch (error) {
    console.error("\n❌ Seed failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
