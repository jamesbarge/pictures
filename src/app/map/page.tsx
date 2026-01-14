/**
 * Map Page
 * Interactive map for defining cinema area filters
 */

// Force dynamic rendering - page requires database
export const dynamic = "force-dynamic";

import { db } from "@/db";
import { cinemas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MapPageClient } from "./map-page-client";

export const metadata = {
  title: "Cinema Map | Pictures",
  description: "Define your cinema area on the map",
};

export default async function MapPage() {
  // Fetch all active cinemas with coordinates
  const allCinemas = await db
    .select({
      id: cinemas.id,
      name: cinemas.name,
      shortName: cinemas.shortName,
      coordinates: cinemas.coordinates,
    })
    .from(cinemas)
    .where(eq(cinemas.isActive, true));

  // Filter to only cinemas with coordinates
  const cinemasWithCoords = allCinemas.filter((c) => c.coordinates !== null);

  return <MapPageClient cinemas={cinemasWithCoords} />;
}
