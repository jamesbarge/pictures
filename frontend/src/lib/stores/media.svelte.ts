/**
 * Reactive media-query store for desktop/mobile presentation switching.
 *
 * The cmd+k command palette renders as a centered modal on desktop
 * (≥768px) and a full-screen sheet on mobile. Components read
 * `media.isDesktop` to pick the variant.
 *
 * SSR-safe: defaults to `true` (desktop) on the server so the markup
 * matches what most users will see on first paint. Mobile users see a
 * one-frame correction after hydration — acceptable for a modal that
 * isn't open at first paint anyway.
 */

import { browser } from "$app/environment";

const DESKTOP_QUERY = "(min-width: 768px)";

let isDesktop = $state(true);

if (browser) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  isDesktop = mql.matches;
  // Use the modern addEventListener API; Safari deprecated `addListener`.
  const onChange = (e: MediaQueryListEvent) => {
    isDesktop = e.matches;
  };
  mql.addEventListener("change", onChange);
  // No teardown — the store is module-scoped and lives for the
  // duration of the page. SvelteKit nav doesn't re-evaluate modules.
}

export const media = {
  get isDesktop() {
    return isDesktop;
  },
  get isMobile() {
    return !isDesktop;
  },
};
