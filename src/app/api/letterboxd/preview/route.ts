import { NextResponse } from "next/server";
import {
  getOrCreateImportResults,
  LetterboxdImportError,
  type ImportError,
} from "@/lib/letterboxd-import";
import { handleApiError } from "@/lib/api-errors";

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

    // Include slim unmatched entries so the client can forward them to
    // the save endpoint, which triggers background TMDB lookup via the cloud orchestrator.
    const unmatchedEntries = results.unmatched.map((e) => ({
      title: e.title,
      year: e.year,
      slug: e.letterboxdSlug,
    }));

    return NextResponse.json({
      matched: results.matched,
      pendingLookup: results.unmatched.length,
      unmatchedEntries,
      total: results.total,
      username: results.username,
      capped: results.capped,
    });
  } catch (error) {
    if (error instanceof LetterboxdImportError) {
      const responses: Record<ImportError, [number, string]> = {
        user_not_found: [404, `Letterboxd user "${username}" not found`],
        private_watchlist: [403, `Watchlist for "${username}" is private`],
        empty_watchlist: [422, `Watchlist for "${username}" is empty`],
        rate_limited: [429, "Letterboxd is rate-limiting requests. Please try again later."],
        network_error: [500, "Failed to fetch watchlist from Letterboxd"],
      };
      const [status, message] = responses[error.code];
      return NextResponse.json({ error: message }, { status });
    }

    return handleApiError(error, "POST /api/letterboxd/preview");
  }
}
