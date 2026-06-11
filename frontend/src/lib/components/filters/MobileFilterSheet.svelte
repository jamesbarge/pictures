<script lang="ts">
	import { filters } from '$lib/stores/filters.svelte';
	import { addDaysToDateString } from '$lib/london-date';
	import { userLocation } from '$lib/stores/user-location.svelte';
	import { haversineMiles, toLondonDateStr, useModalKeyboardTrap } from '$lib/utils';
	import { DECADE_OPTIONS, FORMAT_OPTIONS, GENRE_OPTIONS } from '$lib/constants/filters';
	import CalendarPopover from './CalendarPopover.svelte';
	import {
		AREA_CLUSTERS,
		cinemasInCluster
	} from './area-clusters';

	interface SheetCinema {
		id: string;
		name: string;
		shortName: string | null;
		address: { area: string } | null;
		coordinates?: { lat: number; lng: number } | null;
	}

	let {
		cinemas = [],
		filmCount = 0,
		open,
		onClose,
		returnFocusTo
	}: {
		cinemas?: SheetCinema[];
		filmCount?: number;
		open: boolean;
		onClose: () => void;
		returnFocusTo?: HTMLElement;
	} = $props();

	let datePickerOpen = $state(false);
	let cinemaSearch = $state('');
	let sheetEl = $state<HTMLDivElement>();
	let dateDialogEl = $state<HTMLDivElement>();
	let datePickerTriggerEl = $state<HTMLButtonElement>();

	function closeSheet() {
		datePickerOpen = false;
		cinemaSearch = '';
		onClose();
	}

	function closeDatePicker() {
		datePickerOpen = false;
	}

	$effect(() => {
		if (!open || !sheetEl) return;
		return useModalKeyboardTrap(sheetEl, closeSheet, {
			isActive: () => !datePickerOpen,
			returnFocusTo
		});
	});

	$effect(() => {
		if (!datePickerOpen || !dateDialogEl) return;
		return useModalKeyboardTrap(dateDialogEl, closeDatePicker, {
			lockBodyScroll: false,
			returnFocusTo: datePickerTriggerEl
		});
	});

	// Area cluster definitions + helpers live in `./area-clusters` so the
	// neighbourhood membership behind each chip has one source of truth.
	//
	// Cluster-to-cinema-ID membership is a pure function of `cinemas`, so
	// precompute it once per `cinemas` change instead of rescanning all cinemas
	// (lowercasing each area) on every chip toggle. Only the active check below
	// legitimately depends on the current `cinemaIds` selection.
	const clusterMembership = $derived.by(() => {
		const map = new Map<string, string[]>();
		for (const cluster of AREA_CLUSTERS) {
			map.set(cluster.label, cinemasInCluster(cluster.label, cinemas));
		}
		return map;
	});
	function isAreaActive(label: string) {
		const ids = clusterMembership.get(label) ?? [];
		return ids.length > 0 && ids.every((id) => filters.cinemaIds.includes(id));
	}
	function toggleArea(label: string) {
		const ids = clusterMembership.get(label) ?? [];
		if (ids.length === 0) return;
		const allActive = ids.every((id) => filters.cinemaIds.includes(id));
		filters.cinemaIds = allActive
			? filters.cinemaIds.filter((id) => !ids.includes(id))
			: Array.from(new Set([...filters.cinemaIds, ...ids]));
	}
	const matchingCinemas = $derived.by(() => {
		const query = cinemaSearch.trim().toLocaleLowerCase('en-GB');
		if (!query) return [];
		return cinemas.filter((cinema) =>
			[cinema.name, cinema.shortName]
				.filter((name): name is string => Boolean(name))
				.some((name) => name.toLocaleLowerCase('en-GB').includes(query))
		);
	});

	// "Within 2 miles" — browser geolocation required.
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

	// When
	const today = toLondonDateStr(new Date());
	const tomorrow = addDaysToDateString(today, 1);
	const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/London' });
	const todayLabel = dayFmt.format(new Date(today + 'T12:00:00Z'));
	const tomorrowLabel = dayFmt.format(new Date(tomorrow + 'T12:00:00Z'));
	const todayDay = new Date(today + 'T12:00:00Z').getUTCDate();
	const tomorrowDay = new Date(tomorrow + 'T12:00:00Z').getUTCDate();

	function pick(preset: 'today' | 'tomorrow' | 'weekend' | null) {
		if (preset === 'today') {
			filters.dateFrom = today;
			filters.dateTo = today;
		} else if (preset === 'tomorrow') {
			filters.dateFrom = tomorrow;
			filters.dateTo = tomorrow;
		} else if (preset === 'weekend') {
			filters.setDatePreset('weekend');
		} else {
			filters.setDatePreset(null);
		}
	}

	const whenState = $derived.by<'today' | 'tomorrow' | 'weekend' | 'date' | 'none'>(() => {
		if (!filters.dateFrom) return 'none';
		if (filters.dateFrom === today && filters.dateTo === today) return 'today';
		if (filters.dateFrom === tomorrow && filters.dateTo === tomorrow) return 'tomorrow';
		if (filters.dateFrom !== filters.dateTo) return 'weekend';
		return 'date';
	});

	// Time
	const TIME_OPTIONS = [
		{ label: 'Before noon', range: '9–12', from: 0, to: 11 },
		{ label: 'Matinée', range: '12–5', from: 12, to: 16 },
		{ label: 'Early evening', range: '5–8', from: 17, to: 20 },
		{ label: 'Late', range: 'after 8', from: 21, to: 23 }
	];
	function isTimeActive(f: number, t: number) { return filters.timeFrom === f && filters.timeTo === t; }
	function setTime(f: number, t: number) {
		if (isTimeActive(f, t)) filters.clearTimeRange();
		else filters.setTimePreset(f, t);
	}

	// Genre
	function toggleGenre(value: string) {
		filters.genres = filters.genres.includes(value)
			? filters.genres.filter(x => x !== value)
			: [...filters.genres, value];
	}
	function isGenreActive(value: string) { return filters.genres.includes(value); }

	// Era — decade chips. Matches the homepage filter chain's expected form.
	function toggleDecade(d: string) {
		filters.decades = filters.decades.includes(d)
			? filters.decades.filter(x => x !== d)
			: [...filters.decades, d];
	}
</script>

{#if open}
	<div
		bind:this={sheetEl}
		class="sheet"
		role="dialog"
		aria-label="Filter programme"
		aria-modal="true"
		tabindex="-1"
	>
		<header class="sheet-head">
			<h2 class="sheet-title">Filter</h2>
			<button class="close" onclick={closeSheet} aria-label="Close filters" type="button">×</button>
		</header>

		<div class="sheet-body">
			<!-- Where -->
			<section class="filter-section">
				<div class="section-head">
					<h4>Where</h4>
					<span class="hint">anywhere in London</span>
				</div>
				<label class="mini-search">
					<svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true">
						<circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2" fill="none"/>
						<path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.2"/>
					</svg>
					<input
						type="search"
						autocomplete="off"
						placeholder="Search cinemas by name…"
						aria-label="Search cinemas by name"
						bind:value={cinemaSearch}
					/>
				</label>
				{#if cinemaSearch.trim()}
					<div class="cinema-results">
						<p class="sr-only" aria-live="polite">
							{matchingCinemas.length} {matchingCinemas.length === 1 ? 'cinema' : 'cinemas'} found
						</p>
						{#if matchingCinemas.length > 0}
							<div class="chips" aria-label="Cinema search results">
								{#each matchingCinemas as cinema (cinema.id)}
									{@const active = filters.cinemaIds.includes(cinema.id)}
									<button
										type="button"
										class="chip"
										class:active
										onclick={() => filters.toggleCinema(cinema.id)}
										aria-pressed={active}
									>
										{cinema.shortName ?? cinema.name}
									</button>
								{/each}
							</div>
						{:else}
							<p class="cinema-empty">No cinemas found</p>
						{/if}
					</div>
				{/if}
				<div class="chips">
					{#each AREA_CLUSTERS as cluster (cluster.label)}
						{@const active = isAreaActive(cluster.label)}
						<button type="button" class="chip" class:active onclick={() => toggleArea(cluster.label)} aria-pressed={active}>{cluster.label}</button>
					{/each}
					<button
						type="button"
						class="chip"
						class:active={withinActive}
						onclick={toggleWithin}
						aria-pressed={withinActive}
						aria-busy={userLocation.status === 'requesting'}
					>
						{userLocation.status === 'requesting' ? 'Locating…' : 'Within 2 miles'}
					</button>
				</div>
			</section>

			<!-- When -->
			<section class="filter-section">
				<div class="section-head">
					<h4>When</h4>
					<span class="hint">today</span>
				</div>
				<div class="chips">
					<button type="button" class="chip" class:active={whenState === 'today'} onclick={() => pick(whenState === 'today' ? null : 'today')}>Today<span class="sub">{todayLabel} {todayDay}</span></button>
					<button type="button" class="chip" class:active={whenState === 'tomorrow'} onclick={() => pick(whenState === 'tomorrow' ? null : 'tomorrow')}>Tomorrow<span class="sub">{tomorrowLabel} {tomorrowDay}</span></button>
					<button type="button" class="chip" class:active={whenState === 'weekend'} onclick={() => pick(whenState === 'weekend' ? null : 'weekend')}>This weekend</button>
					<button
						bind:this={datePickerTriggerEl}
						type="button"
						class="chip"
						onclick={() => (datePickerOpen = true)}
					>
						Pick a date
					</button>
				</div>
			</section>

			<!-- Time of day -->
			<section class="filter-section">
				<div class="section-head"><h4>Time of day</h4></div>
				<div class="chips">
					{#each TIME_OPTIONS as opt (opt.label)}
						{@const active = isTimeActive(opt.from, opt.to)}
						<button type="button" class="chip" class:active onclick={() => setTime(opt.from, opt.to)} aria-pressed={active}>
							{opt.label}<span class="sub">{opt.range}</span>
						</button>
					{/each}
				</div>
			</section>

			<!-- Format -->
			<section class="filter-section">
				<div class="section-head"><h4>Format</h4></div>
				<div class="chips">
					{#each FORMAT_OPTIONS as fmt (fmt.value)}
						{@const active = filters.formats.includes(fmt.value)}
						<button type="button" class="chip" class:active onclick={() => filters.toggleFormat(fmt.value)} aria-pressed={active}>{fmt.label}</button>
					{/each}
				</div>
			</section>

			<!-- Genre -->
			<section class="filter-section">
				<div class="section-head"><h4>Genre</h4></div>
				<div class="chips">
					{#each GENRE_OPTIONS as genre (genre.value)}
						{@const active = isGenreActive(genre.value)}
						<button type="button" class="chip" class:active onclick={() => toggleGenre(genre.value)} aria-pressed={active}>{genre.label}</button>
					{/each}
				</div>
			</section>

			<!-- Era -->
			<section class="filter-section">
				<div class="section-head">
					<h4>From the era of</h4>
					<span class="hint">repertory only</span>
				</div>
				<div class="chips">
					{#each DECADE_OPTIONS as d (d)}
						{@const active = filters.decades.includes(d)}
						<button type="button" class="chip" class:active onclick={() => toggleDecade(d)} aria-pressed={active}>{d}</button>
					{/each}
				</div>
			</section>

			<div class="bottom-spacer"></div>
		</div>

		<footer class="sheet-foot">
			<button class="reset" type="button" onclick={() => filters.clearAll()}>Reset</button>
			<button class="show" type="button" onclick={closeSheet}>
				Show <span class="show-count">{filmCount}</span> films
			</button>
		</footer>
	</div>
{/if}

{#if datePickerOpen}
	<div
		bind:this={dateDialogEl}
		class="cal-overlay"
		role="dialog"
		aria-modal="true"
		aria-label="Pick a date"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) closeDatePicker(); }}
		onkeydown={(e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				closeDatePicker();
			}
		}}
	>
		<div class="cal-wrap">
			<CalendarPopover
				selected={filters.dateFrom ?? today}
				{today}
				width={340}
				onSelect={(iso) => {
					filters.dateFrom = iso;
					filters.dateTo = iso;
					closeDatePicker();
				}}
				onClose={closeDatePicker}
			/>
		</div>
	</div>
{/if}

<style>
	.sheet {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: var(--color-bg);
		display: flex;
		flex-direction: column;
		font-family: var(--font-sans);
		color: var(--color-text);
	}

	/* Black masthead with cream FILTER title — matches day-header / showings bar */
	.sheet-head {
		padding: 28px 18px 14px;
		background: #1f1f1f;
		border-bottom: 1px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.sheet-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 20px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		line-height: 1;
		color: #eae5c2;
	}

	.close {
		width: 36px;
		height: 36px;
		padding: 0;
		background: transparent;
		border: 1px solid #eae5c2;
		border-radius: 4px;
		cursor: pointer;
		font-family: var(--font-sans);
		font-size: 22px;
		font-weight: 400;
		color: #eae5c2;
		line-height: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}
	.close:hover { background: rgba(234, 229, 194, 0.18); }

	.sheet-body {
		flex: 1;
		overflow-y: auto;
		background: var(--color-bg);
	}

	.filter-section {
		padding: 18px;
		border-bottom: 1px solid var(--color-border);
	}

	.section-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 14px;
	}

	.section-head h4 {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-text);
	}

	.hint {
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 500;
		color: var(--color-text-tertiary);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.mini-search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		color: var(--color-text-tertiary);
		margin-bottom: 12px;
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.mini-search:focus-within { box-shadow: var(--shadow-brutalist-sm); }
	.mini-search input {
		width: 100%;
		min-width: 0;
		padding: 10px 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--color-text);
		font: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
	}
	.mini-search input::placeholder { color: var(--color-text-tertiary); opacity: 1; }
	.cinema-results { margin-bottom: 12px; }
	.cinema-empty {
		margin: 0;
		padding: 10px 12px;
		color: var(--color-text-tertiary);
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.chip {
		padding: 9px 14px;
		min-height: 38px;
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: var(--shadow-brutalist-sm);
		cursor: pointer;
		font-family: var(--font-sans);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			transform var(--duration-fast) var(--ease-sharp),
			box-shadow var(--duration-fast) var(--ease-sharp);
	}

	.chip:hover { background: var(--color-cream); }
	.chip:active {
		transform: translate(2px, 2px);
		box-shadow: 0 0 0 0 transparent;
	}

	.chip .sub {
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 10px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		opacity: 0.6;
	}

	.chip.active {
		background: var(--color-text);
		color: var(--color-cream);
	}

	.chip.active .sub { opacity: 0.75; color: var(--color-cream); }
	.chip:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

	.bottom-spacer { height: 96px; }

	.sheet-foot {
		border-top: 1px solid var(--color-border);
		background: var(--color-bg);
		padding: 14px 18px calc(14px + env(safe-area-inset-bottom, 0px));
		display: flex;
		align-items: stretch;
		gap: 12px;
	}

	.reset {
		flex: 0 0 auto;
		padding: 12px 16px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: var(--shadow-brutalist);
		color: var(--color-text);
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
	.reset:hover { background: var(--color-cream); }
	.reset:active {
		transform: translate(4px, 4px);
		box-shadow: 0 0 0 0 transparent;
	}

	.show {
		flex: 1;
		padding: 14px 16px;
		background: var(--color-text);
		color: var(--color-cream);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: var(--shadow-brutalist);
		font-family: var(--font-sans);
		font-size: 14px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			transform var(--duration-fast) var(--ease-sharp),
			box-shadow var(--duration-fast) var(--ease-sharp);
	}
	.show:hover { background: var(--color-accent-hover, #2f2f2f); }
	.show:active {
		transform: translate(4px, 4px);
		box-shadow: 0 0 0 0 transparent;
	}

	.show .show-count {
		font-family: var(--font-sans);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	/* Calendar overlay (uses the shared CalendarPopover from the toolbar) */
	.cal-overlay {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: rgba(31, 31, 31, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}

	.cal-wrap {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: var(--shadow-brutalist);
		overflow: hidden;
	}
</style>
