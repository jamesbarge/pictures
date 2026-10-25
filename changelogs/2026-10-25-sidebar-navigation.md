# Header, nav and filters move into a sidebar

**PR**: #TBD
**Date**: 2026-10-25

## Changes
- `layout/Sidebar.svelte` holds the logo, the nav and, on the homepage, every filter, on every page. From 1024px it sits beside the page as a 320px column with its own scroll and a Hide menu button. The collapsed state is saved per browser (`pictures-sidebar-collapsed`), and an inline script in `app.html` applies it as `data-sidebar-collapsed` on `<html>` before first paint, so a collapsed sidebar never flashes open on load. Focus moves between Hide menu and the burger as the sidebar collapses and expands. Below 1024px the sidebar is a drawer from the left: a modal dialog with a focus trap, Escape to close, a scrim, and focus returned to the burger. The trap stands down while the date picker or ⌘K is open.
- `layout/TopBar.svelte` stays on the page while the sidebar is closed. On the homepage it joins the burger, a small logo and ALL / NEW / REP into one bar, with the search box underneath on phones and beside it on desktop. Other pages get the burger, the logo and a Search films button that opens ⌘K (`layout/PaletteButton.svelte`). The burger shows a count of active filters.
- The nav has four items: What's on (also marked current on /tonight and /this-weekend), Cinemas (also current on /map, with a List / Map row in the sidebar), Reachable and Watchlist. Tonight leaves the nav because What's on with the Today pill covers it. Directors had the fewest menu taps of any nav link in PostHog, so it leaves too. Both pages still load by URL, and ⌘K still finds directors. About, Privacy and Terms sit at the foot of the sidebar, and the page footer is removed.
- ALL / NEW / REP leads. `filters/ProgrammeToggle.svelte` is a radiogroup with live film counts (every other filter applied) and arrow-key movement. An option with no films is disabled.
- The sidebar filters are `filters/SearchBox.svelte`, `filters/DayPills.svelte` (Today / Tomorrow / This week, plus a date picker dialog) and `filters/FilterSections.svelte` (time of day; where, with a cinema search that also matches areas, area chips and within 2 miles; format; genre; era). They apply as you tap, and every change sends `filter_changed`. The old mobile sheet sent none, so phone filter use was invisible in PostHog.
- `filters/active-choices.ts` turns the active filters into words. The first day header lists them with the film count and a Clear button, and the burger badge counts them. Unit tests live in `active-choices.test.ts`.
- Posters / Text moves to two icons in the sidebar's View row. `stores/shell.svelte.ts` holds the drawer, collapse and view state and the homepage's live counts.
- Removed: `layout/Header.svelte`, `layout/Footer.svelte`, `filters/FigmaToolbar.svelte`, `filters/MobileFilterSheet.svelte`, `ui/DimmerDial.svelte` and its boot script in `app.html`, `ui/Dropdown.svelte` and `ui/Checkbox.svelte` (only the toolbar used them), and the settings page's Theme row, which only pointed at the dimmer.
- `static/pictures-mark.png` (9KB) is the hand-drawn mark cropped from `pictures-logo.png` (194KB). The sidebar and top bar use it.
- The search label reads "Search films, cinemas and directors", which matches what the search covers (it never searched cast).

## Impact
- Phones (80% of pageviews) reach the listings after one bar and the search box. The old header stacked four rows of controls above them.
- Anyone with a house-lights setting saved now sees the standard palette, since the design has no dimmer.
- E2E specs are rewritten for the new chrome.
- Overlaps #845 (remove STARTING SOON), which also edits `+page.svelte` and the specs. Whichever merges second needs a rebase. This PR leaves STARTING SOON as it is.

## Not in this PR
- Live counts on the deeper filter chips (genre, format, era, areas). Only ALL / NEW / REP and the totals have counts.
- The film cards and the two-column phone poster grid from the prototype. The cards stay as they are.
- `npm run check` reports one error in `routes/map/+page.svelte` (CinemaMap's `Cinema[]` prop). Main has the same error.
