/**
 * Seed script for London Film Festivals
 * Populates the festivals table with major London film festivals
 */

import { db } from "./index";
import { festivals } from "./schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export const londonFestivals = [
  // BFI London Film Festival - The flagship
  {
    id: randomUUID(),
    name: "BFI London Film Festival 2026",
    slug: "bfi-lff-2026",
    shortName: "LFF",
    year: 2026,
    description:
      "The UK's leading film festival, showcasing the best of world cinema with galas, competitions, and special events across London. Over 200 features and shorts from 70+ countries.",
    websiteUrl: "https://www.bfi.org.uk/london-film-festival",
    logoUrl: null,
    startDate: "2026-10-07", // Usually early-mid October
    endDate: "2026-10-18",
    programmAnnouncedDate: "2026-09-02", // Typically early September
    memberSaleDate: new Date("2026-09-07T10:00:00+01:00"), // Members get ~1 week early access
    publicSaleDate: new Date("2026-09-15T10:00:00+01:00"),
    genreFocus: ["international", "arthouse", "documentary", "shorts"],
    venues: [
      "bfi-southbank",
      "bfi-imax",
      "curzon-soho",
      "curzon-mayfair",
      "vue-leicester-square",
      "odeon-luxe-leicester-square",
    ],
    isActive: true,
  },

  // FrightFest - Horror specialists
  {
    id: randomUUID(),
    name: "FrightFest 2026",
    slug: "frightfest-2026",
    shortName: "FrightFest",
    year: 2026,
    description:
      "The UK's premier horror and fantasy film festival. Five days of premieres, cult classics, and genre-bending cinema at the heart of London's West End.",
    websiteUrl: "https://www.frightfest.co.uk",
    logoUrl: null,
    startDate: "2026-08-27", // Usually late August bank holiday weekend
    endDate: "2026-08-31",
    programmAnnouncedDate: "2026-07-15",
    memberSaleDate: null, // No member early access
    publicSaleDate: new Date("2026-07-20T10:00:00+01:00"),
    genreFocus: ["horror", "fantasy", "sci-fi", "thriller", "cult"],
    venues: ["vue-leicester-square", "prince-charles"],
    isActive: true,
  },

  // Raindance Film Festival - Independent cinema
  {
    id: randomUUID(),
    name: "Raindance Film Festival 2026",
    slug: "raindance-2026",
    shortName: "Raindance",
    year: 2026,
    description:
      "Europe's largest independent film festival, championing first-time filmmakers and bold storytelling. Features competitions, masterclasses, and industry events.",
    websiteUrl: "https://raindance.org/festival",
    logoUrl: null,
    startDate: "2026-06-17", // Usually June
    endDate: "2026-06-28",
    programmAnnouncedDate: "2026-05-20",
    memberSaleDate: new Date("2026-05-25T10:00:00+01:00"),
    publicSaleDate: new Date("2026-06-01T10:00:00+01:00"),
    genreFocus: ["independent", "debut", "international", "documentary"],
    venues: ["curzon-soho", "vue-piccadilly"],
    isActive: true,
  },

  // BFI Flare - LGBTQIA+ film festival
  {
    id: randomUUID(),
    name: "BFI Flare 2026",
    slug: "bfi-flare-2026",
    shortName: "Flare",
    year: 2026,
    description:
      "The 40th anniversary edition of the UK's longest-running LGBTQIA+ film festival, celebrating queer cinema from around the world with features, shorts, archive titles, and special events at BFI Southbank. Includes the 12th year of #FiveFilmsForFreedom.",
    websiteUrl: "https://whatson.bfi.org.uk/flare/Online/default.asp",
    logoUrl: null,
    startDate: "2026-03-18", // Confirmed
    endDate: "2026-03-29",
    programmAnnouncedDate: "2026-02-17", // Confirmed: programme revealed Feb 17 at 11:00
    memberSaleDate: new Date("2026-02-24T12:00:00+00:00"), // Confirmed: BFI Members booking
    publicSaleDate: new Date("2026-02-26T12:00:00+00:00"), // Confirmed: general sale
    genreFocus: ["lgbtqia", "international", "documentary", "shorts"],
    venues: ["bfi-southbank"],
    isActive: true,
  },

  // London Short Film Festival - Shorts specialists
  {
    id: randomUUID(),
    name: "London Short Film Festival 2026",
    slug: "lsff-2026",
    shortName: "LSFF",
    year: 2026,
    description:
      "The UK's leading short film festival, now in its 23rd edition. Theme: 'Cinema Remembers What We Forget'. 300 works from new voices, acclaimed directors, and underground discoveries across London's best cinemas.",
    websiteUrl: "https://shortfilms.org.uk",
    logoUrl: null,
    startDate: "2026-01-23", // Confirmed dates for 2026
    endDate: "2026-02-01",
    programmAnnouncedDate: "2025-12-10",
    memberSaleDate: null,
    publicSaleDate: new Date("2025-12-15T10:00:00+00:00"),
    genreFocus: ["shorts", "animation", "experimental", "music-video"],
    venues: ["ica", "bfi-southbank", "rio-dalston", "rich-mix"],
    isActive: true,
  },

  // London Korean Film Festival
  {
    id: randomUUID(),
    name: "London Korean Film Festival 2026",
    slug: "lkff-2026",
    shortName: "LKFF",
    year: 2026,
    description:
      "Europe's largest Korean film festival, presenting the best of contemporary and classic Korean cinema including features, documentaries, and shorts. Showcases K-cinema's bold storytelling and visual innovation.",
    websiteUrl: "https://koreanfilm.co.uk",
    logoUrl: null,
    startDate: "2026-11-05", // Usually early-mid November
    endDate: "2026-11-26",
    programmAnnouncedDate: "2026-10-01",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-10-08T10:00:00+00:00"),
    genreFocus: ["korean", "international", "thriller", "drama"],
    venues: ["prince-charles", "bfi-southbank", "genesis"],
    isActive: true,
  },

  // Sundance Film Festival: London
  {
    id: randomUUID(),
    name: "Sundance Film Festival: London 2026",
    slug: "sundance-london-2026",
    shortName: "Sundance London",
    year: 2026,
    description:
      "A curated selection of award-winning films from the renowned Sundance Film Festival in Utah, bringing American independent cinema to London audiences.",
    websiteUrl: "https://www.sundance.org/festivals/london",
    logoUrl: null,
    startDate: "2026-05-28", // Usually late May/early June
    endDate: "2026-05-31",
    programmAnnouncedDate: "2026-04-15",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-04-22T10:00:00+01:00"),
    genreFocus: ["independent", "american", "documentary", "debut"],
    venues: ["curzon-soho", "picturehouse-central"],
    isActive: true,
  },

  // Open City Documentary Festival
  {
    id: randomUUID(),
    name: "Open City Documentary Festival 2026",
    slug: "open-city-2026",
    shortName: "Open City Docs",
    year: 2026,
    description:
      "London's leading documentary film festival, championing innovative non-fiction filmmaking with artist films, features, and shorts from around the world.",
    websiteUrl: "https://opencitylondon.com",
    logoUrl: null,
    startDate: "2026-09-09", // Usually September
    endDate: "2026-09-13",
    programmAnnouncedDate: "2026-08-10",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-08-15T10:00:00+01:00"),
    genreFocus: ["documentary", "experimental", "artist-film", "international"],
    venues: ["ica", "close-up-cinema", "bfi-southbank"],
    isActive: true,
  },

  // East End Film Festival
  {
    id: randomUUID(),
    name: "East End Film Festival 2026",
    slug: "eeff-2026",
    shortName: "EEFF",
    year: 2026,
    description:
      "Celebrating independent cinema with a focus on East London's diverse communities. Features bold shorts, docs, and features from emerging filmmakers.",
    websiteUrl: "https://eastendfilmfestival.com",
    logoUrl: null,
    startDate: "2026-07-02", // Usually early July
    endDate: "2026-07-12",
    programmAnnouncedDate: "2026-05-28",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-06-03T10:00:00+01:00"),
    genreFocus: ["independent", "local", "documentary", "shorts"],
    venues: ["genesis", "rio-dalston", "rich-mix"],
    isActive: true,
  },

  // Birds Eye View ended in 2014; organisation rebranded to Reclaim The Frame
  // Removed from seed data - not a running festival

  // UK Jewish Film Festival
  {
    id: randomUUID(),
    name: "UK Jewish Film Festival 2026",
    slug: "ukjff-2026",
    shortName: "UKJFF",
    year: 2026,
    description:
      "The largest Jewish film festival in Europe, presenting features, documentaries, and shorts exploring Jewish life, culture, and history from around the world.",
    websiteUrl: "https://ukjewishfilm.org",
    logoUrl: null,
    startDate: "2026-11-11", // Usually mid-November
    endDate: "2026-11-22",
    programmAnnouncedDate: "2026-10-15",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-10-20T10:00:00+00:00"),
    genreFocus: ["jewish", "international", "documentary", "historical"],
    venues: ["jw3", "barbican", "curzon-soho"],
    isActive: true,
  },

  // London Indian Film Festival
  {
    id: randomUUID(),
    name: "London Indian Film Festival 2026",
    slug: "liff-2026",
    shortName: "LIFF",
    year: 2026,
    description:
      "The UK's largest South Asian film festival, showcasing bold features, documentaries, and shorts from Indian and South Asian cinema. Celebrating diversity and independent storytelling.",
    websiteUrl: "https://londonindianfilmfestival.co.uk",
    logoUrl: null,
    startDate: "2026-06-25", // Recently moved from April to June
    endDate: "2026-07-06",
    programmAnnouncedDate: "2026-05-20",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-05-28T10:00:00+01:00"),
    genreFocus: ["south-asian", "indian", "documentary", "independent"],
    venues: ["genesis"],
    isActive: true,
  },

  // Doc'n Roll Film Festival
  {
    id: randomUUID(),
    name: "Doc'n Roll Film Festival 2026",
    slug: "docnroll-2026",
    shortName: "Doc'n Roll",
    year: 2026,
    description:
      "The UK's leading music documentary film festival, showcasing the best non-fiction films about music, musicians, and music culture from around the world.",
    websiteUrl: "https://www.docnrollfestival.com",
    logoUrl: null,
    startDate: "2026-10-28", // Usually late October to early November
    endDate: "2026-11-09",
    programmAnnouncedDate: "2026-09-20",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-09-28T10:00:00+01:00"),
    genreFocus: ["documentary", "music", "independent"],
    venues: ["barbican", "bfi-southbank", "rio-dalston"],
    isActive: true,
  },

  // London International Animation Festival
  {
    id: randomUUID(),
    name: "London International Animation Festival 2026",
    slug: "liaf-2026",
    shortName: "LIAF",
    year: 2026,
    description:
      "The UK's largest animation festival, showcasing cutting-edge animation from around the world including features, shorts, VR experiences, and masterclasses.",
    websiteUrl: "https://liaf.org.uk",
    logoUrl: null,
    startDate: "2026-12-03", // Usually early December
    endDate: "2026-12-06",
    programmAnnouncedDate: "2026-10-28",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-11-02T10:00:00+00:00"),
    genreFocus: ["animation", "experimental", "shorts", "vr"],
    venues: ["barbican", "bfi-southbank", "ica"],
    isActive: true,
  },
];

async function seedFestivals() {
  console.log("Seeding festivals...");

  for (const festival of londonFestivals) {
    try {
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
      console.log(`  ✓ ${festival.name}`);
    } catch (error) {
      console.error(`  ✗ ${festival.name}:`, error);
    }
  }

  // Deactivate festivals that no longer exist
  const deactivateSlugs = ["birdseye-2026"];
  for (const slug of deactivateSlugs) {
    try {
      await db
        .update(festivals)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(festivals.slug, slug));
      console.log(`  ⊘ Deactivated: ${slug}`);
    } catch {
      // Ignore if not found
    }
  }

  console.log(`\nFestival seeding complete! Added ${londonFestivals.length} festivals.`);
}

// Run if called directly
seedFestivals()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  });
