# Delete dead API code

**PR**: #793
**Date**: 2026-10-04

## Changes
- Deleted `src/app/api/admin/bfi/status/` (route and test). Nothing called it, and it computed the next run of a daily/weekly BFI schedule that was removed on 2026-05-07.
- Deleted PATCH and DELETE from `src/app/api/admin/screenings/[id]/route.ts`, plus their tests in `[id]/route.test.ts` and `screenings.test.ts`. The admin screening modal only sends POST (create) and PUT (edit).
- `src/app/api/festivals/route.ts`: one anonymous select with `.limit(50)` and `CACHE_5MIN`. The `year`, `active`, `upcoming`, `genre` and `limit` query params, the signed-in select (`isFollowing`, `interestLevel`) and `meta.filters` are gone.
- `src/app/api/festivals/[slug]/route.ts`: always returns upcoming screenings with `CACHE_2MIN`. The `includeScreenings` and `includePast` flags, the count-only branch, the signed-in `followStatus` lookup, the schedule join (`isInSchedule`, `scheduleStatus`) and the hand-written response type are gone.
- New `src/app/api/festivals/festivals.test.ts` calls both handlers anonymously with no params, the only shape the SvelteKit frontend sends, and asserts every field `frontend/src/routes/festivals/**` and `sitemap.xml/+server.ts` read. It passed on the original routes before the edit and on the new ones after. A JSON dump of both responses differed only in the removed unread keys.
- Removed `getUserAwareCacheHeaders` and `PRIVATE_NO_STORE` from `src/lib/cache-headers.ts` (and `cache-headers.test.ts`), since the festival routes were their only callers.
- `computeFestivalStatus` and `computeTicketStatus` stay duplicated in the two festival routes. Route files can only export route fields, and no festivals module exists in `src/lib` or `src/db/repositories` to hold them.
- `src/app/api/travel-times/route.ts`: deleted the GET "use POST" help stub and the identity `googleMode` mapping (`mode === "bicycling" ? "bicycling" : mode`).
- Reused `BadRequestError` for the 400 in `cinemas`, `cinemas/[id]`, `films/[id]`, `films/[id]/similar` and `sleepers`. Reused `handleApiError` for the 500 in `admin/films/search`, `admin/scrape`, `people/[name]`, `letterboxd/preview` and `travel-times`.
- `letterboxd/preview`: the five-case `switch` on `LetterboxdImportError.code` is now a `Record<ImportError, [status, message]>` lookup with the same statuses and messages.
- `films/search` and `people/[name]`: dropped the `toRows` shim and typed `db.execute<Row>()` directly, as `directors` and `search/catalog` already do. The postgres-js driver returns an array, so the `.rows` fallback never ran.
- `admin/scrape/all`: dropped a try/catch around code that cannot throw synchronously.
- `admin/analytics`: dropped the `health`, `recordings` and `events` types, which the analytics page never requests.
- `films/[id]/similar`: empty and fallback responses use the shared `CACHE_5MIN` in place of a local copy.
- `instrumentation.ts`: dropped the empty `register()`; `onRequestError` stays.
- `src/middleware.ts`: matcher `"/(api|trpc)(.*)"` is now `"/api(.*)"`. The app has no tRPC.
- `vercel.json`: dropped the `/api/screenings` Cache-Control header. The route already sets the same `CACHE_5MIN` value on every 200. The `/api/films/(.*)` header stays.

## Impact
- pictures.london: every field the frontend reads from `/api/festivals` and `/api/festivals/[slug]` keeps its value, as the route test shows. Responses lose `isFollowing`, `interestLevel`, `meta.filters`, `followStatus`, `isInSchedule` and `scheduleStatus`, which no frontend code reads.
- A caller sending `?year=`, `?genre=` or the other removed festival params now gets the unfiltered list. No code in the repo sends them, and `ios-api-reference.md` does not document them.
- 400 bodies on the five reused routes gain `code: "BAD_REQUEST"`. Unexpected 500 bodies on the five reused routes now read `Internal server error`. On `/letterboxd`, that string replaces "An unexpected error occurred" for errors outside the five known Letterboxd codes.
- Empty `/api/films/[id]/similar` responses get `stale-while-revalidate=600` (was 300); `s-maxage` stays at 300.
- Requests to the deleted handlers now get 404 (`/api/admin/bfi/status`) or 405 (PATCH/DELETE on admin screenings, GET on travel-times).
