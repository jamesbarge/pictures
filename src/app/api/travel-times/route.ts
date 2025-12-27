/**
 * Travel Times API Route
 *
 * Calculates travel times from a user's location to multiple cinema destinations
 * using Google's Distance Matrix API (supports batch requests efficiently)
 *
 * POST /api/travel-times
 * Body: {
 *   origin: { lat: number, lng: number },
 *   destinations: { id: string, lat: number, lng: number }[],
 *   mode: "transit" | "walking" | "bicycling"
 * }
 *
 * Returns: {
 *   travelTimes: { [cinemaId]: number (minutes) },
 *   calculatedAt: string (ISO timestamp)
 * }
 */

import { NextResponse } from "next/server";
import { z } from "zod";

// Validation schema
const requestSchema = z.object({
  origin: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  destinations: z
    .array(
      z.object({
        id: z.string().min(1),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
    )
    .min(1)
    .max(25), // Google's limit per request
  mode: z.enum(["transit", "walking", "bicycling"]),
});

type TravelMode = z.infer<typeof requestSchema>["mode"];

// Google Distance Matrix API response types
interface DistanceMatrixResponse {
  status: string;
  origin_addresses: string[];
  destination_addresses: string[];
  rows: {
    elements: {
      status: string;
      duration?: {
        value: number; // seconds
        text: string;
      };
      distance?: {
        value: number; // meters
        text: string;
      };
    }[];
  }[];
  error_message?: string;
}

// Cache for travel times (simple in-memory cache)
// Key: `${originLat},${originLng}:${mode}` → { times, timestamp }
const cache = new Map<
  string,
  { times: Record<string, number>; timestamp: number }
>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getCacheKey(
  origin: { lat: number; lng: number },
  mode: TravelMode
): string {
  // Round to 4 decimal places (~11m precision) for cache key
  const lat = origin.lat.toFixed(4);
  const lng = origin.lng.toFixed(4);
  return `${lat},${lng}:${mode}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate request
    const parseResult = requestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { origin, destinations, mode } = parseResult.data;

    // Check cache
    const cacheKey = getCacheKey(origin, mode);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      // Return cached times for requested destinations
      const filteredTimes: Record<string, number> = {};
      for (const dest of destinations) {
        if (cached.times[dest.id] !== undefined) {
          filteredTimes[dest.id] = cached.times[dest.id];
        }
      }

      // Only use cache if we have all destinations
      if (Object.keys(filteredTimes).length === destinations.length) {
        return NextResponse.json({
          travelTimes: filteredTimes,
          calculatedAt: new Date(cached.timestamp).toISOString(),
          cached: true,
        });
      }
    }

    // Get Google Maps API key
    const apiKey =
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error("GOOGLE_MAPS_API_KEY not configured");
      return NextResponse.json(
        { error: "Travel time service unavailable" },
        { status: 503 }
      );
    }

    // Build Distance Matrix API request
    const originsParam = `${origin.lat},${origin.lng}`;
    const destinationsParam = destinations
      .map((d) => `${d.lat},${d.lng}`)
      .join("|");

    // Map our mode names to Google's
    const googleMode = mode === "bicycling" ? "bicycling" : mode;

    // Initial Fetch
    let data = await fetchGoogleTimes(
      originsParam,
      destinationsParam,
      googleMode,
      apiKey
    );

    if (!data) {
      return NextResponse.json(
        { error: "Failed to calculate travel times" },
        { status: 502 }
      );
    }

    // Parse results
    const travelTimes: Record<string, number> = {};
    const elements = data.rows[0]?.elements || [];
    const failedIndices: number[] = [];

    for (let i = 0; i < destinations.length; i++) {
      const element = elements[i];
      const destination = destinations[i];

      if (element?.status === "OK" && element.duration) {
        // Convert seconds to minutes, round up
        travelTimes[destination.id] = Math.ceil(element.duration.value / 60);
      } else {
        // Track failed destinations for potential fallback
        failedIndices.push(i);
      }
    }

    // Fallback: If mode is transit and we have failures, try walking for those specific destinations
    if (mode === "transit" && failedIndices.length > 0) {
      const fallbackDestinations = failedIndices.map((i) => destinations[i]);
      const fallbackDestinationsParam = fallbackDestinations
        .map((d) => `${d.lat},${d.lng}`)
        .join("|");

      console.log(
        `Attempting walking fallback for ${fallbackDestinations.length} destinations`
      );

      const fallbackData = await fetchGoogleTimes(
        originsParam,
        fallbackDestinationsParam,
        "walking",
        apiKey
      );

      if (fallbackData) {
        const fallbackElements = fallbackData.rows[0]?.elements || [];
        for (let i = 0; i < fallbackDestinations.length; i++) {
          const element = fallbackElements[i];
          const destination = fallbackDestinations[i];

          if (element?.status === "OK" && element.duration) {
            travelTimes[destination.id] = Math.ceil(
              element.duration.value / 60
            );
          }
        }
      }
    }

    // Update cache
    const now = Date.now();
    const existingCache = cache.get(cacheKey);
    cache.set(cacheKey, {
      times: { ...(existingCache?.times || {}), ...travelTimes },
      timestamp: now,
    });

    // Clean old cache entries periodically
    if (cache.size > 100) {
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL_MS) {
          cache.delete(key);
        }
      }
    }

    return NextResponse.json({
      travelTimes,
      calculatedAt: new Date().toISOString(),
      cached: false,
    });
  } catch (error) {
    console.error("Travel times API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function fetchGoogleTimes(
  originsParam: string,
  destinationsParam: string,
  mode: string,
  apiKey: string
): Promise<DistanceMatrixResponse | null> {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/distancematrix/json"
  );
  url.searchParams.set("origins", originsParam);
  url.searchParams.set("destinations", destinationsParam);
  url.searchParams.set("mode", mode);
  url.searchParams.set("units", "metric");
  url.searchParams.set("key", apiKey);

  // For transit, add departure_time for realistic estimates
  if (mode === "transit") {
    url.searchParams.set(
      "departure_time",
      Math.floor(Date.now() / 1000).toString()
    );
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    console.error(
      "Google Distance Matrix API error:",
      response.status,
      await response.text()
    );
    return null;
  }

  const data = await response.json();

  if (data.status !== "OK") {
    console.error(
      "Distance Matrix API status:",
      data.status,
      data.error_message
    );
    return null;
  }

  return data;
}

// Also support GET for simple testing (limited to a few destinations)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "Missing lat/lng parameters" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    message: "Use POST for travel time calculations",
    example: {
      method: "POST",
      body: {
        origin: { lat: parseFloat(lat), lng: parseFloat(lng) },
        destinations: [
          { id: "bfi-southbank", lat: 51.5069, lng: -0.115 },
          { id: "prince-charles", lat: 51.5114, lng: -0.1302 },
        ],
        mode: "transit",
      },
    },
  });
}
