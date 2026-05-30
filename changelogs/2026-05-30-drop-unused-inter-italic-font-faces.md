# Delete the two unused Inter italic @font-face blocks and the 388KB InterVariable-Italic.woff2 (+2 related fonts fixes)

**PR**: perf campaign
**Date**: 2026-05-30

## Changes
- Removed the two italic Inter `@font-face` declarations from `frontend/src/app.css` (`'Inter Variable'` italic and `'Inter'` italic), both of which pointed at the now-dead `InterVariable-Italic.woff2`. The two normal-weight Inter blocks are untouched so `--font-sans` still resolves to the normal Inter face exactly as before.
- Deleted the 388 KB `frontend/static/fonts/InterVariable-Italic.woff2` asset (the single largest font file). The Inter family is consumed only by `Chip.svelte` (`var(--font-sans)`, weight 600 normal) and `FittedTitleCanvas.svelte` (canvas `ctx.font`, weight 800 normal); no `--font-sans`/Inter element ever requests `font-style: italic`, so the italic face could never be matched.
- Removed the six dead `.soft-display-144/-96/-72/-48/-36/-24` helper rules (plus the orphaned `/* V2a variable-font axis helpers */` comment) from `app.css`. A repo-wide grep found zero usages outside `app.css`; components that need those axes apply inline `font-variation-settings` in their own scoped blocks.
- Removed the duplicate hand-written `.font-display` rule from `app.css`. Tailwind v4 auto-generates the byte-identical `.font-display` utility from the `--font-display` token in the `@theme` block, so the markup class (used in EmptyState, DaySection, FilmCard, BreathingGrid, etc.) keeps working. `.font-serif`, `.font-serif-italic`, and `.font-mono-plex` are NOT auto-generated and were left intact.

## Impact
- Affects deployed static assets and the always-shipped global stylesheet across all routes.
- Perf metric moved: font bytes / global CSS bytes. -388 KB removed from deployed static assets (zero change to bytes downloaded by users, since the italic file was never requested), plus ~506 raw bytes of dead global CSS removed (~74 bytes gzip for the soft-display + font-display duplicate removals).

## Behavior preservation
Rendered DOM, layout, and computed styles are byte-identical: the deleted italic `@font-face` blocks could never match (no Inter/`--font-sans` element uses `font-style: italic`), the deleted `.font-display` rule is duplicated byte-for-byte by Tailwind's surviving auto-generated utility, and the `.soft-display-*` helpers had zero call sites. Verified via `vite build`: built CSS contains no `InterVariable-Italic` and no `soft-display`, still references the normal `InterVariable.woff2`, and emits `.font-display` exactly once.
