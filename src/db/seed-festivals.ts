/**
 * Seed script for London Film Festivals
 * Populates the festivals table with major London film festivals
 */

import { db } from "./index";
import { festivals } from "./schema";
import { randomUUID } from "crypto";

const londonFestivals = [
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
    venues: ["vue-leicester-square", "prince-charles-cinema"],
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
      "The UK's longest-running LGBTQIA+ film festival, celebrating queer cinema from around the world with features, shorts, and special events at BFI Southbank.",
    websiteUrl: "https://www.bfi.org.uk/flare",
    logoUrl: null,
    startDate: "2026-03-18", // Usually mid-late March
    endDate: "2026-03-29",
    programmAnnouncedDate: "2026-02-20",
    memberSaleDate: new Date("2026-02-25T10:00:00+00:00"),
    publicSaleDate: new Date("2026-03-04T10:00:00+00:00"),
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
      "The UK's leading short film festival showcasing the best British and international short films, animations, music videos, and experimental work.",
    websiteUrl: "https://shortfilms.org.uk",
    logoUrl: null,
    startDate: "2026-01-09", // Usually early-mid January
    endDate: "2026-01-18",
    programmAnnouncedDate: "2025-12-10",
    memberSaleDate: null,
    publicSaleDate: new Date("2025-12-15T10:00:00+00:00"),
    genreFocus: ["shorts", "animation", "experimental", "music-video"],
    venues: ["ica", "bfi-southbank", "rio-cinema"],
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

  console.log("\nFestival seeding complete!");
}

// Run if called directly
seedFestivals()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  });
