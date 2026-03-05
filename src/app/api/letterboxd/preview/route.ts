import { NextResponse } from "next/server";
import {
  getOrCreateImportResults,
  LetterboxdImportError,
} from "@/lib/letterboxd-import";

const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_USERNAME_LENGTH = 40;

/**
 * POST /api/letterboxd/preview — Unauthenticated
 *
 * Accepts a Letterboxd username, scrapes (or returns cached) watchlist data,
 * matches against local film DB, and returns a preview of matched films.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { username } = body as { username?: string };

  // Validate username
  if (
    !username ||
    typeof username !== "string" ||
    username.length === 0 ||
    username.length > MAX_USERNAME_LENGTH ||
    !USERNAME_REGEX.test(username)
  ) {
    return NextResponse.json(
      { error: "Invalid Letterboxd username" },
      { status: 400 },
    );
  }

  try {
    const results = await getOrCreateImportResults(username);

    return NextResponse.json({
      matched: results.matched,
      pendingLookup: results.unmatched.length,
      total: results.total,
      username: results.username,
      capped: results.capped,
    });
  } catch (error) {
    if (error instanceof LetterboxdImportError) {
      switch (error.code) {
        case "user_not_found":
          return NextResponse.json(
            { error: `Letterboxd user "${username}" not found` },
            { status: 404 },
          );
        case "private_watchlist":
          return NextResponse.json(
            { error: `Watchlist for "${username}" is private` },
            { status: 403 },
          );
        case "empty_watchlist":
          return NextResponse.json(
            { error: `Watchlist for "${username}" is empty` },
            { status: 422 },
          );
        case "rate_limited":
          return NextResponse.json(
            { error: "Letterboxd is rate-limiting requests. Please try again later." },
            { status: 429 },
          );
        case "network_error":
          return NextResponse.json(
            { error: "Failed to fetch watchlist from Letterboxd" },
            { status: 500 },
          );
      }
    }

    console.error("Letterboxd preview error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
