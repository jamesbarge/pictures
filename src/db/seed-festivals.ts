/**
 * Seed script for London Film Festivals
 * Populates the festivals table with major London film festivals
 */

import { db } from "./index";
import { festivals } from "./schema";
import { eq } from "drizzle-orm";
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
    venues: ["bfi-southbank", "bfi-imax", "curzon-soho", "curzon-mayfair"],
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
      "The UK's premier horror and fantasy film festival. Five days of premieres, cult classics, and genre-bending cinema at ODEON Luxe Leicester Square and Prince Charles Cinema.",
    websiteUrl: "https://www.frightfest.co.uk",
    logoUrl: null,
    startDate: "2026-08-27", // Usually late August bank holiday weekend
    endDate: "2026-08-31",
    programmAnnouncedDate: "2026-07-15",
    memberSaleDate: null, // No member early access
    publicSaleDate: new Date("2026-07-20T10:00:00+01:00"),
    genreFocus: ["horror", "fantasy", "sci-fi", "thriller", "cult"],
    venues: ["prince-charles"],
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
      "The UK's largest independent film festival, championing first-time filmmakers and bold storytelling. Features competitions, masterclasses, and industry events.",
    websiteUrl: "https://raindance.org/festival",
    logoUrl: null,
    startDate: "2026-06-17", // Usually June
    endDate: "2026-06-26",
    programmAnnouncedDate: "2026-05-20",
    memberSaleDate: new Date("2026-05-25T10:00:00+01:00"),
    publicSaleDate: new Date("2026-06-01T10:00:00+01:00"),
    genreFocus: ["independent", "debut", "international", "documentary"],
    venues: ["curzon-soho"],
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
      "The 21st London Korean Film Festival, Europe's largest Korean film festival. Presents the best of contemporary and classic Korean cinema including features, documentaries, and shorts across two weeks.",
    websiteUrl: "https://koreanfilm.co.uk",
    logoUrl: null,
    startDate: "2026-11-05", // Usually early-mid November
    endDate: "2026-11-18",
    programmAnnouncedDate: "2026-10-01",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-10-08T10:00:00+00:00"),
    genreFocus: ["korean", "international", "thriller", "drama"],
    venues: ["bfi-southbank", "cine-lumiere", "ica"],
    isActive: true,
  },

  // Sundance Film Festival: London — last held 2019, never returned post-COVID
  // Moved to deactivateSlugs

  // Open City Documentary Festival
  {
    id: randomUUID(),
    name: "Open City Documentary Festival 2026",
    slug: "open-city-2026",
    shortName: "Open City Docs",
    year: 2026,
    description:
      "The 16th Open City Documentary Festival, London's leading documentary film festival. Championing innovative non-fiction filmmaking with artist films, features, and shorts from around the world.",
    websiteUrl: "https://opencitylondon.com",
    logoUrl: null,
    startDate: "2026-04-14", // Usually mid-April
    endDate: "2026-04-19",
    programmAnnouncedDate: "2026-03-15",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-03-20T10:00:00+00:00"),
    genreFocus: ["documentary", "experimental", "artist-film", "international"],
    venues: ["ica", "close-up-cinema", "barbican", "rich-mix"],
    isActive: true,
  },

  // East End Film Festival — ceased operations March 2020, dissolved July 2021
  // Moved to deactivateSlugs

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
      "The largest Jewish film festival in Europe. London dates feature features, documentaries, and shorts exploring Jewish life, culture, and history, followed by a nationwide touring programme.",
    websiteUrl: "https://ukjewishfilm.org",
    logoUrl: null,
    startDate: "2026-11-05", // London window, usually early-mid November
    endDate: "2026-11-15",
    programmAnnouncedDate: "2026-10-08",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-10-13T10:00:00+00:00"),
    genreFocus: ["jewish", "international", "documentary", "historical"],
    venues: ["barbican", "curzon-soho"],
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
    startDate: "2026-11-27", // Usually late Nov to early Dec
    endDate: "2026-12-06",
    programmAnnouncedDate: "2026-10-20",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-10-25T10:00:00+00:00"),
    genreFocus: ["animation", "experimental", "shorts", "vr"],
    venues: ["barbican", "close-up-cinema", "garden"],
    isActive: true,
  },

  // Doc'n Roll Film Festival - Music documentary specialists
  {
    id: randomUUID(),
    name: "Doc'n Roll Film Festival 2026",
    slug: "docnroll-2026",
    shortName: "Doc'n Roll",
    year: 2026,
    description:
      "The UK's music documentary film festival, now in its 13th edition. Celebrating the stories behind the music with features and shorts exploring artists, scenes, and subcultures.",
    websiteUrl: "https://www.docnrollfestival.com",
    logoUrl: null,
    startDate: "2026-10-24", // Estimated from 2025 pattern (Oct 25-Nov 9)
    endDate: "2026-11-08",
    programmAnnouncedDate: "2026-09-25",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-10-01T10:00:00+01:00"),
    genreFocus: ["music", "documentary", "subculture"],
    venues: ["barbican", "bfi-southbank", "rio-dalston"],
    isActive: true,
  },

  // London Independent Film Festival
  {
    id: randomUUID(),
    name: "London Independent Film Festival 2026",
    slug: "liff-2026",
    shortName: "LIFF",
    year: 2026,
    description:
      "London's indie film festival at Genesis Cinema, now in its 24th edition. Showcasing debut features, international shorts, and emerging talent with the SMASH Pitch competition.",
    websiteUrl: "https://liff.org",
    logoUrl: null,
    startDate: "2026-04-09", // Estimated from 2025 pattern (Apr 10-19)
    endDate: "2026-04-19",
    programmAnnouncedDate: "2026-03-10",
    memberSaleDate: null,
    publicSaleDate: new Date("2026-03-15T10:00:00+00:00"),
    genreFocus: ["independent", "debut", "international", "shorts"],
    venues: ["genesis"],
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
  const deactivateSlugs = ["birdseye-2026", "sundance-london-2026", "eeff-2026"];
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
