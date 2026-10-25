<script lang="ts">
	/**
	 * The sidebar's deeper filters: time of day, where, format, genre, era.
	 * Each tap applies at once (the list updates behind the drawer) and records
	 * a `filter_changed` event, which the old mobile sheet never did.
	 */
	import { filters } from '$lib/stores/filters.svelte';
	import { userLocation } from '$lib/stores/user-location.svelte';
	import { haversineMiles } from '$lib/utils';
	import { DECADE_OPTIONS, FORMAT_OPTIONS, GENRE_OPTIONS } from '$lib/constants/filters';
	import { trackFilterChange } from '$lib/analytics/posthog';
	import { AREA_CLUSTERS, cinemasInCluster } from './area-clusters';
	import { TIME_OF_DAY } from './active-choices';

	interface SidebarCinema {
		id: string;
		name: string;
		shortName: string | null;
		address: { area: string } | null;
		coordinates?: { lat: number; lng: number } | null;
	}

	let { cinemas = [] }: { cinemas?: SidebarCinema[] } = $props();

	// — Time of day —
	const timeActive = (from: number, to: number) => filters.timeFrom === from && filters.timeTo === to;
	function setTime(from: number, to: number, label: string) {
		const was = timeActive(from, to);
		if (was) filters.clearTimeRange();
		else filters.setTimePreset(from, to);
		trackFilterChange('time_preset', label, was ? 'removed' : 'set');
	}
	const timeHint = $derived(
		TIME_OF_DAY.find((t) => timeActive(t.from, t.to))?.label ?? 'Any time'
	);

	// — Where —
	let cinemaSearch = $state('');
	const clusterMembership = $derived.by(() => {
		const map = new Map<string, string[]>();
		for (const cluster of AREA_CLUSTERS) map.set(cluster.label, cinemasInCluster(cluster.label, cinemas));
		return map;
	});
	const allSelected = (ids: string[]) => ids.length > 0 && ids.every((id) => filters.cinemaIds.includes(id));
	function toggleIds(ids: string[], label: string) {
		if (ids.length === 0) return;
		const was = allSelected(ids);
		filters.cinemaIds = was
			? filters.cinemaIds.filter((id) => !ids.includes(id))
			: Array.from(new Set([...filters.cinemaIds, ...ids]));
		trackFilterChange('area', label, was ? 'removed' : 'added');
	}
	function toggleCinema(c: SidebarCinema) {
		const was = filters.cinemaIds.includes(c.id);
		filters.toggleCinema(c.id);
		trackFilterChange('cinema', c.name, was ? 'removed' : 'added');
	}
	const matchingCinemas = $derived.by(() => {
		const q = cinemaSearch.trim().toLocaleLowerCase('en-GB');
		if (!q) return [];
		return cinemas.filter((c) =>
			[c.name, c.shortName, c.address?.area].some((n) => n?.toLocaleLowerCase('en-GB').includes(q))
		);
	});
	const selectedCinemas = $derived(cinemas.filter((c) => filters.cinemaIds.includes(c.id)));

	const WITHIN_RADIUS = 2;
	function cinemasWithinRadius(): string[] {
		const here = userLocation.coords;
		if (!here) return [];
		return cinemas
			.filter((c) => c.coordinates && haversineMiles(here, c.coordinates) <= WITHIN_RADIUS)
			.map((c) => c.id);
	}
	const withinActive = $derived(userLocation.status === 'granted' && allSelected(cinemasWithinRadius()));
	async function toggleWithin() {
		if (userLocation.status !== 'granted') {
			await userLocation.request();
			if ((userLocation.status as string) !== 'granted') return;
		}
		toggleIds(cinemasWithinRadius(), 'Within 2 miles');
	}
	const whereHint = $derived(
		filters.cinemaIds.length === 0
			? 'Anywhere in London'
			: filters.cinemaIds.length === 1
				? '1 cinema'
				: `${filters.cinemaIds.length} cinemas`
	);

	// — Multi-select chips —
	function toggleIn(list: string[], value: string): string[] {
		return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
	}
	function toggleFormat(value: string, label: string) {
		const was = filters.formats.includes(value);
		filters.toggleFormat(value);
		trackFilterChange('format', label, was ? 'removed' : 'added');
	}
	function toggleGenre(value: string, label: string) {
		const was = filters.genres.includes(value);
		filters.genres = toggleIn(filters.genres, value);
		trackFilterChange('genre', label, was ? 'removed' : 'added');
	}
	function toggleDecade(d: string) {
		const was = filters.decades.includes(d);
		filters.decades = toggleIn(filters.decades, d);
		trackFilterChange('decade', d, was ? 'removed' : 'added');
	}
	const countHint = (n: number, one: string, many: string) => (n === 0 ? 'Any' : n === 1 ? `1 ${one}` : `${n} ${many}`);
</script>

<section class="group" aria-labelledby="fs-time">
	<div class="head"><h3 id="fs-time">Time of day</h3><span class="hint">{timeHint}</span></div>
	<div class="chips">
		{#each TIME_OF_DAY as t (t.label)}
			{@const on = timeActive(t.from, t.to)}
			<button type="button" class="chip" class:on aria-pressed={on} onclick={() => setTime(t.from, t.to, t.label)}>
				{t.label}<span class="sub">{t.range}</span>
			</button>
		{/each}
	</div>
</section>

<section class="group" aria-labelledby="fs-where">
	<div class="head"><h3 id="fs-where">Where</h3><span class="hint">{whereHint}</span></div>
	<label class="mini-search">
		<svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true">
			<circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2" fill="none" />
			<path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.2" />
		</svg>
		<input
			type="search"
			autocomplete="off"
			placeholder="Search cinemas or areas…"
			aria-label="Search cinemas or areas"
			bind:value={cinemaSearch}
		/>
	</label>
	{#if cinemaSearch.trim()}
		<p class="sr-only" aria-live="polite">
			{matchingCinemas.length} {matchingCinemas.length === 1 ? 'cinema' : 'cinemas'} found
		</p>
		{#if matchingCinemas.length > 0}
			<div class="chips results" aria-label="Cinema search results">
				{#each matchingCinemas as c (c.id)}
					{@const on = filters.cinemaIds.includes(c.id)}
					<button type="button" class="chip" class:on aria-pressed={on} onclick={() => toggleCinema(c)}>
						{c.shortName ?? c.name}
					</button>
				{/each}
			</div>
		{:else}
			<p class="empty">No cinemas found</p>
		{/if}
	{/if}
	<div class="chips">
		{#each selectedCinemas as c (c.id)}
			<button type="button" class="chip on remove" aria-label="Remove {c.name}" onclick={() => toggleCinema(c)}>
				{c.shortName ?? c.name}
				<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
					<path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.5" />
				</svg>
			</button>
		{/each}
		{#each AREA_CLUSTERS as cluster (cluster.label)}
			{@const ids = clusterMembership.get(cluster.label) ?? []}
			{@const on = allSelected(ids)}
			<button type="button" class="chip" class:on aria-pressed={on} onclick={() => toggleIds(ids, cluster.label)}>{cluster.label}</button>
		{/each}
		<button
			type="button"
			class="chip"
			class:on={withinActive}
			aria-pressed={withinActive}
			aria-busy={userLocation.status === 'requesting'}
			onclick={toggleWithin}
		>
			{userLocation.status === 'requesting' ? 'Locating…' : 'Within 2 miles'}
		</button>
	</div>
</section>

<section class="group" aria-labelledby="fs-format">
	<div class="head"><h3 id="fs-format">Format</h3><span class="hint">{countHint(filters.formats.length, 'format', 'formats')}</span></div>
	<div class="chips">
		{#each FORMAT_OPTIONS as f (f.value)}
			{@const on = filters.formats.includes(f.value)}
			<button type="button" class="chip" class:on aria-pressed={on} onclick={() => toggleFormat(f.value, f.label)}>{f.label}</button>
		{/each}
	</div>
</section>

<section class="group" aria-labelledby="fs-genre">
	<div class="head"><h3 id="fs-genre">Genre</h3><span class="hint">{countHint(filters.genres.length, 'genre', 'genres')}</span></div>
	<div class="chips">
		{#each GENRE_OPTIONS as g (g.value)}
			{@const on = filters.genres.includes(g.value)}
			<button type="button" class="chip" class:on aria-pressed={on} onclick={() => toggleGenre(g.value, g.label)}>{g.label}</button>
		{/each}
	</div>
</section>

<section class="group" aria-labelledby="fs-era">
	<div class="head"><h3 id="fs-era">Era</h3><span class="hint">{countHint(filters.decades.length, 'era', 'eras')}</span></div>
	<div class="chips">
		{#each DECADE_OPTIONS as d (d)}
			{@const on = filters.decades.includes(d)}
			<button type="button" class="chip" class:on aria-pressed={on} onclick={() => toggleDecade(d)}>{d}</button>
		{/each}
	</div>
</section>

<style>
	.group {
		--ink: #1f1f1f;
		--cream: #eae5c2;
		padding: 18px 20px 20px;
		border-top: 1px solid var(--color-border);
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}

	h3 {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-text);
	}

	.hint {
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text-tertiary);
		text-align: right;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chips + .chips,
	.results { margin-top: 10px; }

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 12px;
		background: #ffffff;
		color: var(--ink);
		border: 1px solid var(--ink);
		border-radius: 4px;
		box-shadow: 2px 2px 0 0 var(--ink);
		font-family: var(--font-sans);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			transform var(--duration-fast) var(--ease-sharp),
			box-shadow var(--duration-fast) var(--ease-sharp);
	}
	.chip:hover:not(.on) { background: var(--cream); }
	.chip:active { transform: translate(2px, 2px); box-shadow: 0 0 0 0 transparent; }
	.chip.on { background: var(--ink); color: var(--cream); }
	.chip:focus-visible { outline: 2px solid var(--color-text); outline-offset: 2px; }

	.sub {
		font-size: 10px;
		font-weight: 500;
		opacity: 0.7;
	}

	.mini-search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		background: #ffffff;
		color: #5a5a5a;
		border: 1px solid var(--ink);
		border-radius: 4px;
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin-bottom: 12px;
	}
	.mini-search:focus-within { box-shadow: 2px 2px 0 0 var(--ink); }
	.mini-search input {
		width: 100%;
		min-width: 0;
		min-height: 42px;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-size: 16px;
		letter-spacing: inherit;
		text-transform: inherit;
	}
	.mini-search input::placeholder { color: #5a5a5a; opacity: 1; font-size: 13px; }

	.empty {
		margin: 0 0 10px;
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text-tertiary);
	}

	@media (min-width: 1024px) {
		.chip { min-height: 36px; padding: 0 10px; font-size: 11px; }
	}
</style>
