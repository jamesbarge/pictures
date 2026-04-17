# Fix: Mobile Input Zoom + Auto-Keyboard on Cinema Filter

**PR**: TBD
**Date**: 2026-04-17
**Branch**: `fix/mobile-input-zoom-and-autofocus`

## Problem

Two related mobile UX bugs when opening the cinema filter:

1. **Page zoomed in slightly** when the user tapped `ALL CINEMAS` to open the cinema picker dropdown. iOS Safari automatically zooms the viewport when a form control receives focus if its computed font-size is below 16px.
2. **The soft keyboard opened automatically** when the dropdown appeared, covering the cinema list and preventing the user from scrolling through options. The user expected the keyboard to appear only if they explicitly tapped the "Search cinemas..." input at the top of the dropdown.

## Root Causes

### Zoom
- `CinemaPicker.svelte:157` — `.cinema-search { font-size: var(--font-size-sm) }` = `0.8125rem` = **13px**.
- `SearchInput.svelte:281` — `.search-input { font-size: var(--font-size-sm) }` = 13px (same issue on the main header search bar).
- iOS Safari zooms any focused input with computed font-size < 16px.

### Auto-keyboard
- `Dropdown.svelte:37-46` — on open, a `$effect` ran `panelEl.querySelector('button, [href], input, ...')` and unconditionally called `.focus()` on the first match.
- Inside the cinema picker dropdown, the first focusable element is the `<input type="search">`, so it got focused automatically.
- Focusing an input on iOS pops the soft keyboard.

## Fix

### `frontend/src/lib/components/ui/Dropdown.svelte`

- Add `tabindex="-1"` to the panel element so it can receive programmatic focus without being in the tab order.
- Change the open-focus behaviour from "focus first focusable child" to "focus the panel itself" (`panelEl?.focus({ preventScroll: true })`).
- Add `.dropdown-panel:focus { outline: none }` — the visible open panel is the focus indicator; a second outline is noise.
- **Keyboard users** still land inside the dropdown (Tab moves them to the search input or list items).
- **Mobile users** no longer trigger the soft keyboard on open and can scroll the list freely.

### `frontend/src/lib/components/filters/CinemaPicker.svelte`

- Add a `@media (max-width: 767px)` rule that sets `.cinema-search { font-size: 16px }`.
- Desktop unchanged (stays at 13px = `--font-size-sm` for design consistency with the rest of the UI).

### `frontend/src/lib/components/filters/SearchInput.svelte`

- Same 16px-on-mobile rule for the main header `.search-input`.
- Same bug (13px = zoom on iOS), same fix pattern.

### `frontend/tests/mobile.spec.ts`

Added four tests inside the existing `Filter Bar` describe block:

1. `main search input is ≥16px on mobile` — computed font-size assertion on `.search-input`.
2. `cinema search input is ≥16px on mobile` — same for `.cinema-search` inside the mobile filter panel.
3. `cinema dropdown does NOT auto-focus the search input` — asserts `document.activeElement` is the `.dropdown-panel`, not an `INPUT`.
4. `explicit tap on cinema search DOES focus it` — regression guard for the intended behaviour (keyboard should still appear when the user taps the search bar).

Each test first waits for the 15 `BreathingGrid` cells to render (hydration signal) before interacting, since Svelte's onclick handlers only attach post-mount.

## Verification

- `npm run check` — zero new type errors (11 pre-existing errors unrelated to this fix).
- `npx playwright test tests/mobile.spec.ts` — 29 passed / 5 pre-existing failures (same set as before: flaky `.last()` selectors in `cinema dropdown does not overflow viewport` + `Mobile Navigation` tests that need separate investigation).
- Manual visual check at 390x844 (iPhone 12 Pro emulation): tapping FILTERS → ALL CINEMAS now opens the dropdown without zoom and without popping the keyboard. Tapping the Search cinemas... input explicitly does open the keyboard.

## Impact

- Mobile users on iOS Safari can now browse the cinema list by scrolling, rather than having to dismiss the keyboard first.
- No more viewport zoom on cinema filter open, main search tap, or any other input focus.
- Desktop and keyboard UX preserved.
