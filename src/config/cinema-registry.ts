/**
 * Canonical Cinema Registry
 *
 * SINGLE SOURCE OF TRUTH for all cinema definitions.
 *
 * All other files should derive their cinema lists from this registry:
 * - src/inngest/functions.ts → getCheeriocinemas(), getScraperRegistry()
 * - src/app/api/admin/scrape/route.ts → getCinemaToScraperMap()
 * - src/scrapers/local-runner.ts → getPlaywrightCinemas()
 * - src/db/seed-cli.ts → getCinemasSeedData()
 *
 * To add a new cinema:
 * 1. Add the cinema definition to CINEMA_REGISTRY below
 * 2. Create the scraper in src/scrapers/cinemas/{id}.ts or src/scrapers/chains/{chain}.ts
 * 3. Run `npm run db:seed -- --cinemas` to sync to database
 */

// ============================================================================
// Types
// ============================================================================

export type ScraperType = "cheerio" | "playwright" | "api";
export type ChainId = "curzon" | "picturehouse" | "everyman" | "bfi" | null;

export interface CinemaAddress {
  street: string;
  area: string;
  postcode: string;
  borough?: string;
}

export interface CinemaCoordinates {
  lat: number;
  lng: number;
}

export interface CinemaDefinition {
  /** Canonical ID used everywhere (database, API, scrapers) */
  id: string;
  /** Full display name */
  name: string;
  /** Abbreviated name for UI */
  shortName: string;
  /** Main website URL */
  website: string;
  /** Physical address */
  address: CinemaAddress;
  /** Coordinates for mapping */
  coordinates?: CinemaCoordinates;
  /** Number of screens */
  screens?: number;
  /** Chain identifier (null for independents) */
  chain: ChainId;
  /** For chain venues, the chain's internal venue ID (e.g., "SOH1" for Curzon Soho) */
  chainVenueId?: string;
  /** URL slug used by the chain website */
  chainSlug?: string;
  /** Type of scraper required */
  scraperType: ScraperType;
  /** Module path relative to @/scrapers/ (e.g., "cinemas/rio" or "chains/curzon") */
  scraperModule: string;
  /** Factory function name exported from the module */
  scraperFactory: string;
  /** Whether this cinema is actively scraped */
  active: boolean;
  /** Feature tags */
  features: string[];
  /** Programming focus tags */
  programmingFocus?: string[];
  /** Description for display */
  description?: string;
  /** Booking URL pattern */
  bookingUrl?: string;
  /** Legacy IDs that should map to this cinema (for migration) */
  legacyIds?: string[];
}

// ============================================================================
// Independent Cinemas
// ============================================================================

const INDEPENDENT_CINEMAS: CinemaDefinition[] = [
  // BFI Venues
  {
    id: "bfi-southbank",
    name: "BFI Southbank",
    shortName: "BFI",
    website: "https://whatson.bfi.org.uk",
    address: { street: "Belvedere Road", area: "South Bank", postcode: "SE1 8XT", borough: "Lambeth" },
    coordinates: { lat: 51.5069, lng: -0.1150 },
    screens: 4,
    chain: "bfi",
    scraperType: "playwright",
    scraperModule: "cinemas/bfi",
    scraperFactory: "createBFIScraper",
    active: true,
    features: ["35mm", "70mm", "bar", "restaurant", "accessible"],
    programmingFocus: ["repertory", "arthouse", "documentary", "events"],
    description: "The UK's leading repertory cinema, home to seasons, retrospectives, and restorations.",
    bookingUrl: "https://whatson.bfi.org.uk/Online/",
  },
  {
    id: "bfi-imax",
    name: "BFI IMAX",
    shortName: "IMAX",
    website: "https://whatson.bfi.org.uk",
    address: { street: "1 Charlie Chaplin Walk", area: "Waterloo", postcode: "SE1 8XR", borough: "Lambeth" },
    coordinates: { lat: 51.5033, lng: -0.1134 },
    screens: 1,
    chain: "bfi",
    scraperType: "playwright",
    scraperModule: "cinemas/bfi",
    scraperFactory: "createBFIScraper",
    active: true,
    features: ["imax", "70mm", "accessible"],
    programmingFocus: ["mainstream", "events", "repertory"],
    description: "The UK's largest IMAX screen.",
    bookingUrl: "https://whatson.bfi.org.uk/Online/",
  },

  // Premier Independent Cinemas
  {
    id: "prince-charles",
    name: "Prince Charles Cinema",
    shortName: "PCC",
    website: "https://princecharlescinema.com",
    address: { street: "7 Leicester Place", area: "Leicester Square", postcode: "WC2H 7BY", borough: "Westminster" },
    coordinates: { lat: 51.5114, lng: -0.1302 },
    screens: 2,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/prince-charles",
    scraperFactory: "createPrinceCharlesScraper",
    active: true,
    features: ["35mm", "bar", "accessible", "sing-along", "marathons", "70mm"],
    programmingFocus: ["repertory", "events"],
    description: "London's legendary repertory cinema. Home to sing-alongs, marathons, and the best double bills.",
    bookingUrl: "https://princecharlescinema.com/whats-on/",
  },
  {
    id: "rio-dalston",
    name: "Rio Cinema",
    shortName: "Rio",
    website: "https://riocinema.org.uk",
    address: { street: "107 Kingsland High Street", area: "Dalston", postcode: "E8 2PB", borough: "Hackney" },
    coordinates: { lat: 51.5485, lng: -0.0755 },
    screens: 2,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/rio",
    scraperFactory: "createRioScraper",
    active: true,
    features: ["35mm", "bar", "accessible", "art-deco", "repertory"],
    programmingFocus: ["repertory", "arthouse", "community"],
    description: "East London's beloved Art Deco cinema.",
    bookingUrl: "https://riocinema.org.uk/whats-on/",
  },
  {
    id: "ica",
    name: "Institute of Contemporary Arts",
    shortName: "ICA",
    website: "https://www.ica.art",
    address: { street: "The Mall", area: "St James's", postcode: "SW1Y 5AH", borough: "Westminster" },
    coordinates: { lat: 51.5063, lng: -0.1310 },
    screens: 2,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/ica",
    scraperFactory: "createICAScraper",
    active: true,
    features: ["accessible", "bar", "gallery"],
    programmingFocus: ["arthouse", "experimental", "documentary"],
    description: "Institute of Contemporary Arts cinema. Cutting-edge and avant-garde cinema.",
    bookingUrl: "https://www.ica.art/films",
  },
  {
    id: "barbican",
    name: "Barbican Cinema",
    shortName: "Barbican",
    website: "https://www.barbican.org.uk/whats-on/cinema",
    address: { street: "Silk Street", area: "Barbican", postcode: "EC2Y 8DS", borough: "City of London" },
    coordinates: { lat: 51.5200, lng: -0.0935 },
    screens: 3,
    chain: null,
    scraperType: "playwright",
    scraperModule: "cinemas/barbican",
    scraperFactory: "createBarbicanScraper",
    active: true,
    features: ["accessible", "bar", "hearing_loop", "arts-centre"],
    programmingFocus: ["arthouse", "repertory", "documentary", "events"],
    description: "Part of Europe's largest arts centre. International cinema and director retrospectives.",
    bookingUrl: "https://www.barbican.org.uk/whats-on/cinema",
  },
  {
    id: "genesis",
    name: "Genesis Cinema",
    shortName: "Genesis",
    website: "https://genesiscinema.co.uk",
    address: { street: "93-95 Mile End Road", area: "Mile End", postcode: "E1 4UJ", borough: "Tower Hamlets" },
    coordinates: { lat: 51.5232, lng: -0.0408 },
    screens: 5,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/genesis",
    scraperFactory: "createGenesisScraper",
    active: true,
    features: ["bar", "accessible", "affordable"],
    programmingFocus: ["mainstream", "repertory", "arthouse"],
    description: "Independent East London cinema with eclectic programming.",
    bookingUrl: "https://genesiscinema.co.uk/whats-on/",
    legacyIds: ["genesis-mile-end"],
  },
  {
    id: "peckhamplex",
    name: "Peckhamplex",
    shortName: "Plex",
    website: "https://peckhamplex.london",
    address: { street: "95A Rye Lane", area: "Peckham", postcode: "SE15 4ST", borough: "Southwark" },
    coordinates: { lat: 51.4686, lng: -0.0677 },
    screens: 5,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/peckhamplex",
    scraperFactory: "createPeckhamplexScraper",
    active: true,
    features: ["affordable", "community", "accessible"],
    programmingFocus: ["mainstream", "arthouse", "community"],
    description: "Community-focused cinema with affordable tickets.",
    bookingUrl: "https://peckhamplex.london",
  },
  {
    id: "the-nickel",
    name: "The Nickel",
    shortName: "Nickel",
    website: "https://thenickel.co.uk",
    address: { street: "194 Upper Street", area: "Islington", postcode: "N1 1RQ", borough: "Islington" },
    coordinates: { lat: 51.5399, lng: -0.1029 },
    screens: 2,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/the-nickel",
    scraperFactory: "createNickelScraper",
    active: true,
    features: ["bar", "restaurant", "luxury"],
    programmingFocus: ["mainstream", "arthouse"],
    description: "Boutique cinema with restaurant and bar.",
    bookingUrl: "https://thenickel.co.uk",
    legacyIds: ["nickel"],
  },
  {
    id: "garden",
    name: "The Garden Cinema",
    shortName: "Garden",
    website: "https://thegardencinema.co.uk",
    address: { street: "39-41 Parker Street", area: "Covent Garden", postcode: "WC2B 5PQ", borough: "Camden" },
    coordinates: { lat: 51.5152, lng: -0.1207 },
    screens: 2,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/garden",
    scraperFactory: "createGardenCinemaScraper",
    active: true,
    features: ["bar", "luxury", "accessible", "35mm"],
    programmingFocus: ["arthouse", "repertory", "documentary"],
    description: "Beautiful single-screen independent cinema with Art Deco design.",
    bookingUrl: "https://thegardencinema.co.uk",
    legacyIds: ["garden-cinema"],
  },
  {
    id: "castle",
    name: "Castle Cinema",
    shortName: "Castle",
    website: "https://thecastlecinema.com",
    address: { street: "64-66 Brooksby's Walk", area: "Hackney", postcode: "E9 6DA", borough: "Hackney" },
    coordinates: { lat: 51.5456, lng: -0.0539 },
    screens: 1,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/castle",
    scraperFactory: "createCastleScraper",
    active: true,
    features: ["community", "cafe-bar", "accessible"],
    programmingFocus: ["arthouse", "repertory", "documentary"],
    description: "Community cinema in a converted former church.",
    bookingUrl: "https://thecastlecinema.com",
  },
  {
    id: "castle-sidcup",
    name: "Castle Sidcup",
    shortName: "Castle Sidcup",
    website: "https://thecastlecinema.com/sidcup",
    address: { street: "44 Main Road", area: "Sidcup", postcode: "DA14 6NJ", borough: "Bexley" },
    screens: 1,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/castle-sidcup",
    scraperFactory: "createCastleSidcupScraper",
    active: true,
    features: ["community", "accessible"],
    programmingFocus: ["mainstream", "arthouse"],
    description: "Community cinema in Sidcup.",
    bookingUrl: "https://thecastlecinema.com/sidcup",
  },
  {
    id: "phoenix-east-finchley",
    name: "Phoenix Cinema",
    shortName: "Phoenix",
    website: "https://phoenixcinema.co.uk",
    address: { street: "52 High Road", area: "East Finchley", postcode: "N2 9PJ", borough: "Barnet" },
    coordinates: { lat: 51.5871, lng: -0.1642 },
    screens: 2,
    chain: null,
    scraperType: "playwright",
    scraperModule: "cinemas/phoenix",
    scraperFactory: "createPhoenixScraper",
    active: true,
    features: ["accessible", "bar", "cafe", "art-deco", "historic"],
    programmingFocus: ["repertory", "arthouse", "mainstream", "events"],
    description: "One of the oldest purpose-built cinemas in the UK (1910).",
    bookingUrl: "https://phoenixcinema.co.uk/whats-on/",
    legacyIds: ["phoenix", "phoenix-cinema"],
  },
  {
    id: "rich-mix",
    name: "Rich Mix",
    shortName: "Rich Mix",
    website: "https://richmix.org.uk",
    address: { street: "35-47 Bethnal Green Road", area: "Shoreditch", postcode: "E1 6LA", borough: "Tower Hamlets" },
    coordinates: { lat: 51.5238, lng: -0.0715 },
    screens: 3,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/rich-mix",
    scraperFactory: "createRichMixScraper",
    active: true,
    features: ["arts-centre", "community", "accessible"],
    programmingFocus: ["world-cinema", "documentary", "arthouse"],
    description: "Arts centre with world cinema focus.",
    bookingUrl: "https://richmix.org.uk/cinema",
  },
  {
    id: "close-up-cinema",
    name: "Close-Up Cinema",
    shortName: "Close-Up",
    website: "https://www.closeupfilmcentre.com",
    address: { street: "97 Sclater Street", area: "Shoreditch", postcode: "E1 6HR", borough: "Tower Hamlets" },
    coordinates: { lat: 51.5233, lng: -0.0718 },
    screens: 1,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/close-up",
    scraperFactory: "CloseUpCinemaScraper",
    active: true,
    features: ["bar", "accessible", "repertory"],
    programmingFocus: ["repertory", "arthouse", "documentary", "events"],
    description: "Intimate single-screen cinema in Shoreditch specializing in repertory.",
    bookingUrl: "https://www.closeupfilmcentre.com",
    legacyIds: ["close-up"],
  },
  {
    id: "cine-lumiere",
    name: "Ciné Lumière",
    shortName: "Ciné Lumière",
    website: "https://www.institut-francais.org.uk/cine-lumiere/",
    address: { street: "17 Queensberry Place", area: "South Kensington", postcode: "SW7 2DT", borough: "Kensington and Chelsea" },
    coordinates: { lat: 51.4947, lng: -0.1765 },
    screens: 1,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/cine-lumiere",
    scraperFactory: "CineLumiereScraper",
    active: true,
    features: ["accessible", "bar"],
    programmingFocus: ["arthouse", "repertory", "french", "european"],
    description: "French and European arthouse cinema at Institut Français.",
    bookingUrl: "https://cinelumiere.savoysystems.co.uk/CineLumiere.dll/",
  },
  {
    id: "arthouse-crouch-end",
    name: "ArtHouse Crouch End",
    shortName: "ArtHouse",
    website: "https://arthousecrouchend.co.uk",
    address: { street: "159a Tottenham Lane", area: "Crouch End", postcode: "N8 9BT", borough: "Haringey" },
    screens: 1,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/arthouse-crouch-end",
    scraperFactory: "createArtHouseCrouchEndScraper",
    active: true,
    features: ["community", "single-screen", "accessible"],
    programmingFocus: ["arthouse", "repertory"],
    description: "Community single-screen cinema in Crouch End.",
    bookingUrl: "https://arthousecrouchend.co.uk",
  },
  {
    id: "coldharbour-blue",
    name: "Coldharbour Blue",
    shortName: "Coldharbour",
    website: "https://www.coldharbourblue.com",
    address: { street: "259-260 Hardess Street", area: "Loughborough Junction", postcode: "SE24 0HN", borough: "Lambeth" },
    coordinates: { lat: 51.4630, lng: -0.1010 },
    screens: 1,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/coldharbour-blue",
    scraperFactory: "createColdharbourBlueScraper",
    active: true,
    features: ["bar", "accessible", "community"],
    programmingFocus: ["arthouse", "repertory", "documentary", "events"],
    description: "Independent cinema in Brixton. New releases, art-house, classics and documentaries.",
    bookingUrl: "https://www.coldharbourblue.com/screenings/",
  },
  {
    id: "olympic-studios",
    name: "Olympic Studios",
    shortName: "Olympic",
    website: "https://olympiccinema.co.uk",
    address: { street: "117-123 Church Road", area: "Barnes", postcode: "SW13 9HL", borough: "Richmond" },
    coordinates: { lat: 51.4719, lng: -0.2486 },
    screens: 2,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/olympic",
    scraperFactory: "createOlympicScraper",
    active: true,
    features: ["luxury", "bar", "restaurant", "historic"],
    programmingFocus: ["mainstream", "arthouse"],
    description: "Cinema in the legendary Olympic recording studios building.",
    bookingUrl: "https://olympiccinema.co.uk",
    legacyIds: ["olympic"],
  },
  {
    id: "david-lean-cinema",
    name: "The David Lean Cinema",
    shortName: "David Lean",
    website: "https://www.davidleancinema.org.uk",
    address: { street: "Croydon Clocktower", area: "Croydon", postcode: "CR9 1ET", borough: "Croydon" },
    screens: 1,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/david-lean",
    scraperFactory: "createDavidLeanScraper",
    active: true,
    features: ["community", "repertory", "accessible"],
    programmingFocus: ["repertory", "classics", "arthouse"],
    description: "Named after the legendary British director, showing classics and curated seasons.",
    bookingUrl: "https://www.davidleancinema.org.uk",
    legacyIds: ["david-lean"],
  },
  {
    id: "riverside-studios",
    name: "Riverside Studios",
    shortName: "Riverside",
    website: "https://riversidestudios.co.uk",
    address: { street: "101 Queen Caroline Street", area: "Hammersmith", postcode: "W6 9BN", borough: "Hammersmith and Fulham" },
    screens: 1,
    chain: null,
    scraperType: "cheerio",
    scraperModule: "cinemas/riverside-studios",
    scraperFactory: "createRiversideStudiosScraper",
    active: true,
    features: ["arts-centre", "theatre", "accessible"],
    programmingFocus: ["arthouse", "documentary", "events"],
    description: "Arts centre with cinema, theatre, and performance spaces.",
    bookingUrl: "https://riversidestudios.co.uk/cinema",
    legacyIds: ["riverside"],
  },
  {
    id: "romford-lumiere",
    name: "Lumière Romford",
    shortName: "Lumière",
    website: "https://www.lumiereromford.com",
    address: { street: "Mercury Gardens", area: "Romford", postcode: "RM1 3EE", borough: "Havering" },
    coordinates: { lat: 51.5757, lng: 0.1838 },
    screens: 4,
    chain: null,
    scraperType: "playwright",
    scraperModule: "cinemas/romford-lumiere",
    scraperFactory: "createRomfordLumiereScraper",
    active: true,
    features: ["bar", "accessible", "community"],
    programmingFocus: ["mainstream", "arthouse", "repertory", "events"],
    description: "Community co-operative cinema in Romford championing independent films alongside mainstream releases.",
    bookingUrl: "https://www.lumiereromford.com/en/buy-tickets",
  },
  {
    id: "electric-portobello",
    name: "Electric Cinema Portobello",
    shortName: "Electric",
    website: "https://www.electriccinema.co.uk",
    address: { street: "191 Portobello Road", area: "Notting Hill", postcode: "W11 2ED", borough: "Kensington and Chelsea" },
    coordinates: { lat: 51.5134, lng: -0.2051 },
    screens: 1,
    chain: null,
    scraperType: "playwright",
    scraperModule: "cinemas/electric",
    scraperFactory: "createElectricScraper",
    active: true,
    features: ["luxury", "bar", "historic", "accessible"],
    programmingFocus: ["mainstream", "arthouse"],
    description: "One of Britain's oldest cinemas (1910) with luxury seating.",
    bookingUrl: "https://www.electriccinema.co.uk",
    legacyIds: ["electric"],
  },
  {
    id: "lexi",
    name: "The Lexi Cinema",
    shortName: "Lexi",
    website: "https://thelexicinema.co.uk",
    address: { street: "194B Chamberlayne Road", area: "Kensal Rise", postcode: "NW10 3JU", borough: "Brent" },
    screens: 1,
    chain: null,
    scraperType: "playwright",
    scraperModule: "cinemas/lexi",
    scraperFactory: "createLexiScraper",
    active: true,
    features: ["community", "charity", "art-deco", "accessible"],
    programmingFocus: ["arthouse", "community", "events"],
    description: "Social enterprise cinema - 100% of profits go to charity.",
    bookingUrl: "https://thelexicinema.co.uk",
  },
];

// ============================================================================
// Chain Venues - Curzon
// ============================================================================

const CURZON_VENUES: CinemaDefinition[] = [
  {
    id: "curzon-soho",
    name: "Curzon Soho",
    shortName: "Curzon Soho",
    website: "https://www.curzon.com/venues/soho/",
    address: { street: "99 Shaftesbury Avenue", area: "Soho", postcode: "W1D 5DY", borough: "Westminster" },
    coordinates: { lat: 51.5133, lng: -0.1317 },
    screens: 3,
    chain: "curzon",
    chainVenueId: "SOH1",
    chainSlug: "soho",
    scraperType: "playwright",
    scraperModule: "chains/curzon",
    scraperFactory: "createCurzonScraper",
    active: true,
    features: ["bar", "cafe"],
    programmingFocus: ["arthouse", "mainstream"],
    description: "Curzon's flagship Soho venue.",
  },
  {
    id: "curzon-mayfair",
    name: "Curzon Mayfair",
    shortName: "Curzon Mayfair",
    website: "https://www.curzon.com/venues/mayfair/",
    address: { street: "38 Curzon Street", area: "Mayfair", postcode: "W1J 7SH", borough: "Westminster" },
    coordinates: { lat: 51.5088, lng: -0.1481 },
    screens: 1,
    chain: "curzon",
    chainVenueId: "MAY1",
    chainSlug: "mayfair",
    scraperType: "playwright",
    scraperModule: "chains/curzon",
    scraperFactory: "createCurzonScraper",
    active: true,
    features: ["historic", "single_screen"],
    programmingFocus: ["arthouse", "repertory"],
    description: "Historic single-screen cinema.",
  },
  {
    id: "curzon-bloomsbury",
    name: "Curzon Bloomsbury",
    shortName: "Curzon Blooms",
    website: "https://www.curzon.com/venues/bloomsbury/",
    address: { street: "The Brunswick Centre", area: "Bloomsbury", postcode: "WC1H 8AG", borough: "Camden" },
    coordinates: { lat: 51.5252, lng: -0.1213 },
    screens: 3,
    chain: "curzon",
    chainVenueId: "BLO1",
    chainSlug: "bloomsbury",
    scraperType: "playwright",
    scraperModule: "chains/curzon",
    scraperFactory: "createCurzonScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["arthouse", "mainstream"],
  },
  {
    id: "curzon-aldgate",
    name: "Curzon Aldgate",
    shortName: "Curzon Aldgate",
    website: "https://www.curzon.com/venues/aldgate/",
    address: { street: "2 Whitechapel High Street", area: "Aldgate", postcode: "E1 8FA", borough: "Tower Hamlets" },
    coordinates: { lat: 51.5148, lng: -0.0707 },
    screens: 4,
    chain: "curzon",
    chainVenueId: "ALD1",
    chainSlug: "aldgate",
    scraperType: "playwright",
    scraperModule: "chains/curzon",
    scraperFactory: "createCurzonScraper",
    active: true,
    features: ["bar", "rooftop"],
    programmingFocus: ["arthouse", "mainstream"],
  },
  {
    id: "curzon-victoria",
    name: "Curzon Victoria",
    shortName: "Curzon Vic",
    website: "https://www.curzon.com/venues/victoria/",
    address: { street: "58 Victoria Street", area: "Victoria", postcode: "SW1E 5JA", borough: "Westminster" },
    coordinates: { lat: 51.4976, lng: -0.1400 },
    screens: 4,
    chain: "curzon",
    chainVenueId: "VIC1",
    chainSlug: "victoria",
    scraperType: "playwright",
    scraperModule: "chains/curzon",
    scraperFactory: "createCurzonScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["arthouse", "mainstream"],
  },
  {
    id: "curzon-hoxton",
    name: "Curzon Hoxton",
    shortName: "Curzon Hoxton",
    website: "https://www.curzon.com/venues/hoxton/",
    address: { street: "58 Pitfield Street", area: "Hoxton", postcode: "N1 6NU", borough: "Hackney" },
    coordinates: { lat: 51.5302, lng: -0.0830 },
    screens: 2,
    chain: "curzon",
    chainVenueId: "HOX1",
    chainSlug: "hoxton",
    scraperType: "playwright",
    scraperModule: "chains/curzon",
    scraperFactory: "createCurzonScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["arthouse", "mainstream"],
  },
  {
    id: "curzon-kingston",
    name: "Curzon Kingston",
    shortName: "Curzon Kingston",
    website: "https://www.curzon.com/venues/kingston/",
    address: { street: "Richmond Road", area: "Kingston", postcode: "KT2 5BW", borough: "Kingston upon Thames" },
    coordinates: { lat: 51.4109, lng: -0.2983 },
    screens: 3,
    chain: "curzon",
    chainVenueId: "KIN1",
    chainSlug: "kingston",
    scraperType: "playwright",
    scraperModule: "chains/curzon",
    scraperFactory: "createCurzonScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["arthouse", "mainstream"],
  },
];

// ============================================================================
// Chain Venues - Picturehouse
// ============================================================================

const PICTUREHOUSE_VENUES: CinemaDefinition[] = [
  {
    id: "picturehouse-central",
    name: "Picturehouse Central",
    shortName: "PH Central",
    website: "https://www.picturehouses.com/cinema/picturehouse-central",
    address: { street: "Corner of Great Windmill Street & Shaftesbury Avenue", area: "West End", postcode: "W1D 7DH", borough: "Westminster" },
    coordinates: { lat: 51.5108, lng: -0.1325 },
    screens: 7,
    chain: "picturehouse",
    chainVenueId: "022",
    chainSlug: "picturehouse-central",
    scraperType: "api",
    scraperModule: "chains/picturehouse",
    scraperFactory: "createPicturehouseScraper",
    active: true,
    features: ["bar", "restaurant", "cafe", "members_bar"],
    programmingFocus: ["arthouse", "mainstream"],
    description: "Picturehouse's flagship West End venue.",
  },
  {
    id: "picturehouse-hackney",
    name: "Hackney Picturehouse",
    shortName: "Hackney PH",
    website: "https://www.picturehouses.com/cinema/hackney-picturehouse",
    address: { street: "270 Mare Street", area: "Hackney", postcode: "E8 1EJ", borough: "Hackney" },
    coordinates: { lat: 51.5460, lng: -0.0550 },
    screens: 4,
    chain: "picturehouse",
    chainVenueId: "010",
    chainSlug: "hackney-picturehouse",
    scraperType: "api",
    scraperModule: "chains/picturehouse",
    scraperFactory: "createPicturehouseScraper",
    active: true,
    features: ["bar", "cafe"],
    programmingFocus: ["arthouse", "mainstream"],
    legacyIds: ["hackney-picturehouse"],
  },
  {
    id: "picturehouse-crouch-end",
    name: "Crouch End Picturehouse",
    shortName: "Crouch End PH",
    website: "https://www.picturehouses.com/cinema/crouch-end-picturehouse",
    address: { street: "165 Tottenham Lane", area: "Crouch End", postcode: "N8 8HP", borough: "Haringey" },
    coordinates: { lat: 51.5828, lng: -0.1227 },
    screens: 3,
    chain: "picturehouse",
    chainVenueId: "024",
    chainSlug: "crouch-end-picturehouse",
    scraperType: "api",
    scraperModule: "chains/picturehouse",
    scraperFactory: "createPicturehouseScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["arthouse", "mainstream"],
    legacyIds: ["crouch-end-picturehouse"],
  },
  {
    id: "picturehouse-east-dulwich",
    name: "East Dulwich Picturehouse",
    shortName: "East Dulwich PH",
    website: "https://www.picturehouses.com/cinema/east-dulwich",
    address: { street: "Lordship Lane", area: "East Dulwich", postcode: "SE22 8EW", borough: "Southwark" },
    coordinates: { lat: 51.4540, lng: -0.0756 },
    screens: 3,
    chain: "picturehouse",
    chainVenueId: "009",
    chainSlug: "east-dulwich",
    scraperType: "api",
    scraperModule: "chains/picturehouse",
    scraperFactory: "createPicturehouseScraper",
    active: true,
    features: ["bar", "cafe"],
    programmingFocus: ["arthouse", "mainstream"],
    legacyIds: ["east-dulwich-picturehouse"],
  },
  {
    id: "picturehouse-greenwich",
    name: "Greenwich Picturehouse",
    shortName: "Greenwich PH",
    website: "https://www.picturehouses.com/cinema/greenwich-picturehouse",
    address: { street: "180 Greenwich High Road", area: "Greenwich", postcode: "SE10 9HB", borough: "Greenwich" },
    coordinates: { lat: 51.4785, lng: -0.0097 },
    screens: 3,
    chain: "picturehouse",
    chainVenueId: "021",
    chainSlug: "greenwich-picturehouse",
    scraperType: "api",
    scraperModule: "chains/picturehouse",
    scraperFactory: "createPicturehouseScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["arthouse", "mainstream"],
    legacyIds: ["greenwich-picturehouse"],
  },
  {
    id: "picturehouse-finsbury-park",
    name: "Finsbury Park Picturehouse",
    shortName: "Finsbury Park PH",
    website: "https://www.picturehouses.com/cinema/finsbury-park",
    address: { street: "Unit B, Finsbury Park Station", area: "Finsbury Park", postcode: "N4 3FP", borough: "Islington" },
    coordinates: { lat: 51.5645, lng: -0.1059 },
    screens: 3,
    chain: "picturehouse",
    chainVenueId: "029",
    chainSlug: "finsbury-park",
    scraperType: "api",
    scraperModule: "chains/picturehouse",
    scraperFactory: "createPicturehouseScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["arthouse", "mainstream"],
    legacyIds: ["finsbury-park-picturehouse"],
  },
  {
    id: "gate-notting-hill",
    name: "The Gate",
    shortName: "The Gate",
    website: "https://www.picturehouses.com/cinema/the-gate",
    address: { street: "87 Notting Hill Gate", area: "Notting Hill", postcode: "W11 3JE", borough: "Kensington and Chelsea" },
    coordinates: { lat: 51.5096, lng: -0.1964 },
    screens: 1,
    chain: "picturehouse",
    chainVenueId: "016",
    chainSlug: "the-gate",
    scraperType: "api",
    scraperModule: "chains/picturehouse",
    scraperFactory: "createPicturehouseScraper",
    active: true,
    features: ["historic", "single_screen"],
    programmingFocus: ["arthouse", "repertory"],
    legacyIds: ["gate-picturehouse"],
  },
  {
    id: "ritzy-brixton",
    name: "The Ritzy",
    shortName: "Ritzy",
    website: "https://www.picturehouses.com/cinema/the-ritzy",
    address: { street: "Brixton Oval, Coldharbour Lane", area: "Brixton", postcode: "SW2 1JG", borough: "Lambeth" },
    coordinates: { lat: 51.4618, lng: -0.1140 },
    screens: 5,
    chain: "picturehouse",
    chainVenueId: "004",
    chainSlug: "the-ritzy",
    scraperType: "api",
    scraperModule: "chains/picturehouse",
    scraperFactory: "createPicturehouseScraper",
    active: true,
    features: ["bar", "cafe", "historic"],
    programmingFocus: ["arthouse", "mainstream"],
    description: "Historic Brixton cinema.",
    legacyIds: ["picturehouse-ritzy"],
  },
  {
    id: "picturehouse-clapham",
    name: "Clapham Picturehouse",
    shortName: "Clapham PH",
    website: "https://www.picturehouses.com/cinema/clapham-picturehouse",
    address: { street: "76 Venn Street", area: "Clapham", postcode: "SW4 7UL", borough: "Lambeth" },
    coordinates: { lat: 51.4615, lng: -0.1395 },
    screens: 4,
    chain: "picturehouse",
    chainVenueId: "020",
    chainSlug: "clapham-picturehouse",
    scraperType: "api",
    scraperModule: "chains/picturehouse",
    scraperFactory: "createPicturehouseScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["arthouse", "mainstream"],
    legacyIds: ["clapham-picturehouse"],
  },
  {
    id: "picturehouse-west-norwood",
    name: "West Norwood Picturehouse",
    shortName: "West Norwood PH",
    website: "https://www.picturehouses.com/cinema/west-norwood-picturehouse",
    address: { street: "The Old Library, 14-16 Knight's Hill", area: "West Norwood", postcode: "SE27 9NX", borough: "Lambeth" },
    screens: 2,
    chain: "picturehouse",
    chainVenueId: "023",
    chainSlug: "west-norwood-picturehouse",
    scraperType: "api",
    scraperModule: "chains/picturehouse",
    scraperFactory: "createPicturehouseScraper",
    active: true,
    features: ["bar", "library_building"],
    programmingFocus: ["arthouse", "mainstream"],
    legacyIds: ["west-norwood-picturehouse"],
  },
  {
    id: "picturehouse-ealing",
    name: "Ealing Picturehouse",
    shortName: "Ealing PH",
    website: "https://www.picturehouses.com/cinema/ealing-picturehouse",
    address: { street: "The Ealing Cinema, Ealing Green", area: "Ealing", postcode: "W5 2PA", borough: "Ealing" },
    screens: 2,
    chain: "picturehouse",
    chainVenueId: "031",
    chainSlug: "ealing-picturehouse",
    scraperType: "api",
    scraperModule: "chains/picturehouse",
    scraperFactory: "createPicturehouseScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["arthouse", "mainstream"],
    legacyIds: ["ealing-picturehouse"],
  },
];

// ============================================================================
// Chain Venues - Everyman
// ============================================================================

const EVERYMAN_VENUES: CinemaDefinition[] = [
  {
    id: "everyman-baker-street",
    name: "Everyman Baker Street",
    shortName: "Everyman Baker St",
    website: "https://www.everymancinema.com/venues-list/x0712-everyman-baker-street",
    address: { street: "96-98 Baker Street", area: "Marylebone", postcode: "W1U 6AG", borough: "Westminster" },
    coordinates: { lat: 51.5203, lng: -0.1568 },
    screens: 4,
    chain: "everyman",
    chainVenueId: "X0712",
    chainSlug: "baker-street",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: true,
    features: ["bar", "food"],
    programmingFocus: ["mainstream", "arthouse"],
  },
  {
    id: "everyman-barnet",
    name: "Everyman Barnet",
    shortName: "Everyman Barnet",
    website: "https://www.everymancinema.com/venues-list/x06si-everyman-barnet",
    address: { street: "Great North Road", area: "Barnet", postcode: "EN5 5SJ", borough: "Barnet" },
    screens: 4,
    chain: "everyman",
    chainVenueId: "X06SI",
    chainSlug: "barnet",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["mainstream", "arthouse"],
  },
  {
    id: "everyman-belsize-park",
    name: "Everyman Belsize Park",
    shortName: "Everyman Belsize",
    website: "https://www.everymancinema.com/venues-list/x077p-everyman-belsize-park",
    address: { street: "203 Haverstock Hill", area: "Belsize Park", postcode: "NW3 4QG", borough: "Camden" },
    coordinates: { lat: 51.5501, lng: -0.1646 },
    screens: 2,
    chain: "everyman",
    chainVenueId: "X077P",
    chainSlug: "belsize-park",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: true,
    features: ["historic", "bar"],
    programmingFocus: ["arthouse", "mainstream"],
    description: "Historic Art Deco cinema.",
  },
  {
    id: "everyman-borough-yards",
    name: "Everyman Borough Yards",
    shortName: "Everyman Borough",
    website: "https://www.everymancinema.com/venues-list/g011i-everyman-borough-yards",
    address: { street: "Borough Yards", area: "Borough", postcode: "SE1 9PH", borough: "Southwark" },
    screens: 4,
    chain: "everyman",
    chainVenueId: "G011I",
    chainSlug: "borough-yards",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: true,
    features: ["bar", "food"],
    programmingFocus: ["mainstream", "arthouse"],
  },
  {
    id: "everyman-broadgate",
    name: "Everyman Broadgate",
    shortName: "Everyman Broadgate",
    website: "https://www.everymancinema.com/venues-list/x11nt-everyman-broadgate",
    address: { street: "Broadgate Circle", area: "Liverpool Street", postcode: "EC2M 2QS", borough: "City of London" },
    screens: 4,
    chain: "everyman",
    chainVenueId: "X11NT",
    chainSlug: "broadgate",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["mainstream", "arthouse"],
  },
  {
    id: "everyman-canary-wharf",
    name: "Everyman Canary Wharf",
    shortName: "Everyman Canary",
    website: "https://www.everymancinema.com/venues-list/x0vpb-everyman-canary-wharf",
    address: { street: "Crossrail Place", area: "Canary Wharf", postcode: "E14 5NY", borough: "Tower Hamlets" },
    coordinates: { lat: 51.5053, lng: -0.0184 },
    screens: 3,
    chain: "everyman",
    chainVenueId: "X0VPB",
    chainSlug: "canary-wharf",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: true,
    features: ["bar", "food"],
    programmingFocus: ["mainstream", "arthouse"],
  },
  {
    id: "everyman-chelsea",
    name: "Everyman Chelsea",
    shortName: "Everyman Chelsea",
    website: "https://www.everymancinema.com/venues-list/x078x-everyman-chelsea",
    address: { street: "279 King's Road", area: "Chelsea", postcode: "SW3 3TD", borough: "Kensington and Chelsea" },
    screens: 2,
    chain: "everyman",
    chainVenueId: "X078X",
    chainSlug: "chelsea",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["mainstream", "arthouse"],
  },
  {
    id: "everyman-crystal-palace",
    name: "Everyman Crystal Palace",
    shortName: "Everyman Crystal",
    website: "https://www.everymancinema.com/venues-list/x11dr-everyman-crystal-palace",
    address: { street: "25 Church Road", area: "Crystal Palace", postcode: "SE19 2AE", borough: "Bromley" },
    screens: 2,
    chain: "everyman",
    chainVenueId: "X11DR",
    chainSlug: "crystal-palace",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["mainstream", "arthouse"],
  },
  {
    id: "everyman-hampstead",
    name: "Everyman Hampstead",
    shortName: "Everyman Hampstead",
    website: "https://www.everymancinema.com/venues-list/x06zw-everyman-hampstead",
    address: { street: "5 Holly Bush Vale", area: "Hampstead", postcode: "NW3 1QE", borough: "Camden" },
    coordinates: { lat: 51.5574, lng: -0.1798 },
    screens: 2,
    chain: "everyman",
    chainVenueId: "X06ZW",
    chainSlug: "hampstead",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: true,
    features: ["historic", "bar"],
    programmingFocus: ["arthouse", "repertory"],
    description: "Historic Hampstead cinema.",
  },
  {
    id: "everyman-kings-cross",
    name: "Everyman King's Cross",
    shortName: "Everyman Kings X",
    website: "https://www.everymancinema.com/venues-list/x0x5p-everyman-kings-cross",
    address: { street: "Coal Drops Yard", area: "King's Cross", postcode: "N1C 4AG", borough: "Camden" },
    coordinates: { lat: 51.5365, lng: -0.1260 },
    screens: 3,
    chain: "everyman",
    chainVenueId: "X0X5P",
    chainSlug: "kings-cross",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: true,
    features: ["bar", "food"],
    programmingFocus: ["mainstream", "arthouse"],
  },
  {
    id: "everyman-maida-vale",
    name: "Everyman Maida Vale",
    shortName: "Everyman Maida",
    website: "https://www.everymancinema.com/venues-list/x0lwi-everyman-maida-vale",
    address: { street: "215 Sutherland Avenue", area: "Maida Vale", postcode: "W9 1TT", borough: "Westminster" },
    screens: 2,
    chain: "everyman",
    chainVenueId: "X0LWI",
    chainSlug: "maida-vale",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["mainstream", "arthouse"],
  },
  {
    id: "everyman-muswell-hill",
    name: "Everyman Muswell Hill",
    shortName: "Everyman Muswell",
    website: "https://www.everymancinema.com/venues-list/x06sn-everyman-muswell-hill",
    address: { street: "Fortis Green Road", area: "Muswell Hill", postcode: "N10 3TD", borough: "Haringey" },
    screens: 2,
    chain: "everyman",
    chainVenueId: "X06SN",
    chainSlug: "muswell-hill",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["mainstream", "arthouse"],
  },
  {
    id: "screen-on-the-green",
    name: "Screen on the Green",
    shortName: "Screen Green",
    website: "https://www.everymancinema.com/venues-list/x077o-screen-on-the-green",
    address: { street: "83 Upper Street", area: "Islington", postcode: "N1 0PH", borough: "Islington" },
    coordinates: { lat: 51.5379, lng: -0.1032 },
    screens: 1,
    chain: "everyman",
    chainVenueId: "X077O",
    chainSlug: "screen-on-the-green",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: true,
    features: ["historic", "single_screen", "bar"],
    programmingFocus: ["arthouse", "repertory"],
    description: "Iconic Islington single-screen cinema.",
    legacyIds: ["everyman-screen-on-the-green"],
  },
  {
    id: "everyman-stratford",
    name: "Everyman Stratford International",
    shortName: "Everyman Stratford",
    website: "https://www.everymancinema.com/venues-list/g029x-everyman-stratford-international",
    address: { street: "International Way", area: "Stratford", postcode: "E20 1GL", borough: "Newham" },
    screens: 4,
    chain: "everyman",
    chainVenueId: "G029X",
    chainSlug: "stratford-international",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: true,
    features: ["bar"],
    programmingFocus: ["mainstream", "arthouse"],
  },
  {
    id: "everyman-walthamstow",
    name: "Everyman Walthamstow",
    shortName: "Everyman Waltham",
    website: "https://www.everymancinema.com/venues-list/x0wt1-everyman-walthamstow",
    address: { street: "186 Hoe Street", area: "Walthamstow", postcode: "E17 7JN", borough: "Waltham Forest" },
    screens: 2,
    chain: "everyman",
    chainVenueId: "X0WT1",
    chainSlug: "walthamstow",
    scraperType: "playwright",
    scraperModule: "chains/everyman",
    scraperFactory: "createEverymanScraper",
    active: false, // Venue no longer in Everyman's system
    features: ["bar"],
    programmingFocus: ["mainstream", "arthouse"],
  },
];

// ============================================================================
// Complete Registry
// ============================================================================

export const CINEMA_REGISTRY: CinemaDefinition[] = [
  ...INDEPENDENT_CINEMAS,
  ...CURZON_VENUES,
  ...PICTUREHOUSE_VENUES,
  ...EVERYMAN_VENUES,
];

// ============================================================================
// Derived Lookup Functions
// ============================================================================

/** Map of canonical ID to cinema definition */
const cinemaById = new Map<string, CinemaDefinition>();

/** Map of legacy ID to canonical ID */
const legacyIdToCanonical = new Map<string, string>();

// Initialize lookup maps
for (const cinema of CINEMA_REGISTRY) {
  cinemaById.set(cinema.id, cinema);
  if (cinema.legacyIds) {
    for (const legacyId of cinema.legacyIds) {
      legacyIdToCanonical.set(legacyId, cinema.id);
    }
  }
}

/**
 * Get a cinema by ID, resolving legacy IDs to canonical ones
 */
export function getCinemaById(id: string): CinemaDefinition | undefined {
  // Try canonical ID first
  const cinema = cinemaById.get(id);
  if (cinema) return cinema;

  // Try resolving legacy ID
  const canonicalId = legacyIdToCanonical.get(id);
  if (canonicalId) {
    return cinemaById.get(canonicalId);
  }

  return undefined;
}

/**
 * Get canonical ID from any ID (canonical or legacy)
 */
export function getCanonicalId(id: string): string {
  return legacyIdToCanonical.get(id) || id;
}

/**
 * Check if an ID is a legacy ID
 */
export function isLegacyId(id: string): boolean {
  return legacyIdToCanonical.has(id);
}

/**
 * Get all legacy ID mappings
 */
export function getLegacyIdMappings(): Map<string, string> {
  return new Map(legacyIdToCanonical);
}

// ============================================================================
// Scraper Type Functions (replace hardcoded lists)
// ============================================================================

/**
 * Get all Cheerio-based cinemas that can run on Vercel serverless
 * Replaces CHEERIO_CINEMAS in src/inngest/functions.ts
 */
export function getCheeriocinemas(): CinemaDefinition[] {
  return CINEMA_REGISTRY.filter(
    (c) => c.active && c.scraperType === "cheerio"
  );
}

/**
 * Get all Playwright-based cinemas that require browser runtime
 * Replaces PLAYWRIGHT_SCRAPERS in src/scrapers/local-runner.ts
 */
export function getPlaywrightCinemas(): CinemaDefinition[] {
  return CINEMA_REGISTRY.filter(
    (c) => c.active && c.scraperType === "playwright"
  );
}

/**
 * Get all API-based cinemas
 */
export function getApiCinemas(): CinemaDefinition[] {
  return CINEMA_REGISTRY.filter(
    (c) => c.active && c.scraperType === "api"
  );
}

/**
 * Get all active cinemas
 * Replaces ALL_CINEMA_IDS
 */
export function getActiveCinemas(): CinemaDefinition[] {
  return CINEMA_REGISTRY.filter((c) => c.active);
}

/**
 * Get all active cinema IDs
 */
export function getActiveCinemaIds(): string[] {
  return getActiveCinemas().map((c) => c.id);
}

// ============================================================================
// Chain Functions
// ============================================================================

/**
 * Get all cinemas for a specific chain
 */
export function getCinemasByChain(chain: ChainId): CinemaDefinition[] {
  return CINEMA_REGISTRY.filter((c) => c.chain === chain);
}

/**
 * Get active cinemas for a specific chain
 */
export function getActiveCinemasByChain(chain: ChainId): CinemaDefinition[] {
  return CINEMA_REGISTRY.filter((c) => c.active && c.chain === chain);
}

/**
 * Get all independent cinemas (not part of a chain)
 */
export function getIndependentCinemas(): CinemaDefinition[] {
  return CINEMA_REGISTRY.filter((c) => c.chain === null);
}

/**
 * Get all chain IDs
 */
export function getChainIds(): ChainId[] {
  const chains = new Set<ChainId>();
  for (const cinema of CINEMA_REGISTRY) {
    if (cinema.chain) {
      chains.add(cinema.chain);
    }
  }
  return Array.from(chains);
}

// ============================================================================
// Admin API Functions
// ============================================================================

/**
 * Get cinema-to-scraper mapping for admin API
 * Maps both canonical and legacy IDs to the scraper ID that Inngest expects.
 * Replaces CINEMA_TO_SCRAPER in src/app/api/admin/scrape/route.ts
 */
export function getCinemaToScraperMap(): Record<string, string> {
  const map: Record<string, string> = {};

  // IDs where Inngest SCRAPER_REGISTRY uses a different key than the canonical ID
  // These are temporary until Inngest is updated to use canonical IDs
  const INNGEST_LEGACY_SCRAPER_IDS: Record<string, string> = {
    "the-nickel": "nickel",
    "phoenix-east-finchley": "phoenix",
    "electric": "electric-portobello",
  };

  for (const cinema of CINEMA_REGISTRY) {
    // Determine the scraper ID that Inngest expects
    let scraperId: string;
    if (cinema.chain && cinema.chain !== "bfi") {
      // For chain cinemas, map to the chain scraper
      scraperId = cinema.chain;
    } else if (INNGEST_LEGACY_SCRAPER_IDS[cinema.id]) {
      // Use the legacy ID that Inngest expects
      scraperId = INNGEST_LEGACY_SCRAPER_IDS[cinema.id];
    } else {
      // For most independents, use the canonical ID
      scraperId = cinema.id;
    }

    // Map the canonical ID
    map[cinema.id] = scraperId;

    // Also map any legacy IDs to the same scraper
    if (cinema.legacyIds) {
      for (const legacyId of cinema.legacyIds) {
        map[legacyId] = scraperId;
      }
    }
  }

  return map;
}

/**
 * Check if a cinema requires Playwright
 */
export function requiresPlaywright(cinemaId: string): boolean {
  const cinema = getCinemaById(cinemaId);
  return cinema?.scraperType === "playwright";
}

// ============================================================================
// Database Seed Functions
// ============================================================================

/**
 * Get cinema data formatted for database seeding
 * Replaces LONDON_CINEMAS in src/db/seed-cli.ts
 */
export function getCinemasSeedData() {
  return CINEMA_REGISTRY.map((cinema) => ({
    id: cinema.id,
    name: cinema.name,
    shortName: cinema.shortName,
    chain: cinema.chain,
    address: {
      ...cinema.address,
      borough: cinema.address.borough || cinema.address.area,
    },
    coordinates: cinema.coordinates,
    screens: cinema.screens,
    features: cinema.features,
    programmingFocus: cinema.programmingFocus,
    website: cinema.website,
    bookingUrl: cinema.bookingUrl || cinema.website,
    dataSourceType: "scrape" as const,
    description: cinema.description,
  }));
}

// ============================================================================
// Inngest Registry Functions
// ============================================================================

/**
 * Get the venue definition for Inngest scraper registration
 */
export function getInnguestVenueDefinition(cinemaId: string) {
  const cinema = getCinemaById(cinemaId);
  if (!cinema) return undefined;

  return {
    id: cinema.id,
    name: cinema.name,
    shortName: cinema.shortName,
    website: cinema.website,
    address: {
      street: cinema.address.street,
      area: cinema.address.area,
      postcode: cinema.address.postcode,
    },
    features: cinema.features,
  };
}

/**
 * Get chain-to-cinema mapping for Inngest
 * Replaces CHAIN_CINEMA_MAPPING in src/inngest/functions.ts
 */
export function getChainCinemaMapping(): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const cinema of CINEMA_REGISTRY) {
    if (cinema.chain && cinema.chain !== "bfi") {
      mapping[cinema.id] = cinema.chain;
    }
  }
  return mapping;
}

// Note: getPlaywrightScrapersForRunner was removed as it was unused and had
// incorrect script name generation. The local-runner.ts should continue using
// its existing PLAYWRIGHT_SCRAPERS array until a proper migration is done.
