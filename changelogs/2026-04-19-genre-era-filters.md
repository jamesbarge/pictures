# Wire Genre + Era filters

**PR**: TBD
**Date**: 2026-04-19

## Context

PR #431 (V2a Literary Antiqua redesign) hid the Genre + Era chip sections in both `DesktopFilterSidebar` and `MobileFilterSheet` because the homepage loader didn't expose `film.genres` and the `filmMap` filter chain didn't consume `filters.genres` or `filters.decades`. Clicking chips silently persisted dead state to localStorage without affecting results — so the sections were removed as part of the post-review cleanup, with a follow-up noted to restore them.

This PR closes that follow-up. `films.genres` has been in the DB all along, and year-based decade filtering is pure frontend work.

## Changes

### Backend — `src/db/repositories/screening.ts`

Add `genres: films.genres` to the `screeningWithDetailsSelect` object and the corresponding `ScreeningWithDetails` type. That propagates through `/api/screenings` automatically — every screenings consumer now gets `film.genres` in the response without other changes.

### Frontend loader — `frontend/src/routes/+page.server.ts`

Widen `ScreeningsResponse.film` with `genres: string[]` and pass it through in the mapper.

### Homepage filter chain — `frontend/src/routes/+page.svelte`

Add two new clauses inside the `filmMap` `$derived.by`:

```ts
if (filters.genres.length > 0) {
  // Chip labels are stored as lowercase and stripped of trailing punctuation
  // (e.g. "Doc." → "doc") to match the filter-store convention.
  const filmGenres = (s.film.genres ?? []).map(g => g.toLowerCase().replace('.', ''));
  if (!filters.genres.some(g => filmGenres.includes(g))) continue;
}

if (filters.decades.length > 0) {
  if (!s.film.year) continue;
  const decade = s.film.year >= 2000
    ? `${Math.floor(s.film.year / 10) * 10}s`
    : `${Math.floor((s.film.year % 100) / 10) * 10}s`;
  if (!filters.decades.includes(decade)) continue;
}
```

### Filter sections restored

- `DesktopFilterSidebar.svelte` — Genre + Era `<section>` blocks back in place with chip labels + `toggleGenre` / `toggleDecade` handlers.
- `MobileFilterSheet.svelte` — same, with the sheet's slightly different label set (full "Documentary" / "Animation" / "Pre-1970").

## Verification

- `svelte-check`: no new errors in files touched by this PR.
- Existing Playwright suite (shipped in PR #432): still green after these changes — the tests don't assert specific chip labels so the restored sections don't break anything.
- Manual verification: toggling "Drama" chip narrows the desktop grid to films whose `genres` array contains `drama`; toggling "2010s" narrows to `year >= 2010 && year <= 2019`; both chips together intersect.

## Follow-up

None — this closes the filter-wiring follow-up from PR #431.
