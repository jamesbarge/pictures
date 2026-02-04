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
  {
    id: "garden",
    name: "The Garden Cinema",
    shortName: "Garden",
    chain: null,
    address: {
      street: "39-41 Parker Street",
      area: "Covent Garden",
      postcode: "WC2B 5PQ",
      borough: "Camden",
    },
    coordinates: { lat: 51.5142, lng: -0.1215 },
    screens: 1,
    features: ["bar", "accessible", "35mm"],
    programmingFocus: ["arthouse", "repertory", "documentary"],
    website: "https://thegardencinema.co.uk",
    bookingUrl: "https://thegardencinema.co.uk",
    dataSourceType: "scrape" as const,
    description:
      "A beautiful single-screen independent cinema in Covent Garden. Thoughtfully curated programming with a focus on repertory, arthouse, and special events.",
  },
  {
    id: "close-up-cinema",
    name: "Close-Up Cinema",
    shortName: "Close-Up",
    chain: null,
    address: {
      street: "97 Sclater Street",
      area: "Shoreditch",
      postcode: "E1 6HR",
      borough: "Tower Hamlets",
    },
    coordinates: { lat: 51.5233, lng: -0.0718 },
    screens: 1,
    features: ["bar", "accessible"],
    programmingFocus: ["repertory", "arthouse", "documentary", "events"],
    website: "https://www.closeupfilmcentre.com",
    bookingUrl: "https://www.closeupfilmcentre.com",
    dataSourceType: "scrape" as const,
    description:
      "An intimate single-screen cinema in Shoreditch specializing in repertory programming, filmmaker retrospectives, and curated seasons. Known for its thoughtful curation and community events.",
  },
  {
    id: "cine-lumiere",
    name: "Cine Lumiere",
    shortName: "Lumiere",
    chain: null,
    address: {
      street: "17 Queensberry Place",
      area: "South Kensington",
      postcode: "SW7 2DT",
      borough: "Kensington and Chelsea",
    },
    coordinates: { lat: 51.4947, lng: -0.1765 },
    screens: 1,
    features: ["accessible", "bar"],
    programmingFocus: ["arthouse", "repertory", "french", "european"],
    website: "https://www.institut-francais.org.uk/cine-lumiere/",
    bookingUrl: "https://cinelumiere.savoysystems.co.uk/CineLumiere.dll/",
    dataSourceType: "scrape" as const,
    description:
      "The cinema at Institut Francais in South Kensington. Specializes in French and European arthouse cinema, classic repertory screenings, and cultural film events.",
  },
  {
    id: "phoenix",
    name: "Phoenix Cinema",
    shortName: "Phoenix",
    chain: null,
    address: {
      street: "52 High Road",
      area: "East Finchley",
      postcode: "N2 9PJ",
      borough: "Barnet",
    },
    coordinates: { lat: 51.5871, lng: -0.1642 },
    screens: 2,
    features: ["accessible", "bar", "cafe"],
    programmingFocus: ["repertory", "arthouse", "mainstream", "events"],
    website: "https://phoenixcinema.co.uk",
    bookingUrl: "https://phoenixcinema.co.uk/whats-on/",
    dataSourceType: "scrape" as const,
    description:
      "One of the oldest purpose-built cinemas in the UK (1910). A community-owned arthouse in East Finchley showing a mix of new releases, classics, and special events.",
  },
  // Additional cinemas not in original seed
  {
    id: "olympic",
    name: "Olympic Cinema",
    shortName: "Olympic",
    chain: null,
    address: {
      street: "117-123 Church Road",
      area: "Barnes",
      postcode: "SW13 9HL",
      borough: "Richmond upon Thames",
    },
    coordinates: { lat: 51.4707, lng: -0.2459 },
    screens: 2,
    features: ["independent", "historic", "studio-heritage", "bar"],
    programmingFocus: ["arthouse", "mainstream", "events"],
    website: "https://www.olympiccinema.com",
    bookingUrl: "https://www.olympiccinema.com/whats-on",
    dataSourceType: "scrape" as const,
    description:
      "Part of the legendary Olympic Studios complex in Barnes. An intimate cinema with impeccable sound, continuing the building's legacy of audio excellence.",
  },
  {
    id: "riverside",
    name: "Riverside Studios",
    shortName: "Riverside",
    chain: null,
    address: {
      street: "101 Queen Caroline Street",
      area: "Hammersmith",
      postcode: "W6 9BN",
      borough: "Hammersmith and Fulham",
    },
    coordinates: { lat: 51.4897, lng: -0.2339 },
    screens: 2,
    features: ["independent", "arts-centre", "bar", "restaurant"],
    programmingFocus: ["arthouse", "repertory", "documentary", "events"],
    website: "https://riversidestudios.co.uk",
    bookingUrl: "https://riversidestudios.co.uk/cinema",
    dataSourceType: "scrape" as const,
    description:
      "West London arts centre with two cinemas. Known for independent, world cinema and classic retrospectives alongside theatre and comedy.",
  },
  {
    id: "regent-street",
    name: "Regent Street Cinema",
    shortName: "Regent Street",
    chain: null,
    address: {
      street: "309 Regent Street",
      area: "West End",
      postcode: "W1B 2HW",
      borough: "Westminster",
    },
    coordinates: { lat: 51.5171, lng: -0.1427 },
    screens: 1,
    features: ["independent", "historic", "university", "accessible"],
    programmingFocus: ["repertory", "arthouse", "events"],
    website: "https://www.regentstreetcinema.com",
    bookingUrl: "https://www.regentstreetcinema.com/programme/",
    dataSourceType: "scrape" as const,
    description:
      "The birthplace of British cinema, where the Lumière brothers screened the first moving pictures in 1896. Historic single-screen venue at the University of Westminster.",
  },
  {
    id: "david-lean",
    name: "David Lean Cinema",
    shortName: "David Lean",
    chain: null,
    address: {
      street: "Katharine Street",
      area: "Croydon",
      postcode: "CR9 1ET",
      borough: "Croydon",
    },
    coordinates: { lat: 51.3727, lng: -0.0993 },
    screens: 1,
    features: ["independent", "community", "volunteer-run", "accessible"],
    programmingFocus: ["repertory", "arthouse", "documentary"],
    website: "https://www.davidleancinema.org.uk",
    bookingUrl: "https://www.davidleancinema.org.uk/listings",
    dataSourceType: "scrape" as const,
    description:
      "Named after the legendary director born in Croydon. A volunteer-run community cinema in Croydon Clocktower showing classic and contemporary films.",
  },
  {
    id: "electric-portobello",
    name: "Electric Cinema Portobello",
    shortName: "Electric",
    chain: "Electric",
    address: {
      street: "191 Portobello Road",
      area: "Notting Hill",
      postcode: "W11 2ED",
      borough: "Kensington and Chelsea",
    },
    coordinates: { lat: 51.5167, lng: -0.2042 },
    screens: 1,
    features: ["luxury", "historic", "bar", "beds", "accessible"],
    programmingFocus: ["mainstream", "arthouse", "events"],
    website: "https://www.electriccinema.co.uk",
    bookingUrl: "https://www.electriccinema.co.uk/programme/",
    dataSourceType: "scrape" as const,
    description:
      "One of Britain's oldest working cinemas (1910). Luxury seating with leather armchairs, sofas, and beds. An iconic Notting Hill destination.",
  },
  {
    id: "electric-white-city",
    name: "Electric Cinema White City",
    shortName: "Electric WC",
    chain: "Electric",
    address: {
      street: "Television Centre",
      area: "White City",
      postcode: "W12 7SL",
      borough: "Hammersmith and Fulham",
    },
    coordinates: { lat: 51.5106, lng: -0.2252 },
    screens: 1,
    features: ["luxury", "bar", "beds", "accessible"],
    programmingFocus: ["mainstream", "arthouse", "events"],
    website: "https://www.electriccinema.co.uk",
    bookingUrl: "https://www.electriccinema.co.uk/programme/",
    dataSourceType: "scrape" as const,
    description:
      "The Electric's second London venue, located in the iconic Television Centre. Same luxury experience with armchairs, sofas and beds.",
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
