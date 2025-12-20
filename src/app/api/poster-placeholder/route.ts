/**
 * Poster Placeholder API Route
 *
 * Generates and serves SVG placeholder posters for films
 * without available poster images. Cached for performance.
 */

import { NextRequest, NextResponse } from "next/server";
import { generatePosterPlaceholder } from "@/lib/posters/placeholder";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const title = searchParams.get("title");
  const yearStr = searchParams.get("year");

  if (!title) {
    return NextResponse.json(
      { error: "Title parameter is required" },
      { status: 400 }
    );
  }

  const year = yearStr ? parseInt(yearStr, 10) : undefined;
  const svg = generatePosterPlaceholder(title, year);

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      // Cache for 1 year - placeholders are deterministic
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
