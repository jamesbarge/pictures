<script lang="ts">
	import { filters } from '$lib/stores/filters.svelte';
	import { addDaysToDateString } from '$lib/london-date';
	import { userLocation } from '$lib/stores/user-location.svelte';
	import { haversineMiles, toLondonDateStr, useModalKeyboardTrap } from '$lib/utils';
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
		onClose
	}: {
		cinemas?: SheetCinema[];
		filmCount?: number;
		open: boolean;
		onClose: () => void;
	} = $props();

	let datePickerOpen = $state(false);

	// Modal a11y — Escape closes the sheet and body scroll is locked while
	// it's open. The shared helper handles both concerns and restores prior
	// `body.style.overflow` on close.
	$effect(() => {
		if (!open) return;
		return useModalKeyboardTrap(onClose);
	});

	// Area cluster definitions + helpers live in `./area-clusters` and are
	// shared with `DesktopFilterSidebar` so the two surfaces can't disagree
	// about which neighbourhoods belong to which chip.
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

	// Format
	const FORMATS = [
		{ value: '35mm', label: '35mm' },
		{ value: '70mm', label: '70mm' },
		{ value: 'imax', label: 'IMAX' },
		{ value: '4k', label: '4K' }
	];

	// Genre — chip labels map to lowercase keys. Mobile uses full-word labels.
	const GENRES = ['Drama', 'Comedy', 'Documentary', 'Thriller', 'Sci-fi', 'Romance', 'Animation', 'Horror'];
	function toggleGenre(g: string) {
		const key = g.toLowerCase();
		filters.genres = filters.genres.includes(key)
			? filters.genres.filter(x => x !== key)
			: [...filters.genres, key];
	}
	function isGenreActive(g: string) { return filters.genres.includes(g.toLowerCase()); }

	// Era — decade chips. Matches the homepage filter chain's expected form.
	const DECADES = ['2020s', '2010s', '2000s', '90s', '80s', '70s', 'Pre-1970'];
	function toggleDecade(d: string) {
		filters.decades = filters.decades.includes(d)
			? filters.decades.filter(x => x !== d)
			: [...filters.decades, d];
	}
</script>

{#if open}
	<div class="sheet" role="dialog" aria-label="Filter programme" aria-modal="true">
		<header class="sheet-head">
			<h2 class="sheet-title">Filter</h2>
			<button class="close" onclick={onClose} aria-label="Close filters" type="button">×</button>
		</header>

		<div class="sheet-body">
			<!-- Where -->
			<section class="filter-section">
				<div class="section-head">
					<h4>Where</h4>
					<span class="hint">anywhere in London</span>
				</div>
				<div class="mini-search">
					<svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true">
						<circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2" fill="none"/>
						<path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.2"/>
					</svg>
					<span>Search cinemas by name…</span>
				</div>
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
					<button type="button" class="chip" onclick={() => (datePickerOpen = true)}>Pick a date</button>
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
					{#each FORMATS as fmt (fmt.value)}
						{@const active = filters.formats.includes(fmt.value)}
						<button type="button" class="chip" class:active onclick={() => filters.toggleFormat(fmt.value)} aria-pressed={active}>{fmt.label}</button>
					{/each}
				</div>
			</section>

			<!-- Genre -->
			<section class="filter-section">
				<div class="section-head"><h4>Genre</h4></div>
				<div class="chips">
					{#each GENRES as g (g)}
						{@const active = isGenreActive(g)}
						<button type="button" class="chip" class:active onclick={() => toggleGenre(g)} aria-pressed={active}>{g}</button>
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
					{#each DECADES as d (d)}
						{@const active = filters.decades.includes(d)}
						<button type="button" class="chip" class:active onclick={() => toggleDecade(d)} aria-pressed={active}>{d}</button>
					{/each}
				</div>
			</section>

			<div class="bottom-spacer"></div>
		</div>

		<footer class="sheet-foot">
			<button class="reset" type="button" onclick={() => filters.clearAll()}>Reset</button>
			<button class="show" type="button" onclick={onClose}>
				Show <span class="show-count">{filmCount}</span> films
			</button>
		</footer>
	</div>
{/if}

{#if datePickerOpen}
	<div
		class="cal-overlay"
		role="dialog"
		aria-modal="true"
		aria-label="Pick a date"
		onclick={(e) => { if (e.target === e.currentTarget) datePickerOpen = false; }}
		onkeydown={() => {}}
	>
		<div class="cal-wrap">
			<CalendarPopover
				selected={filters.dateFrom ?? today}
				{today}
				width={340}
				onSelect={(iso) => {
					filters.dateFrom = iso;
					filters.dateTo = iso;
					datePickerOpen = false;
				}}
				onClose={() => (datePickerOpen = false)}
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
		padding: 10px 12px;
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
