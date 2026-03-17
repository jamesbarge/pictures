# Kaizen — Unexport 10 TMDB Module-Private Types

**PR**: #389
**Date**: 2026-03-17

## Changes
- Removed `export` from 9 interfaces in `src/lib/tmdb/types.ts`: TMDBGenre, TMDBCountry, TMDBLanguage, TMDBCastMember, TMDBCrewMember, TMDBVideo, TMDBPersonKnownFor, TMDBPersonCrewCredit, TMDBPersonCastCredit
- Removed `export` from AmbiguityScore in `src/lib/tmdb/ambiguity.ts`
- All 10 types had zero external importers — used only as member types of other exported interfaces (e.g., `TMDBGenre[]` in `TMDBMovieDetails.genres`)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
- The barrel `export type * from "./types"` in `tmdb/index.ts` narrows to only genuinely public types
