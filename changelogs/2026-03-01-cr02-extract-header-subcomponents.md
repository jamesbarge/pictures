# CR-02: Extract Header Subcomponents

**Branch**: `cr02-extract-header-subcomponents`
**Date**: 2026-03-01

## Changes

- Decomposed `src/components/layout/header.tsx` (1,522 lines) into 10 focused subcomponents
- Created `src/components/layout/header/` directory with the following extracted files:
  - `mobile-filters-button.tsx` (59 lines) - Filter toggle button with active count badge
  - `active-filter-chips.tsx` (111 lines) - Removable chips showing active filters
  - `film-type-filter.tsx` (69 lines) - All / New Releases / Repertory toggle group
  - `date-time-filter.tsx` (323 lines) - Date calendar picker + time preset/custom range
  - `film-search-filter.tsx` (353 lines) - Search combobox with film/cinema suggestions
  - `cinema-filter.tsx` (192 lines) - Cinema multi-select dropdown with search
  - `format-filter.tsx` (121 lines) - Projection format multi-select (35mm, IMAX, etc.)
  - `view-mode-toggle.tsx` (64 lines) - Posters / Text view mode selector
  - `clear-filters-button.tsx` (50 lines) - Clear all active filters
  - `share-filters-button.tsx` (58 lines) - Copy shareable URL to clipboard
  - `types.ts` (23 lines) - Shared Cinema, Season, HeaderProps interfaces
  - `utils.ts` (14 lines) - Shared getNextWeekend() helper
  - `index.ts` (18 lines) - Barrel export for all subcomponents
- `header.tsx` reduced to 157-line composition layer that imports and arranges subcomponents
- Renamed internal `DateFilter` to `DateTimeFilter` for clarity (it handles both date and time)

## Impact

- **Developer experience**: Each filter component is now independently readable, testable, and modifiable
- **No user-facing changes**: Pure refactoring with zero behavior changes
- **All 683 tests pass**, lint clean, TypeScript clean
- **Import path unchanged**: `@/components/layout/header` still works as before
