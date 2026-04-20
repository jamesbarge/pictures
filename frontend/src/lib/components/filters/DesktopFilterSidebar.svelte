<script lang="ts">
	import { filters } from '$lib/stores/filters.svelte';
	import { userLocation } from '$lib/stores/user-location.svelte';
	import { haversineMiles } from '$lib/utils';

	interface SidebarCinema {
		id: string;
		name: string;
		shortName: string | null;
		address: { area: string } | null;
		coordinates?: { lat: number; lng: number } | null;
	}

	let {
		cinemas = [],
		filmCount = 0,
		screeningCount = 0,
		onHide
	}: {
		cinemas?: SidebarCinema[];
		filmCount?: number;
		screeningCount?: number;
		onHide?: () => void;
	} = $props();

	// Where — area chips. Implemented as a cinemaId filter over the cinemas whose `address.area`
	// matches each cluster. "Within 2mi" is stubbed (geolocation not wired yet).
	const AREA_CLUSTERS: Array<{ label: string; areas: string[] }> = [
		{ label: 'Soho & West End', areas: ['Soho', 'West End', 'Leicester Square', 'Covent Garden', 'Mayfair', 'Bloomsbury'] },
		{ label: 'East', areas: ['Shoreditch', 'Hackney', 'Dalston', 'Hoxton', 'Bethnal Green', 'Mile End', 'Stratford', 'Whitechapel'] },
		{ label: 'South', areas: ['Peckham', 'Brixton', 'Clapham', 'Waterloo', 'Southbank', 'South Bank', 'Elephant', 'Bermondsey', 'Camberwell'] },
		{ label: 'North', areas: ['Camden', 'Islington', 'Angel', 'Kings Cross', 'Crouch End', 'Highgate', 'Archway'] }
	];

	function cinemasInCluster(label: string) {
		const cluster = AREA_CLUSTERS.find(c => c.label === label);
		if (!cluster) return [];
		return cinemas.filter(c => {
			const area = (c.address?.area ?? '').toLowerCase();
			return cluster.areas.some(a => area.includes(a.toLowerCase()));
		}).map(c => c.id);
	}

	function toggleArea(label: string) {
		const ids = cinemasInCluster(label);
		if (ids.length === 0) return;
		const allActive = ids.every(id => filters.cinemaIds.includes(id));
		if (allActive) {
			filters.cinemaIds = filters.cinemaIds.filter(id => !ids.includes(id));
		} else {
			const set = new Set([...filters.cinemaIds, ...ids]);
			filters.cinemaIds = Array.from(set);
		}
	}

	function isAreaActive(label: string) {
		const ids = cinemasInCluster(label);
		return ids.length > 0 && ids.every(id => filters.cinemaIds.includes(id));
	}

	// "Within 2 miles" — requires browser geolocation. Once granted, we take the
	// set of cinemas within 2mi of the user and set cinemaIds to them.
	const WITHIN_RADIUS = 2;

	function cinemasWithinRadius(radius: number): string[] {
		const here = userLocation.coords;
		if (!here) return [];
		return cinemas
			.filter(c => c.coordinates)
			.filter(c => haversineMiles(here, c.coordinates!) <= radius)
			.map(c => c.id);
	}

	const withinActive = $derived.by(() => {
		if (userLocation.status !== 'granted') return false;
		const ids = cinemasWithinRadius(WITHIN_RADIUS);
		return ids.length > 0 && ids.every(id => filters.cinemaIds.includes(id));
	});

	async function toggleWithin() {
		if (userLocation.status !== 'granted') {
			await userLocation.request();
			const s: string = userLocation.status;
			if (s !== 'granted') return;
		}
		const ids = cinemasWithinRadius(WITHIN_RADIUS);
		if (ids.length === 0) return;
		const allActive = ids.every(id => filters.cinemaIds.includes(id));
		filters.cinemaIds = allActive
			? filters.cinemaIds.filter(id => !ids.includes(id))
			: Array.from(new Set([...filters.cinemaIds, ...ids]));
	}

	// Time of day
	const TIME_OPTIONS = [
		{ key: 'morning', label: 'Before noon', range: '9–12', from: 0, to: 11 },
		{ key: 'matinee', label: 'Matinée', range: '12–5', from: 12, to: 16 },
		{ key: 'early-eve', label: 'Early eve', range: '5–8', from: 17, to: 20 },
		{ key: 'late', label: 'Late', range: 'after 8', from: 21, to: 23 }
	] as const;

	function setTime(from: number, to: number) {
		if (filters.timeFrom === from && filters.timeTo === to) {
			filters.clearTimeRange();
		} else {
			filters.setTimePreset(from, to);
		}
	}

	function isTimeActive(from: number, to: number) {
		return filters.timeFrom === from && filters.timeTo === to;
	}

	// Format
	const FORMATS = [
		{ value: '35mm', label: '35mm' },
		{ value: '70mm', label: '70mm' },
		{ value: 'imax', label: 'IMAX' },
		{ value: '4k', label: '4K' }
	];

	function toggleFormat(fmt: string) {
		filters.toggleFormat(fmt);
	}

	// Genre — labels are lowercased to form the filter key, which must match
	// the canonical TMDB genre name as stored in `films.genres`
	// ("drama", "comedy", "documentary", …). Never use a clipped form like
	// "Doc." here — the key "doc" would never match the stored "documentary".
	const GENRES = ['Drama', 'Comedy', 'Documentary', 'Thriller', 'Sci-fi', 'Romance', 'Horror'];

	function toggleGenre(g: string) {
		const key = g.toLowerCase();
		if (filters.genres.includes(key)) {
			filters.genres = filters.genres.filter(x => x !== key);
		} else {
			filters.genres = [...filters.genres, key];
		}
	}
	function isGenreActive(g: string) {
		return filters.genres.includes(g.toLowerCase());
	}

	// Era — decade chips. Labels match the homepage filter chain's expected form.
	const DECADES = ['2020s', '2010s', '2000s', '90s', '80s', '70s', 'Pre-1970'];

	function toggleDecade(d: string) {
		if (filters.decades.includes(d)) {
			filters.decades = filters.decades.filter(x => x !== d);
		} else {
			filters.decades = [...filters.decades, d];
		}
	}
</script>

<aside class="sidebar" aria-label="Filters">
	{#if onHide}
		<div class="sidebar-masthead">
			<button type="button" class="sidebar-hide-link" onclick={onHide} aria-label="Hide filters">
				<span class="hide-label">Hide</span>
				<span class="hide-chevron" aria-hidden="true">‹</span>
			</button>
		</div>
	{/if}

	<!-- Search -->
	<div class="search">
		<svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true">
			<circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2" fill="none"/>
			<path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.2"/>
		</svg>
		<input
			type="search"
			placeholder="Search films, cinemas…"
			bind:value={filters.filmSearch}
			aria-label="Search films, cinemas, directors"
		/>
	</div>

	<section class="section">
		<header class="section-head">
			<h4>Where</h4>
			<span class="hint">anywhere</span>
		</header>
		<div class="chips">
			{#each AREA_CLUSTERS as cluster (cluster.label)}
				{@const active = isAreaActive(cluster.label)}
				<button type="button" class="chip" class:active onclick={() => toggleArea(cluster.label)} aria-pressed={active}>
					{cluster.label}
				</button>
			{/each}
			<button
				type="button"
				class="chip"
				class:active={withinActive}
				onclick={toggleWithin}
				aria-pressed={withinActive}
				aria-busy={userLocation.status === 'requesting'}
				title={userLocation.status === 'denied' ? 'Location permission denied' : 'Within 2 miles of you'}
			>
				{userLocation.status === 'requesting' ? 'Locating…' : 'Within 2mi'}
			</button>
		</div>
		{#if userLocation.status === 'denied'}
			<p class="loc-note">Location denied — enable it in your browser to use this.</p>
		{:else if userLocation.status === 'unsupported'}
			<p class="loc-note">Your browser doesn't support location.</p>
		{:else if userLocation.status === 'granted' && cinemasWithinRadius(WITHIN_RADIUS).length === 0}
			<p class="loc-note">No cinemas within 2 miles of you.</p>
		{/if}
	</section>

	<section class="section">
		<header class="section-head">
			<h4>Time of day</h4>
		</header>
		<div class="time-grid">
			{#each TIME_OPTIONS as opt (opt.key)}
				{@const active = isTimeActive(opt.from, opt.to)}
				<button type="button" class="time-chip" class:active onclick={() => setTime(opt.from, opt.to)} aria-pressed={active}>
					<span class="time-label">{opt.label}</span>
					<span class="time-range">{opt.range}</span>
				</button>
			{/each}
		</div>
	</section>

	<section class="section">
		<header class="section-head"><h4>Format</h4></header>
		<div class="chips">
			{#each FORMATS as fmt (fmt.value)}
				{@const active = filters.formats.includes(fmt.value)}
				<button type="button" class="chip" class:active onclick={() => toggleFormat(fmt.value)} aria-pressed={active}>
					{fmt.label}
				</button>
			{/each}
		</div>
	</section>

	<section class="section">
		<header class="section-head"><h4>Genre</h4></header>
		<div class="chips">
			{#each GENRES as g (g)}
				{@const active = isGenreActive(g)}
				<button type="button" class="chip" class:active onclick={() => toggleGenre(g)} aria-pressed={active}>
					{g}
				</button>
			{/each}
		</div>
	</section>

	<section class="section">
		<header class="section-head">
			<h4>Era</h4>
			<span class="hint">repertory</span>
		</header>
		<div class="chips">
			{#each DECADES as d (d)}
				{@const active = filters.decades.includes(d)}
				<button type="button" class="chip" class:active onclick={() => toggleDecade(d)} aria-pressed={active}>
					{d}
				</button>
			{/each}
		</div>
	</section>

	<div class="foot">
		<button type="button" class="show-btn">
			Show <span class="show-count">{filmCount}</span>
		</button>
		<button type="button" class="reset-btn" onclick={() => filters.clearAll()}>Reset</button>
	</div>
</aside>

<style>
	.sidebar {
		padding: 1rem 1.375rem 2.5rem;
		background: var(--color-bg);
		border-right: 1px solid var(--color-border);
		font-family: var(--font-serif);
		color: var(--color-text);
	}

	.sidebar-masthead {
		display: flex;
		justify-content: flex-end;
		padding-bottom: 8px;
	}

	.sidebar-hide-link {
		display: inline-flex;
		align-items: baseline;
		gap: 4px;
		padding: 0;
		background: transparent;
		border: none;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 14px;
		color: var(--color-text-tertiary);
		cursor: pointer;
		transition: color var(--duration-fast) var(--ease-sharp);
	}

	.sidebar-hide-link:hover { color: var(--color-text); }

	.sidebar-hide-link .hide-chevron {
		font-family: var(--font-serif);
		font-style: normal;
		font-size: 15px;
		line-height: 1;
	}

	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 9px 11px;
		background: #fff;
		border: 1px solid var(--color-border);
		color: var(--color-text-tertiary);
		margin-bottom: 12px;
	}

	.search input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 12.5px;
		color: var(--color-text);
		min-width: 0;
	}

	.search input::placeholder {
		color: var(--color-text-tertiary);
		font-family: var(--font-serif-italic);
		font-style: italic;
	}

	.section {
		padding: 12px 0;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.section-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 8px;
	}

	.section-head h4 {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 13px;
		font-weight: 500;
		letter-spacing: -0.005em;
		color: var(--color-text);
		font-variation-settings: '"SOFT" 100', '"opsz" 24';
	}

	.hint {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 11px;
		color: var(--color-text-tertiary);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.chip {
		padding: 7px 10px;
		background: transparent;
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		font-family: var(--font-serif);
		font-size: 12.5px;
		font-weight: 400;
		letter-spacing: -0.005em;
		cursor: pointer;
		font-variation-settings: '"SOFT" 100', '"opsz" 24';
		transition: background-color var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp);
	}

	.chip:hover:not(.active):not(:disabled) {
		background: var(--color-bg-subtle);
		color: var(--color-text);
	}

	.chip.active {
		background: var(--color-text);
		color: var(--color-bg);
		font-weight: 500;
	}

	.chip:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.loc-note {
		margin: 8px 0 0;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 11px;
		color: var(--color-text-tertiary);
		line-height: 1.3;
	}

	.time-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 5px;
	}

	.time-chip {
		display: flex;
		flex-direction: column;
		gap: 2px;
		text-align: left;
		padding: 8px 10px;
		background: transparent;
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp);
	}

	.time-chip:hover:not(.active) {
		background: var(--color-bg-subtle);
		color: var(--color-text);
	}

	.time-chip.active {
		background: var(--color-text);
		color: var(--color-bg);
	}

	.time-label {
		font-family: var(--font-serif);
		font-size: 12.5px;
		letter-spacing: -0.005em;
		font-weight: 400;
	}

	.time-chip.active .time-label {
		font-weight: 500;
	}

	.time-range {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 10.5px;
		opacity: 0.55;
	}

	.time-chip.active .time-range { opacity: 0.7; }

	.foot {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-top: 14px;
	}

	.show-btn {
		flex: 1;
		padding: 9px;
		background: var(--color-text);
		color: var(--color-bg);
		border: 1px solid var(--color-border);
		font-family: var(--font-serif);
		font-size: 12.5px;
		font-weight: 500;
		letter-spacing: -0.005em;
		cursor: pointer;
		display: inline-flex;
		justify-content: center;
		align-items: baseline;
		gap: 5px;
	}

	.show-btn .show-count {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-weight: 400;
	}

	.reset-btn {
		padding: 9px 11px;
		background: transparent;
		border: 1px solid var(--color-border);
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 12px;
		color: var(--color-text);
		cursor: pointer;
	}

	.reset-btn:hover {
		background: var(--color-bg-subtle);
	}
</style>
