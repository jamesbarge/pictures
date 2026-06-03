# cmd+k step 5 — visible modal shell

**PR**: TBD
**Date**: 2026-05-19
**Branch**: `feat/cmdk-palette-step5-modal-shell`

## Context

Step 5 of `tasks/cmdk-palette-plan.md`. First visible UI for the global cmd+k palette — pressing ⌘K now opens a modal (desktop) / full-screen sheet (mobile). Result content is still a placeholder; step 6 wires the real result list.

## Components added

### `frontend/src/lib/components/search/CommandPalette.svelte`
Root shell. Uses `bits-ui` `Dialog.Root/Portal/Overlay/Content`. Listens for Escape to close. Focuses the input on every open via `tick() → inputRef.focus`. Switches presentation based on `media.isDesktop`:
- Desktop: centered modal, top 12vh, 640px wide, max-height `min(560px, calc(100vh - 24vh))`
- Mobile: full-screen sheet, `inset: 0`, `100dvh`

Backdrop is `rgba(0,0,0,0.45)` **flat** (not blurred) — intentional. Step 8 will land the "filter the calendar in real time as you type" feature; the backdrop needs to remain visually transparent enough that users see the calendar behind it react.

### `frontend/src/lib/components/search/CommandPaletteInput.svelte`
The search input row. Full ARIA combobox: `role="combobox"`, `aria-expanded="true"`, `aria-controls={listboxId}`, `aria-autocomplete="list"`, `aria-activedescendant`. 16px input font on mobile to prevent iOS auto-zoom. Clear button when query non-empty; ESC kbd hint otherwise.

Uses Svelte 5's `bind:value={() => getter, (v) => setter}` form to wire two-way binding to the palette store without exposing setters on the store API.

### `frontend/src/lib/components/search/ActiveFiltersRow.svelte`
Renders parsed-intent chips beneath the input. Chips render as `role="list"` of `role="listitem"` button siblings — **not inside the `<input>`**, per WAI-ARIA 1.2 (inputs are leaf elements with no interactive descendants). The visual "chips inside input" effect comes from sharing `var(--color-surface)` and no border separator.

### `frontend/src/lib/components/search/Chip.svelte`
Single peelable chip. Uppercase label in `var(--color-screening-bg/text)`, mono `×` remove. Removing currently clears the whole query (stopgap until step 8 lands proper chip→filter peeling).

### `frontend/src/routes/+layout.svelte`
Mounts `<CommandPalette />` next to the existing `<GlobalCmdkBinding />` in both clerkEnabled branches.

## New dep
`bits-ui ^2.18.1` — first headless UI library in `frontend/`. Used for the `Dialog` primitive (focus trap, portal, escape handling, ARIA defaults).

## Verification

- `cd frontend && npx svelte-check` — 0 errors, 2 pre-existing warnings
- `cd frontend && npm test` — 50/50 pass
- Pressing ⌘K shows the modal (verified via TS types + svelte-check; manual browser test deferred until step 6 has real results to interact with)

## Known stopgaps

- Chip removal clears whole query (step 8 will implement actual peeling)
- Result region shows static placeholder text (step 6 wires `palette.results`)
- No keyboard navigation in the listbox yet — input owns focus; arrow keys not yet wired (step 6)

## Next

Step 6: ResultsList + 8 row variants + flat `selectedIndex` arrow navigation across all sections.
