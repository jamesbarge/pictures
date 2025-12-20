/**
 * Seed script for Postboxd database
 * Populates the cinemas table with London venues
 */

import { db } from "./index";
import { cinemas } from "./schema";

const londonCinemas = [
  // Tier 1 - Essential Repertory Venues
  {
    id: "bfi-southbank",
    name: "BFI Southbank",
    shortName: "BFI",
    chain: "BFI",
    address: {
      street: "Belvedere Road",
      area: "South Bank",
      postcode: "SE1 8XT",
      borough: "Lambeth",
    },
    coordinates: { lat: 51.5069, lng: -0.1150 },
    screens: 4,
    features: ["35mm", "70mm", "bar", "restaurant", "accessible"],
    programmingFocus: ["repertory", "arthouse", "documentary", "events"],
    website: "https://whatson.bfi.org.uk",
    bookingUrl: "https://whatson.bfi.org.uk/Online/",
    dataSourceType: "scrape" as const,
    description:
      "The UK's leading repertory cinema, home to seasons, retrospectives, and restorations. Four screens including the stunning NFT1.",
  },
  {
    id: "bfi-imax",
    name: "BFI IMAX",
    shortName: "IMAX",
    chain: "BFI",
    address: {
      street: "1 Charlie Chaplin Walk",
      area: "Waterloo",
      postcode: "SE1 8XR",
      borough: "Lambeth",
    },
    coordinates: { lat: 51.5033, lng: -0.1134 },
    screens: 1,
    features: ["imax", "70mm", "accessible"],
    programmingFocus: ["mainstream", "events", "repertory"],
    website: "https://whatson.bfi.org.uk",
    bookingUrl: "https://whatson.bfi.org.uk/Online/",
    dataSourceType: "scrape" as const,
    description:
      "The UK's largest IMAX screen. Perfect for blockbusters and 70mm presentations.",
  },
  {
    id: "prince-charles",
    name: "Prince Charles Cinema",
    shortName: "PCC",
    chain: null,
    address: {
      street: "7 Leicester Place",
      area: "Leicester Square",
      postcode: "WC2H 7BY",
      borough: "Westminster",
    },
    coordinates: { lat: 51.5114, lng: -0.1302 },
    screens: 2,
    features: ["35mm", "bar", "accessible"],
    programmingFocus: ["repertory", "events"],
    website: "https://princecharlescinema.com",
    bookingUrl: "https://princecharlescinema.com/whats-on/",
    dataSourceType: "scrape" as const,
    description:
      "London's legendary repertory cinema. Home to sing-alongs, quote-alongs, marathons, and the best double bills in town.",
  },
  {
    id: "ica",
    name: "ICA Cinema",
    shortName: "ICA",
    chain: null,
    address: {
      street: "The Mall",
      area: "St James's",
      postcode: "SW1Y 5AH",
      borough: "Westminster",
    },
    coordinates: { lat: 51.5063, lng: -0.1310 },
    screens: 2,
    features: ["accessible", "bar"],
    programmingFocus: ["arthouse", "experimental", "documentary"],
    website: "https://www.ica.art/films",
    bookingUrl: "https://www.ica.art/films",
    dataSourceType: "scrape" as const,
    description:
      "Institute of Contemporary Arts cinema. Cutting-edge programming, artist films, and avant-garde cinema.",
  },
  {
    id: "barbican",
    name: "Barbican Cinema",
    shortName: "Barbican",
    chain: null,
    address: {
      street: "Silk Street",
      area: "Barbican",
      postcode: "EC2Y 8DS",
      borough: "City of London",
    },
    coordinates: { lat: 51.5200, lng: -0.0935 },
    screens: 3,
    features: ["accessible", "bar", "hearing_loop"],
    programmingFocus: ["arthouse", "repertory", "documentary", "events"],
    website: "https://www.barbican.org.uk/whats-on/cinema",
    bookingUrl: "https://www.barbican.org.uk/whats-on/cinema",
    dataSourceType: "scrape" as const,
    description:
      "Part of Europe's largest arts centre. International cinema, themed seasons, and director retrospectives.",
  },
  {
    id: "rio-dalston",
    name: "Rio Cinema",
    shortName: "Rio",
    chain: null,
    address: {
      street: "107 Kingsland High Street",
      area: "Dalston",
      postcode: "E8 2PB",
      borough: "Hackney",
    },
    coordinates: { lat: 51.5485, lng: -0.0755 },
    screens: 2,
    features: ["35mm", "bar", "accessible"],
    programmingFocus: ["repertory", "arthouse", "community"],
    website: "https://riocinema.org.uk",
    bookingUrl: "https://riocinema.org.uk/whats-on/",
    dataSourceType: "scrape" as const,
    description:
      "East London's beloved Art Deco cinema. Community-focused programming with a great repertory selection.",
  },
  {
    id: "genesis-mile-end",
    name: "Genesis Cinema",
    shortName: "Genesis",
    chain: null,
    address: {
      street: "93-95 Mile End Road",
      area: "Mile End",
      postcode: "E1 4UJ",
      borough: "Tower Hamlets",
    },
    coordinates: { lat: 51.5232, lng: -0.0408 },
    screens: 5,
    features: ["bar", "accessible"],
    programmingFocus: ["mainstream", "repertory", "arthouse"],
    website: "https://genesiscinema.co.uk",
    bookingUrl: "https://genesiscinema.co.uk/whats-on/",
    dataSourceType: "scrape" as const,
    description:
      "Independent East London cinema with an eclectic mix of mainstream, arthouse, and repertory programming.",
  },
];

async function seed() {
  console.log("Seeding London cinemas...");

  for (const cinema of londonCinemas) {
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

    console.log(`  ✓ ${cinema.name}`);
  }

  console.log(`\nSeeded ${londonCinemas.length} cinemas.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
