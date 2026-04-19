<script lang="ts">
	import { filters } from '$lib/stores/filters.svelte';
	import { userLocation } from '$lib/stores/user-location.svelte';
	import { haversineMiles, toLondonDateStr } from '$lib/utils';
	import MobileDatePicker from './MobileDatePicker.svelte';

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

	// Re-use the same area clusters
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
	function isAreaActive(label: string) {
		const ids = cinemasInCluster(label);
		return ids.length > 0 && ids.every(id => filters.cinemaIds.includes(id));
	}
	function toggleArea(label: string) {
		const ids = cinemasInCluster(label);
		if (ids.length === 0) return;
		const allActive = ids.every(id => filters.cinemaIds.includes(id));
		filters.cinemaIds = allActive
			? filters.cinemaIds.filter(id => !ids.includes(id))
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
	const tomorrow = (() => {
		const t = new Date(today + 'T12:00:00Z');
		t.setUTCDate(t.getUTCDate() + 1);
		return t.toISOString().split('T')[0];
	})();
	const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/London' });
	const todayLabel = dayFmt.format(new Date(today + 'T12:00:00Z'));
	const tomorrowLabel = dayFmt.format(new Date(tomorrow + 'T12:00:00Z'));

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

	// Genre + Era sections hidden until the homepage loader exposes genres and
	// the filter pipeline is wired. Follow-up PR will restore them.

</script>

{#if open}
	<div class="sheet" role="dialog" aria-label="Filter programme" aria-modal="true">
		<header class="sheet-head">
			<h2 class="sheet-title"><span class="italic-cap">F</span>ilter</h2>
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
					<button type="button" class="chip" class:active={whenState === 'today'} onclick={() => pick(whenState === 'today' ? null : 'today')}>Today<span class="sub">{todayLabel} {new Date(today + 'T12:00:00Z').getUTCDate()}</span></button>
					<button type="button" class="chip" class:active={whenState === 'tomorrow'} onclick={() => pick(whenState === 'tomorrow' ? null : 'tomorrow')}>Tomorrow<span class="sub">{tomorrowLabel} {new Date(tomorrow + 'T12:00:00Z').getUTCDate()}</span></button>
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
	<MobileDatePicker open={datePickerOpen} onClose={() => (datePickerOpen = false)} />
{/if}

<style>
	.sheet {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: var(--color-bg);
		display: flex;
		flex-direction: column;
	}

	.sheet-head {
		padding: 52px 18px 14px;
		border-bottom: 1px solid var(--color-border);
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
	}

	.sheet-title {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 36px;
		font-weight: 300;
		letter-spacing: -0.025em;
		line-height: 0.92;
		color: var(--color-text);
		font-variation-settings: '"SOFT" 100', '"opsz" 144';
	}

	.sheet-title .italic-cap { font-style: italic; font-weight: 400; }

	.close {
		width: 36px;
		height: 36px;
		padding: 0;
		background: transparent;
		border: 1px solid var(--color-border);
		cursor: pointer;
		font-family: var(--font-serif);
		font-size: 18px;
		color: var(--color-text);
		line-height: 1;
	}

	.sheet-body {
		flex: 1;
		overflow-y: auto;
	}

	.filter-section {
		padding: 18px 18px 16px;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.section-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 10px;
	}

	.section-head h4 {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 18px;
		font-weight: 400;
		letter-spacing: -0.015em;
		color: var(--color-text);
		font-variation-settings: '"SOFT" 100', '"opsz" 36';
	}

	.hint {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 13px;
		color: var(--color-text-tertiary);
	}

	.mini-search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		background: #fff;
		border: 1px solid var(--color-border);
		color: var(--color-text-tertiary);
		margin-bottom: 10px;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 14px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		padding: 8px 12px;
		background: transparent;
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		cursor: pointer;
		font-family: var(--font-serif);
		font-size: 14px;
		font-weight: 400;
		letter-spacing: -0.005em;
		font-variation-settings: '"SOFT" 100', '"opsz" 24';
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
	}

	.chip .sub {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-weight: 400;
		font-size: 12px;
		opacity: 0.5;
	}

	.chip.active {
		background: var(--color-text);
		color: var(--color-bg);
		font-weight: 500;
	}

	.chip.active .sub { opacity: 0.65; }

	.chip:disabled { opacity: 0.45; cursor: not-allowed; }

	.bottom-spacer { height: 96px; }

	.sheet-foot {
		border-top: 1px solid var(--color-border);
		background: var(--color-bg);
		padding: 12px 18px 24px;
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.reset {
		flex: 0 0 auto;
		padding: 12px 14px;
		background: transparent;
		border: 1px solid var(--color-border);
		color: var(--color-text);
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 14px;
		cursor: pointer;
	}

	.show {
		flex: 1;
		padding: 14px 16px;
		background: var(--color-text);
		color: var(--color-bg);
		border: 1px solid var(--color-border);
		font-family: var(--font-serif);
		font-size: 15px;
		font-weight: 500;
		letter-spacing: -0.005em;
		cursor: pointer;
		font-variation-settings: '"SOFT" 100', '"opsz" 36';
		display: inline-flex;
		align-items: baseline;
		justify-content: center;
		gap: 8px;
	}

	.show .show-count {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-weight: 400;
	}
</style>
