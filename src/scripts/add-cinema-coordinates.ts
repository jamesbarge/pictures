/**
 * Add coordinates for all cinemas missing them
 * Run with: npx dotenv -e .env.local -- npx tsx src/scripts/add-cinema-coordinates.ts
 */

import { db } from "../db";
import { cinemas } from "../db/schema";
import { eq } from "drizzle-orm";

// Coordinates for London cinemas
// Source: Google Maps lookup for each venue
const cinemaCoordinates: Record<string, { lat: number; lng: number }> = {
  // Picturehouse cinemas
  "picturehouse-central": { lat: 51.5102, lng: -0.1349 }, // Shaftesbury Avenue
  "picturehouse-east-dulwich": { lat: 51.4551, lng: -0.0672 },
  "picturehouse-hackney": { lat: 51.5465, lng: -0.0554 },
  "ritzy-brixton": { lat: 51.4613, lng: -0.1151 },
  "picturehouse-greenwich": { lat: 51.4769, lng: -0.0148 },
  "picturehouse-clapham": { lat: 51.4625, lng: -0.1380 },
  "picturehouse-finsbury-park": { lat: 51.5651, lng: -0.1065 },
  "picturehouse-crouch-end": { lat: 51.5818, lng: -0.1213 },
  "picturehouse-ealing": { lat: 51.5130, lng: -0.3067 },
  "picturehouse-west-norwood": { lat: 51.4318, lng: -0.1034 },

  // Curzon cinemas
  "curzon-mayfair": { lat: 51.5090, lng: -0.1455 },
  "curzon-kingston": { lat: 51.4095, lng: -0.3022 },
  "curzon-aldgate": { lat: 51.5144, lng: -0.0734 },
  "curzon-camden": { lat: 51.5390, lng: -0.1426 },
  "curzon-wimbledon": { lat: 51.4214, lng: -0.2066 },
  "curzon-victoria": { lat: 51.4966, lng: -0.1437 },
  "curzon-hoxton": { lat: 51.5311, lng: -0.0774 },
  "curzon-soho": { lat: 51.5133, lng: -0.1314 },
  "curzon-richmond": { lat: 51.4613, lng: -0.3037 },
  "curzon-bloomsbury": { lat: 51.5218, lng: -0.1275 },

  // Everyman cinemas
  "everyman-barnet": { lat: 51.6521, lng: -0.1990 },
  "everyman-baker-street": { lat: 51.5205, lng: -0.1569 },
  "everyman-belsize-park": { lat: 51.5504, lng: -0.1647 },
  "everyman-borough-yards": { lat: 51.5052, lng: -0.0916 },
  "everyman-broadgate": { lat: 51.5195, lng: -0.0834 },
  "everyman-canary-wharf": { lat: 51.5051, lng: -0.0188 },
  "everyman-chelsea": { lat: 51.4868, lng: -0.1729 },
  "everyman-walthamstow": { lat: 51.5840, lng: -0.0203 },
  "everyman-crystal-palace": { lat: 51.4195, lng: -0.0752 },
  "everyman-hampstead": { lat: 51.5561, lng: -0.1776 },
  "everyman-kings-cross": { lat: 51.5351, lng: -0.1228 },
  "everyman-maida-vale": { lat: 51.5279, lng: -0.1856 },
  "everyman-muswell-hill": { lat: 51.5900, lng: -0.1440 },
  "everyman-stratford": { lat: 51.5430, lng: -0.0044 },
  "everyman-screen-on-the-green": { lat: 51.5390, lng: -0.1030 },

  // Electric cinemas
  "electric-portobello": { lat: 51.5168, lng: -0.2058 },
  "electric-white-city": { lat: 51.5117, lng: -0.2244 },

  // Independent cinemas
  "peckhamplex": { lat: 51.4705, lng: -0.0689 },
  "the-nickel": { lat: 51.4607, lng: -0.0756 },
  "gate-notting-hill": { lat: 51.5091, lng: -0.1960 },
  "lexi": { lat: 51.5421, lng: -0.2141 },
  "genesis": { lat: 51.5232, lng: -0.0408 }, // Mile End (duplicate entry)
  "screen-on-the-green": { lat: 51.5390, lng: -0.1030 },

  // Also add Cine Lumiere if not already there
  "cine-lumiere": { lat: 51.4947, lng: -0.1765 },
};

async function addCoordinates() {
  console.log("Adding coordinates to cinemas...\n");

  // Get all cinemas
  const allCinemas = await db.select().from(cinemas);

  let updated = 0;
  let alreadyHas = 0;
  let notFound = 0;

  for (const cinema of allCinemas) {
    if (cinema.coordinates) {
      alreadyHas++;
      continue;
    }

    const coords = cinemaCoordinates[cinema.id];
    if (coords) {
      await db
        .update(cinemas)
        .set({ coordinates: coords, updatedAt: new Date() })
        .where(eq(cinemas.id, cinema.id));
      console.log(`✓ ${cinema.shortName || cinema.name} - (${coords.lat}, ${coords.lng})`);
      updated++;
    } else {
      console.log(`✗ ${cinema.shortName || cinema.name} (${cinema.id}) - NO COORDINATES FOUND`);
      notFound++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Already had coordinates: ${alreadyHas}`);
  console.log(`Updated: ${updated}`);
  console.log(`Missing coordinates: ${notFound}`);

  process.exit(0);
}

addCoordinates().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
