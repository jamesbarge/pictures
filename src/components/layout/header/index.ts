/**
 * Header subcomponent barrel exports
 *
 * The main Header component lives at ./header.tsx (parent directory)
 * and imports these subcomponents for composition.
 */

export { MobileFiltersButton } from "./mobile-filters-button";
export { ActiveFilterChips } from "./active-filter-chips";
export { FilmTypeFilter } from "./film-type-filter";
export { DateTimeFilter } from "./date-time-filter";
export { FilmSearchFilter } from "./film-search-filter";
export { CinemaFilter } from "./cinema-filter";
export { FormatFilter } from "./format-filter";
export { ViewModeToggle } from "./view-mode-toggle";
export { ClearFiltersButton } from "./clear-filters-button";
export { ShareFiltersButton } from "./share-filters-button";
export type { Cinema, Season, HeaderProps } from "./types";
