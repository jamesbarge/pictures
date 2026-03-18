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

// ============================================================================
// Cinema Seed Data
// ============================================================================

const LONDON_CINEMAS = [
  {
    id: "bfi-southbank",
    name: "BFI Southbank",
    shortName: "BFI",
    chain: "BFI",
    address: { street: "Belvedere Road", area: "South Bank", postcode: "SE1 8XT", borough: "Lambeth" },
    coordinates: { lat: 51.5069, lng: -0.1150 },
    screens: 4,
    features: ["35mm", "70mm", "bar", "restaurant", "accessible"],
    programmingFocus: ["repertory", "arthouse", "documentary", "events"],
    website: "https://whatson.bfi.org.uk",
    bookingUrl: "https://whatson.bfi.org.uk/Online/",
    dataSourceType: "scrape" as const,
    description: "The UK's leading repertory cinema, home to seasons, retrospectives, and restorations.",
  },
  {
    id: "bfi-imax",
    name: "BFI IMAX",
    shortName: "IMAX",
    chain: "BFI",
    address: { street: "1 Charlie Chaplin Walk", area: "Waterloo", postcode: "SE1 8XR", borough: "Lambeth" },
    coordinates: { lat: 51.5033, lng: -0.1134 },
    screens: 1,
    features: ["imax", "70mm", "accessible"],
    programmingFocus: ["mainstream", "events", "repertory"],
    website: "https://whatson.bfi.org.uk",
    bookingUrl: "https://whatson.bfi.org.uk/Online/",
    dataSourceType: "scrape" as const,
    description: "The UK's largest IMAX screen.",
  },
  {
    id: "prince-charles",
    name: "Prince Charles Cinema",
    shortName: "PCC",
    chain: null,
    address: { street: "7 Leicester Place", area: "Leicester Square", postcode: "WC2H 7BY", borough: "Westminster" },
    coordinates: { lat: 51.5114, lng: -0.1302 },
    screens: 2,
    features: ["35mm", "bar", "accessible"],
    programmingFocus: ["repertory", "events"],
    website: "https://princecharlescinema.com",
    bookingUrl: "https://princecharlescinema.com/whats-on/",
    dataSourceType: "scrape" as const,
    description: "London's legendary repertory cinema. Home to sing-alongs, marathons, and the best double bills.",
  },
  {
    id: "ica",
    name: "ICA Cinema",
    shortName: "ICA",
    chain: null,
    address: { street: "The Mall", area: "St James's", postcode: "SW1Y 5AH", borough: "Westminster" },
    coordinates: { lat: 51.5063, lng: -0.1310 },
    screens: 2,
    features: ["accessible", "bar"],
    programmingFocus: ["arthouse", "experimental", "documentary"],
    website: "https://www.ica.art/films",
    bookingUrl: "https://www.ica.art/films",
    dataSourceType: "scrape" as const,
    description: "Institute of Contemporary Arts cinema. Cutting-edge and avant-garde cinema.",
  },
  {
    id: "barbican",
    name: "Barbican Cinema",
    shortName: "Barbican",
    chain: null,
    address: { street: "Silk Street", area: "Barbican", postcode: "EC2Y 8DS", borough: "City of London" },
    coordinates: { lat: 51.5200, lng: -0.0935 },
    screens: 3,
    features: ["accessible", "bar", "hearing_loop"],
    programmingFocus: ["arthouse", "repertory", "documentary", "events"],
    website: "https://www.barbican.org.uk/whats-on/cinema",
    bookingUrl: "https://www.barbican.org.uk/whats-on/cinema",
    dataSourceType: "scrape" as const,
    description: "Part of Europe's largest arts centre. International cinema and director retrospectives.",
  },
  {
    id: "rio-dalston",
    name: "Rio Cinema",
    shortName: "Rio",
    chain: null,
    address: { street: "107 Kingsland High Street", area: "Dalston", postcode: "E8 2PB", borough: "Hackney" },
    coordinates: { lat: 51.5485, lng: -0.0755 },
    screens: 2,
    features: ["35mm", "bar", "accessible"],
    programmingFocus: ["repertory", "arthouse", "community"],
    website: "https://riocinema.org.uk",
    bookingUrl: "https://riocinema.org.uk/whats-on/",
    dataSourceType: "scrape" as const,
    description: "East London's beloved Art Deco cinema.",
  },
  {
    id: "genesis-mile-end",
    name: "Genesis Cinema",
    shortName: "Genesis",
    chain: null,
    address: { street: "93-95 Mile End Road", area: "Mile End", postcode: "E1 4UJ", borough: "Tower Hamlets" },
    coordinates: { lat: 51.5232, lng: -0.0408 },
    screens: 5,
    features: ["bar", "accessible"],
    programmingFocus: ["mainstream", "repertory", "arthouse"],
    website: "https://genesiscinema.co.uk",
    bookingUrl: "https://genesiscinema.co.uk/whats-on/",
    dataSourceType: "scrape" as const,
    description: "Independent East London cinema with eclectic programming.",
  },
  {
    id: "garden-cinema",
    name: "The Garden Cinema",
    shortName: "Garden",
    chain: null,
    address: { street: "39-41 Golders Green Road", area: "Golders Green", postcode: "NW11 8EE", borough: "Barnet" },
    coordinates: { lat: 51.5726, lng: -0.1944 },
    screens: 1,
    features: ["bar", "accessible", "35mm"],
    programmingFocus: ["arthouse", "repertory", "documentary"],
    website: "https://thegardencinema.co.uk",
    bookingUrl: "https://thegardencinema.co.uk",
    dataSourceType: "scrape" as const,
    description: "Beautiful single-screen independent cinema in North London.",
  },
  {
    id: "close-up-cinema",
    name: "Close-Up Cinema",
    shortName: "Close-Up",
    chain: null,
    address: { street: "97 Sclater Street", area: "Shoreditch", postcode: "E1 6HR", borough: "Tower Hamlets" },
    coordinates: { lat: 51.5233, lng: -0.0718 },
    screens: 1,
    features: ["bar", "accessible"],
    programmingFocus: ["repertory", "arthouse", "documentary", "events"],
    website: "https://www.closeupfilmcentre.com",
    bookingUrl: "https://www.closeupfilmcentre.com",
    dataSourceType: "scrape" as const,
    description: "Intimate single-screen cinema in Shoreditch specializing in repertory.",
  },
  {
    id: "cine-lumiere",
    name: "Cine Lumiere",
    shortName: "Lumiere",
    chain: null,
    address: { street: "17 Queensberry Place", area: "South Kensington", postcode: "SW7 2DT", borough: "Kensington and Chelsea" },
    coordinates: { lat: 51.4947, lng: -0.1765 },
    screens: 1,
    features: ["accessible", "bar"],
    programmingFocus: ["arthouse", "repertory", "french", "european"],
    website: "https://www.institut-francais.org.uk/cine-lumiere/",
    bookingUrl: "https://cinelumiere.savoysystems.co.uk/CineLumiere.dll/",
    dataSourceType: "scrape" as const,
    description: "French and European arthouse cinema at Institut Francais.",
  },
  {
    id: "phoenix-east-finchley",
    name: "Phoenix Cinema",
    shortName: "Phoenix",
    chain: null,
    address: { street: "52 High Rd", area: "East Finchley", postcode: "N2 9PJ", borough: "Barnet" },
    coordinates: { lat: 51.5871, lng: -0.1642 },
    screens: 2,
    features: ["accessible", "bar", "cafe"],
    programmingFocus: ["repertory", "arthouse", "mainstream", "events"],
    website: "https://phoenixcinema.co.uk",
    bookingUrl: "https://phoenixcinema.co.uk/whats-on/",
    dataSourceType: "scrape" as const,
    description: "One of the oldest purpose-built cinemas in the UK (1910).",
  },
  {
    id: "coldharbour-blue",
    name: "Coldharbour Blue",
    shortName: "Coldharbour",
    chain: null,
    address: { street: "259-260 Hardess Street", area: "Loughborough Junction", postcode: "SE24 0HN", borough: "Lambeth" },
    coordinates: { lat: 51.4630, lng: -0.1010 },
    screens: 1,
    features: ["bar", "accessible", "community"],
    programmingFocus: ["arthouse", "repertory", "documentary", "events"],
    website: "https://www.coldharbourblue.com",
    bookingUrl: "https://www.coldharbourblue.com/screenings/",
    dataSourceType: "scrape" as const,
    description: "Independent cinema in Brixton. New releases, art-house, classics and documentaries.",
  },
];

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
  },
];

// ============================================================================
// Seed Functions
// ============================================================================

async function seedCinemas(): Promise<number> {
  console.log("  Seeding cinemas...");
  let count = 0;

  for (const cinema of LONDON_CINEMAS) {
    await db
      .insert(cinemas)
      .values(cinema)
      .onConflictDoUpdate({
        target: cinemas.id,
        set: {
          name: cinema.name,
          shortName: cinema.shortName,
          chain: cinema.chain,
          address: cinema.address,
          coordinates: cinema.coordinates,
          screens: cinema.screens,
          features: cinema.features,
          programmingFocus: cinema.programmingFocus,
          website: cinema.website,
          bookingUrl: cinema.bookingUrl,
          dataSourceType: cinema.dataSourceType,
          description: cinema.description,
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

  --cinemas     ${LONDON_CINEMAS.length} London cinemas (production data)
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
