import { toLondonDateStr } from '$lib/utils';
import { today as todayStore } from '$lib/stores/today.svelte';

/**
 * A wall clock that is stable across hydration.
 *
 * The calendar routes are ISR-cached (`/` and `/this-weekend` for an hour,
 * `/tonight` for fifteen minutes), so a visitor's clock is routinely ahead of
 * the clock their cached HTML was rendered with. Each page drops expired
 * screenings at render time — and when that filter runs during the *first*
 * client render, it removes films the server had included, which shifts the
 * keyed `{#each}`.
 *
 * That shift is not cosmetic: Svelte deliberately skips writing `src` and
 * `srcset` while hydrating, on the assumption that server and client agree
 * (see `svelte/src/internal/client/dom/elements/attributes.js`). A shifted
 * card therefore keeps the *previous* film's poster, and because nothing
 * re-renders afterwards it stays wrong for the whole session. Measured in
 * production at 31 of 40 homepage cards.
 *
 * So: report the instant the HTML was rendered until hydration has committed,
 * which makes the first client render identical to the server's, then read the
 * live clock. The update that follows runs through the normal (non-hydrating)
 * code path, where `src` *is* written.
 *
 * Note this re-filters *once*, when `hydrated` flips — `now` is read fresh but
 * nothing invalidates it afterwards, so a tab left open for hours keeps showing
 * screenings that have since started. That matches the previous behaviour (a
 * bare `Date.now()` was equally non-reactive) and is out of scope here.
 *
 * The same hazard is worked around for persisted filters in
 * `stores/filters.svelte.ts`, which defers its localStorage restore behind two
 * rAFs. The two mechanisms look contradictory — an `$effect` body also runs in
 * a microtask — but the difference is *when the microtask is queued*: that
 * store's ran at module-eval time, before `hydrate()` was ever called, so it
 * landed mid-hydration. An `$effect` is queued during mount and flushed after
 * `hydrate()` has already set `hydrating = false`, so it is safe.
 *
 * Must be called during component initialisation (it registers an `$effect`).
 *
 * @param serverNow `data.renderedAt` — the epoch ms the page data was built,
 *                  carried in the payload so it survives ISR caching.
 */
export function hydrationSafeClock(serverNow: number) {
	let hydrated = $state(false);

	$effect(() => {
		hydrated = true;
	});

	return {
		/** Epoch ms: the server's instant until hydration commits, live after. */
		get now(): number {
			return hydrated ? Date.now() : serverNow;
		},
		/** London civil date: the server's until hydration commits, live after. */
		get today(): string {
			return hydrated ? todayStore.value : toLondonDateStr(new Date(serverNow));
		}
	};
}
