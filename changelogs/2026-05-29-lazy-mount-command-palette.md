# Lazy-mount CommandPalette in +layout.svelte instead of static import

**PR**: perf campaign
**Date**: 2026-05-29

## Changes
- Removed the static `import CommandPalette` from `frontend/src/routes/+layout.svelte`.
- Added a `$state` holder (`CommandPalette`, initialised to `null`) plus an `$effect` that, when `palette.open` first becomes `true` in the browser, dynamically imports `CommandPalette.svelte` and assigns its default export.
- Rendered the component behind an `{#if CommandPalette}` guard in the `clerkEnabled` branch (the only branch that previously mounted it). The `else` branch is unchanged — it never mounted CommandPalette.
- Kept `GlobalCmdkBinding` eager so cmd+k / ctrl+k still flips `palette.open` synchronously; the effect mounts the palette within a microtask before the Dialog paints.

## Impact
- Affects every route, since `+layout.svelte` loads on all of them.
- Perf metric moved: **bundle KB / shared layout chunk**. The bits-ui Dialog primitive (its only consumer in `src`) plus the ~1500 lines of palette UI (CommandPaletteInput, ActiveFiltersRow, Chip, ResultsList and its 8 statically-imported row components) are removed from the shared layout chunk that loaded on every route and deferred into an on-open async chunk that only loads after the first Cmd+K.

## Behavior preservation
Rendered DOM is identical: `palette.open` starts `false`, so the previously-mounted closed Dialog emitted empty DOM and the now-unmounted component emits nothing either — byte-identical on first paint. Acceptance test: load `/`, `/film/[id]`, `/cinemas` and assert no `.cmdk-content`/`#cmdk-listbox` in initial DOM; press Cmd+K / Ctrl+K and assert `.cmdk-content` appears, input focuses, typing yields rows, and Arrow/Enter/Esc behave identically — with the palette chunk loading only after first open.
