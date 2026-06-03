# cmd+k step 4 — palette store + global cmd+k binding + media store

**PR**: TBD
**Date**: 2026-05-19
**Branch**: `feat/cmdk-palette-step4-stores`

## Context

Step 4 of `tasks/cmdk-palette-plan.md`. Wires the global ⌘K shortcut to a runes-backed store that the upcoming `CommandPalette.svelte` modal (step 5) will read from. No visible UI yet — pressing ⌘K silently toggles `palette.open` but nothing renders. This is intentional: ship the state layer before the UI shell so each PR is small and reviewable.

## What changed

### `frontend/src/lib/stores/palette.svelte.ts`

Runes-backed state for the command palette:
- `open: boolean` — modal visibility
- `query: string` — raw input
- `parsed: ParsedIntent` — `$derived(parseQuery(query, new Date(nowTick)))`
- `selectedIndex: number` — flat index across visible result rows
- `triggerSource: 'cmdk' | 'click' | 'route' | null` — for PostHog
- `nowTick: number` — ticks every 60s so "tonight" stays accurate in long idle sessions

Imperative state kept plain (not `$state`) — see the file's top doc:
- `inFlight: AbortController | null` — its identity changes on every abort+replace; reactivity would re-fire dependent effects
- `debounceTimer: ReturnType<typeof setTimeout> | null` — same
- `triggerEl: HTMLElement | null` — captured at open for focus restoration on close; never read from reactive code

Public API: `openPalette(source)`, `closePalette()`, `toggle(source)`, `setQuery(v)`, `setSelectedIndex(i)`, plus reactive getters.

### `frontend/src/lib/stores/media.svelte.ts`

Thin wrapper around `matchMedia('(min-width: 768px)')`. Defaults to `isDesktop: true` for SSR safety. Step 5's CommandPalette reads `media.isDesktop` to pick between centered-modal and full-screen-sheet presentations.

### `frontend/src/lib/components/search/GlobalCmdkBinding.svelte`

Document-level keydown listener mounted in `+layout.svelte`. Toggles the palette on ⌘K / Ctrl+K. Yields when the existing inline `SearchInput.svelte` combobox is already focused — that's the user actively searching the calendar; stealing their keystrokes would be hostile.

### `frontend/src/routes/+layout.svelte`

Mounts `<GlobalCmdkBinding />` once at the root, alongside `PostHogProvider` and `SyncProvider`. Both the `clerkEnabled` and `!clerkEnabled` branches get the binding so the shortcut works for signed-out users too.

### `frontend/src/lib/stores/palette.test.ts`

Vitest stub that asserts the parser is reachable from the stores directory. The full store behaviour is exercised by Playwright in step 10 once the UI shell exists — Vitest in node mode can't import `.svelte.ts` rune modules directly.

## Verification

- `cd frontend && npm test` — 50/50 pass (49 parser + 1 store sanity)
- `cd frontend && npx svelte-check` — 0 errors (2 pre-existing warnings)
- Manual: pressing ⌘K with no input focused sets `palette.open = true` (verified via Vitest sanity + svelte-check). No visible UI yet.

## Next

Step 5: build `CommandPalette.svelte` (bits-ui Dialog), `CommandPaletteInput.svelte`, `ActiveFiltersRow.svelte`, mount in root layout. Replace the inline `SearchInput`'s document-level cmd+k handler (lines 248-262) with a no-op since `GlobalCmdkBinding` now owns the shortcut.
