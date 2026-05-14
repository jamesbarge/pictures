# BFI IMAX parser — handle screening-before-title layout

**PR**: TBD
**Date**: 2026-05-14

## Summary

Follow-up to #490. After that PR, BFI Southbank was importing 94 screenings per /scrape but BFI IMAX still returned 0 because the PDF parser was structurally incapable of reading the IMAX section, which uses **screening-first** ordering (screening line before the film's title) — the opposite of Southbank's title-first format.

Three coordinated parser fixes get IMAX from 0 → 2 films per run, plus improved Southbank coverage (94 → 108 screenings).

## The IMAX section's structure

The BFI June 2026 PDF has Southbank films listed first (title → metadata → description → screenings) then BFI IMAX films at the end with the opposite layout:

```
[prev film description tail] SUN 31 MAY 13:00 BFI IMAX E.T. the Extra Terrestrial USA 1982. Director Steven Spielberg. ... description ... SUN 7 JUN 11:00 BFI IMAX Close Encounters of the Third Kind USA-UK 1977. Director ...
```

In the segmented output:
- Line 271: `SUN 31 MAY 13:00 BFI IMAX E.T. the Extra Terrestrial` ← screening + title
- Line 272: `USA 1982. Director Steven Spielberg. ...` ← metadata + description
- Line 273: `SUN 7 JUN 11:00 BFI IMAX Close Encounters of the Third Kind` ← next film's screening + title

The original parser bailed on line 271 because `isScreeningLine()` was true → `tryParseFilm` returned null. E.T.'s screening was discarded, its title never read.

## Three coordinated fixes

### 1. Segmenter over-firing — the bigger root cause

The metadata-line segmenter inserted `\n` BEFORE any cap-word position that could start a `cap-phrase YYYY. Director` match. For "E.T. the Extra Terrestrial USA 1982" the regex matched at "Extra", "Terrestrial", AND "USA" — each is a valid starting position because `{0,3}` extra cap words extends the match. Result: `\nExtra\nTerrestrial\nUSA 1982. Director` — title shattered across lines.

Two changes:

```ts
// (a) Lookbehind: reject positions immediately preceded by a letter or hyphen
//     (i.e., positions in the middle of a cap-phrase).
// (b) Restrict country extension to HYPHEN-prefixed only (real co-productions:
//     USA-UK-Canada), NOT space-separated extras (which over-matched titles).
/(?<![A-Za-z\-])(?=[A-Z][A-Za-z\-À-ſ]*(?:[-\/][A-Z][A-Za-z\-À-ſ]*)*\s+(?:19|20)\d{2}\.\s+(?:Director|Dir\.))/g
```

Trade-off: multi-word non-hyphenated country names like "Czech Republic" now get captured as just "Republic" (the last cap word). Title preservation matters more than country accuracy — we don't use the country field downstream.

### 2. `tryParseFilm` handles title-after-venue

When the starting line begins with a screening pattern, the parser now extracts the screening AND the trailing text as a candidate title:

```ts
const screeningWithSuffix = titleLine.match(
  /^(SCREENING_PATTERN)(\s+(.+))?$/i,
);
if (screeningWithSuffix) {
  const titleAfterVenue = screeningWithSuffix[3]?.trim();
  if (titleAfterVenue && titleAfterVenue.length >= 2) {
    precedingScreenings.push(...parseScreeningLine(screeningWithSuffix[1], pdfYear));
    titleLine = titleAfterVenue;
    // ...continue with normal title → metadata flow
  }
}
```

The captured screening attaches to the film at the end via `film.screenings.unshift(...precedingScreenings)`.

### 3. Pending-screening queue for standalone screening lines

Some IMAX entries put the screening on its own line, then the title on subsequent lines:

```
SUN 14 JUN 11:00 BFI IMAX
Ready Player One
USA-India-Singapore-Canada-UK-Japan-Australia 2018. Director ...
```

The main loop now detects standalone screening lines (regex anchored with `\s*$` after venue) and stashes them in `pendingScreenings`. The next film parsed claims these as its own.

### 4. Trailing-title hand-off in the follow-up screening loop

Once a film's metadata is parsed, the loop looks for additional screenings. But internal screening lines with trailing title text belong to the NEXT film, not the current one:

```ts
// Inside the post-metadata screening loop, before claiming:
const trailing = line.match(/^SCREENING_PATTERN\s+(\S.+)$/i);
if (trailing) {
  const tail = trailing[1].trim();
  const looksLikeNextFilmTitle =
    /^[A-Z]/.test(tail) &&
    tail.length <= 100 &&
    !/\bDirector\b/i.test(tail) &&
    !/\b(19|20)\d{2}\b/.test(tail) &&
    !/(Members can|standard ticket|Closed Captions|Audio Descri|Subtitles|book and )/i.test(tail);
  if (looksLikeNextFilmTitle) break;
}
```

Without this, Ready Player One was incorrectly claiming `SUN 21 JUN 20:00 BFI IMAX Jurassic Park 3D + intro` as one of its own screenings.

## Verification

- `npx tsc --noEmit` — clean
- `npm run test:run` — 910/910 pass
- `npm run scrape:bfi`:
  - Parsed 47 films / 110 screenings
  - BFI Southbank: 108 screenings (was 94 — +14)
  - **BFI IMAX: 2 screenings** (was 0): E.T. the Extra Terrestrial, Ready Player One

## Known limitations

- **Close Encounters of the Third Kind** and **Jurassic Park 3D + intro** appear in the segmented PDF text but still get dropped from the parsed output. The segmenter places them correctly; the line-walking logic in the parser appears to be consuming their screening lines as additional screenings of the previous film before the trailing-title hand-off kicks in. Acceptable incremental progress; further parser surgery deferred.
- Title accuracy varies: some films like "Spider-Man" or films with `&` get partial matches.
- The film count dropped (53 → 47) because the parser is now stricter about rejecting borderline title candidates. Net screening count is up (94 → 110).

## Follow-ups

- Investigate why Close Encounters / Jurassic Park 3D don't get parsed despite appearing on properly-segmented lines.
- Consider a two-pass parser: first pass extracts all metadata blocks with positions, second pass associates screenings to nearest metadata block (forward or backward).
- The 4 generic parse-artifact titles ("Ka", "Ka", "Ke", "Ke", "We") are still being rejected as suspicious — good — but they suggest the segmenter is still over-firing on some text positions. Worth a follow-up audit.
