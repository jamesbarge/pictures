<script lang="ts">
	import Dropdown from '$lib/components/ui/Dropdown.svelte';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';
	import CalendarPopover from './CalendarPopover.svelte';
	import { filters } from '$lib/stores/filters.svelte';
	import { today as todayStore } from '$lib/stores/today.svelte';
	import { FORMAT_OPTIONS, TIME_PRESETS } from '$lib/constants/filters';
	import { trackFilterChange } from '$lib/analytics/posthog';

	interface FilterCinema {
		id: string;
		name: string;
		shortName: string | null;
		address: { area: string } | null;
	}

	export type DisplayMode = 'posters' | 'text';

	let {
		cinemas = [],
		displayMode = 'posters',
		onDisplayModeChange,
		onOpenFilters
	}: {
		cinemas?: FilterCinema[];
		displayMode?: DisplayMode;
		onDisplayModeChange?: (m: DisplayMode) => void;
		onOpenFilters?: () => void;
	} = $props();

	// — Mobile FILTERS chip: count of active non-search, non-date filters —
	const mobileFilterCount = $derived(
		filters.cinemaIds.length +
		filters.formats.length +
		filters.genres.length +
		filters.decades.length +
		filters.programmingTypes.length
	);

	type PanelKey = 'when' | 'search' | 'where' | 'format' | 'genre' | 'era';
	let openPanel = $state<PanelKey | null>(null);

	function toggle(k: PanelKey) {
		openPanel = openPanel === k ? null : k;
	}
	function close() {
		openPanel = null;
	}

	// — Film type (ALL / NEW / REPERTORY) —
	const filmType = $derived.by(() => {
		if (filters.programmingTypes.length === 0) return 'all';
		if (filters.programmingTypes.includes('new_release')) return 'new';
		if (filters.programmingTypes.includes('repertory')) return 'repertory';
		return 'all';
	});

	function setFilmType(value: 'all' | 'new' | 'repertory') {
		// Toggle: click the already-active tab to clear back to ALL.
		if (filmType === value && value !== 'all') {
			trackFilterChange('programming_type', value, 'removed');
			filters.programmingTypes = [];
			return;
		}
		trackFilterChange('programming_type', value, 'set');
		if (value === 'all') filters.programmingTypes = [];
		else if (value === 'new') filters.programmingTypes = ['new_release'];
		else filters.programmingTypes = ['repertory'];
	}

	// — Date range (THIS WEEK / TODAY / ALL) —
	function plusDays(iso: string, n: number) {
		const d = new Date(iso + 'T12:00:00Z');
		d.setUTCDate(d.getUTCDate() + n);
		return d.toISOString().split('T')[0];
	}

	const dateRange = $derived.by<'today' | 'tomorrow' | 'this-week' | 'all' | 'custom'>(() => {
		const t = todayStore.value;
		if (!filters.dateFrom && !filters.dateTo) return 'all';
		if (filters.dateFrom === t && filters.dateTo === t) return 'today';
		const tomorrow = plusDays(t, 1);
		if (filters.dateFrom === tomorrow && filters.dateTo === tomorrow) return 'tomorrow';
		if (filters.dateFrom === t && filters.dateTo === plusDays(t, 7)) return 'this-week';
		return 'custom';
	});

	function setDateRange(value: 'today' | 'tomorrow' | 'this-week' | 'all') {
		// Toggle: click the already-active pill to clear the date filter.
		if (dateRange === value && value !== 'all') {
			trackFilterChange('date_range', value, 'removed');
			filters.dateFrom = null;
			filters.dateTo = null;
			return;
		}
		trackFilterChange('date_range', value, 'set');
		if (value === 'all') {
			filters.dateFrom = null;
			filters.dateTo = null;
		} else if (value === 'today') {
			filters.setDatePreset('today');
		} else if (value === 'tomorrow') {
			const tom = plusDays(todayStore.value, 1);
			filters.dateFrom = tom;
			filters.dateTo = tom;
		} else {
			filters.setDatePreset('7days');
		}
	}

	// — Chip labels reflect current filter state —
	const whenLabel = $derived.by(() => {
		const today = todayStore.value;
		const t = new Date(today + 'T12:00:00Z');
		t.setUTCDate(t.getUTCDate() + 1);
		const tomorrow = t.toISOString().split('T')[0];
		if (!filters.dateFrom) return 'WHEN';
		if (filters.dateFrom === today) return 'TODAY';
		if (filters.dateFrom === tomorrow) return 'TOMORROW';
		const d = new Date(filters.dateFrom + 'T12:00:00Z');
		return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }).format(d).toUpperCase();
	});

	const whereLabel = $derived.by(() => {
		if (!filters.cinemaIds.length) return 'WHERE';
		if (filters.cinemaIds.length === 1) {
			const c = cinemas.find((c) => c.id === filters.cinemaIds[0]);
			return (c?.shortName ?? c?.name ?? 'CINEMA').toUpperCase();
		}
		return `${filters.cinemaIds.length} CINEMAS`;
	});

	const formatLabel = $derived.by(() => {
		if (!filters.formats.length) return 'FORMAT';
		if (filters.formats.length === 1) {
			return FORMAT_OPTIONS.find((f) => f.value === filters.formats[0])?.label ?? 'FORMAT';
		}
		return `${filters.formats.length} FORMATS`;
	});

	// — Genre + Era —
	const GENRES = ['Drama', 'Comedy', 'Documentary', 'Thriller', 'Sci-fi', 'Romance', 'Horror'];
	const DECADES = ['2020s', '2010s', '2000s', '90s', '80s', '70s', 'Pre-1970'];

	function toggleGenre(g: string) {
		const key = g.toLowerCase();
		const was = filters.genres.includes(key);
		filters.genres = was ? filters.genres.filter((x) => x !== key) : [...filters.genres, key];
		trackFilterChange('genre', g, was ? 'removed' : 'added');
	}
	function isGenreActive(g: string) {
		return filters.genres.includes(g.toLowerCase());
	}

	function toggleDecade(d: string) {
		const was = filters.decades.includes(d);
		filters.decades = was ? filters.decades.filter((x) => x !== d) : [...filters.decades, d];
		trackFilterChange('decade', d, was ? 'removed' : 'added');
	}

	const genreLabel = $derived.by(() => {
		if (!filters.genres.length) return 'GENRE';
		if (filters.genres.length === 1) return filters.genres[0].toUpperCase();
		return `${filters.genres.length} GENRES`;
	});

	const eraLabel = $derived.by(() => {
		if (!filters.decades.length) return 'ERA';
		if (filters.decades.length === 1) return filters.decades[0].toUpperCase();
		return `${filters.decades.length} ERAS`;
	});

	const searchLabel = $derived.by(() => {
		if (!filters.filmSearch) return 'SEARCH';
		return filters.filmSearch.toUpperCase().slice(0, 18);
	});

	// — Cinema search box (local to the WHERE panel) —
	let cinemaSearch = $state('');
	const filteredCinemas = $derived(
		cinemaSearch
			? cinemas.filter((c) =>
				c.name.toLowerCase().includes(cinemaSearch.toLowerCase()) ||
				(c.shortName?.toLowerCase().includes(cinemaSearch.toLowerCase()) ?? false) ||
				(c.address?.area.toLowerCase().includes(cinemaSearch.toLowerCase()) ?? false)
			)
			: cinemas
	);
	const groupedCinemas = $derived.by(() => {
		const groups: Record<string, FilterCinema[]> = {};
		for (const c of filteredCinemas) {
			const area = c.address?.area ?? 'Other';
			(groups[area] ??= []).push(c);
		}
		return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
	});

	// — Date presets for WHEN —
	function applyPreset(preset: 'today' | 'tomorrow' | 'weekend' | null) {
		if (preset === null) {
			filters.dateFrom = null;
			filters.dateTo = null;
			close();
			return;
		}
		if (preset === 'today') filters.setDatePreset('today');
		else if (preset === 'tomorrow') {
			const t = new Date(todayStore.value + 'T12:00:00Z');
			t.setUTCDate(t.getUTCDate() + 1);
			const iso = t.toISOString().split('T')[0];
			filters.dateFrom = iso;
			filters.dateTo = iso;
		}
		else filters.setDatePreset('weekend');
		trackFilterChange('date_preset', preset, 'set');
	}

	let showingCalendar = $state(false);
	function pickDate(iso: string) {
		filters.dateFrom = iso;
		filters.dateTo = iso;
		showingCalendar = false;
		close();
	}
</script>

<div class="toolbar" role="toolbar" aria-label="Film filters">
	<div class="cluster cluster-left">
		<div class="col col-wide">
			<!-- SEARCH (inline input) -->
			<div class="chip chip-input chip-full" class:active={!!filters.filmSearch}>
				<input
					class="chip-input-field"
					type="search"
					autocomplete="off"
					placeholder="SEARCH"
					aria-label="Search films, directors, cast"
					bind:value={filters.filmSearch}
				/>
				<span class="chip-icon" aria-hidden="true">
					{#if filters.filmSearch}
						<button class="chip-clear" type="button" onclick={() => (filters.filmSearch = '')} aria-label="Clear search">
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
								<path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/>
							</svg>
						</button>
					{:else}
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
							<circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4"/>
							<line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/>
						</svg>
					{/if}
				</span>
			</div>

			<!-- TODAY / TOMORROW / THIS WEEK / [calendar icon = custom date] -->
			<div class="chip-wrap chip-full">
				<div class="seg seg-full" role="tablist" aria-label="Date range">
					<button role="tab" aria-selected={dateRange === 'today'} class="seg-tab" class:active={dateRange === 'today'} onclick={() => setDateRange('today')}>TODAY</button>
					<button role="tab" aria-selected={dateRange === 'tomorrow'} class="seg-tab" class:active={dateRange === 'tomorrow'} onclick={() => setDateRange('tomorrow')}>TOMORROW</button>
					<button role="tab" aria-selected={dateRange === 'this-week'} class="seg-tab" class:active={dateRange === 'this-week'} onclick={() => setDateRange('this-week')}>THIS WEEK</button>
					<button
						class="seg-tab seg-icon"
						class:active={openPanel === 'when' || dateRange === 'custom'}
						type="button"
						aria-haspopup="dialog"
						aria-expanded={openPanel === 'when'}
						aria-label={dateRange === 'custom' ? `Custom date: ${whenLabel}` : 'Pick a custom date'}
						onclick={() => toggle('when')}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<rect x="2" y="3.5" width="12" height="11" stroke="currentColor" stroke-width="1.4"/>
							<line x1="2" y1="6" x2="14" y2="6" stroke="currentColor" stroke-width="1.4"/>
							<line x1="5.5" y1="1.5" x2="5.5" y2="4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/>
							<line x1="10.5" y1="1.5" x2="10.5" y2="4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/>
						</svg>
						{#if dateRange === 'custom'}
							<span class="seg-icon-label">{whenLabel}</span>
						{/if}
					</button>
				</div>
				<Dropdown open={openPanel === 'when'} onClose={close} ariaLabel="Pick date">
					<div class="panel">
						{#if showingCalendar}
							<CalendarPopover
								selected={filters.dateFrom ?? todayStore.value}
								today={todayStore.value}
								onSelect={pickDate}
								onClose={() => (showingCalendar = false)}
							/>
						{:else}
							<div class="panel-section">
								<button class="opt-btn opt-btn-wide" onclick={() => { showingCalendar = true; }}>OPEN CALENDAR</button>
							</div>
							<div class="panel-divider"></div>
							<div class="panel-section">
								<div class="panel-section-label">TIME OF DAY</div>
								<div class="panel-grid-2">
									{#each TIME_PRESETS as preset (preset.label)}
										<button
											class="opt-btn"
											class:active={filters.timeFrom === preset.from && filters.timeTo === preset.to}
											onclick={() => {
												if (filters.timeFrom === preset.from && filters.timeTo === preset.to) {
													filters.timeFrom = null;
													filters.timeTo = null;
												} else {
													filters.timeFrom = preset.from;
													filters.timeTo = preset.to;
												}
												trackFilterChange('time_preset', preset.label, 'set');
											}}
										>{preset.label}</button>
									{/each}
								</div>
							</div>
							{#if filters.dateFrom || filters.timeFrom !== null}
								<button class="panel-clear" onclick={() => { applyPreset(null); filters.timeFrom = null; filters.timeTo = null; }}>CLEAR</button>
							{/if}
						{/if}
					</div>
				</Dropdown>
			</div>

			<!-- FILTERS chip (phone only) — opens the bottom sheet -->
			<button
				type="button"
				class="chip chip-full chip-mobile-filters"
				class:active={mobileFilterCount > 0}
				onclick={() => onOpenFilters?.()}
				aria-label="Open filters"
			>
				<span class="chip-label">
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style="margin-right: 8px;">
						<line x1="0" y1="3" x2="14" y2="3" stroke="currentColor" stroke-width="1.5"/>
						<line x1="0" y1="7" x2="14" y2="7" stroke="currentColor" stroke-width="1.5"/>
						<line x1="0" y1="11" x2="14" y2="11" stroke="currentColor" stroke-width="1.5"/>
						<circle cx="4" cy="3" r="1.8" fill="var(--color-surface)" stroke="currentColor" stroke-width="1.5"/>
						<circle cx="10" cy="7" r="1.8" fill="var(--color-surface)" stroke="currentColor" stroke-width="1.5"/>
						<circle cx="6" cy="11" r="1.8" fill="var(--color-surface)" stroke="currentColor" stroke-width="1.5"/>
					</svg>
					FILTERS{mobileFilterCount > 0 ? ` (${mobileFilterCount})` : ''}
				</span>
			</button>
		</div>

		<div class="col col-narrow">
			<!-- WHERE -->
			<div class="chip-wrap chip-full">
				<button class="chip chip-full" class:active={filters.cinemaIds.length > 0} type="button" aria-haspopup="dialog" aria-expanded={openPanel === 'where'} onclick={() => toggle('where')}>
					<span class="chip-label">{whereLabel}</span>
					<span class="chip-icon" aria-hidden="true">
						<svg width="14" height="8" viewBox="0 0 14 8" fill="none">
							<path d="M1 1L7 7L13 1" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/>
						</svg>
					</span>
				</button>
				<Dropdown open={openPanel === 'where'} onClose={close} ariaLabel="Where">
					<div class="panel panel-wide">
						<div class="panel-section">
							<input
								class="panel-input"
								type="search"
								autocomplete="off"
								placeholder="Search cinemas…"
								bind:value={cinemaSearch}
							/>
						</div>
						<div class="panel-divider"></div>
						<div class="panel-scroll">
							{#each groupedCinemas as [area, list] (area)}
								<div class="panel-section-label">{area.toUpperCase()}</div>
								{#each list as c (c.id)}
									<Checkbox
										checked={filters.cinemaIds.includes(c.id)}
										label={c.shortName ?? c.name}
										onToggle={() => {
											const was = filters.cinemaIds.includes(c.id);
											filters.toggleCinema(c.id);
											trackFilterChange('cinema', c.name, was ? 'removed' : 'added');
										}}
									/>
								{/each}
							{/each}
						</div>
						{#if filters.cinemaIds.length > 0}
							<button class="panel-clear" onclick={() => (filters.cinemaIds = [])}>CLEAR ({filters.cinemaIds.length})</button>
						{/if}
					</div>
				</Dropdown>
			</div>

			<!-- GENRE (paired with WHERE) -->
			<div class="chip-wrap chip-full">
				<button class="chip chip-full" class:active={filters.genres.length > 0} type="button" aria-haspopup="dialog" aria-expanded={openPanel === 'genre'} onclick={() => toggle('genre')}>
					<span class="chip-label">{genreLabel}</span>
					<span class="chip-icon" aria-hidden="true">
						<svg width="14" height="8" viewBox="0 0 14 8" fill="none">
							<path d="M1 1L7 7L13 1" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/>
						</svg>
					</span>
				</button>
				<Dropdown open={openPanel === 'genre'} onClose={close} align="right" ariaLabel="Genre">
					<div class="panel">
						<div class="panel-section">
							{#each GENRES as g (g)}
								<Checkbox
									checked={isGenreActive(g)}
									label={g}
									onToggle={() => toggleGenre(g)}
								/>
							{/each}
						</div>
						{#if filters.genres.length > 0}
							<button class="panel-clear" onclick={() => (filters.genres = [])}>CLEAR</button>
						{/if}
					</div>
				</Dropdown>
			</div>

			<!-- ALL / NEW / REPERTORY (paired with GENRE) -->
			<div class="seg seg-full seg-film-type" role="tablist" aria-label="Film type">
				<button role="tab" aria-selected={filmType === 'all'} class="seg-tab" class:active={filmType === 'all'} onclick={() => setFilmType('all')}>ALL</button>
				<button role="tab" aria-selected={filmType === 'new'} class="seg-tab" class:active={filmType === 'new'} onclick={() => setFilmType('new')}>NEW</button>
				<button role="tab" aria-selected={filmType === 'repertory'} class="seg-tab" class:active={filmType === 'repertory'} onclick={() => setFilmType('repertory')}>REP</button>
			</div>

			<!-- FORMAT (paired with ERA) -->
			<div class="chip-wrap chip-full">
				<button class="chip chip-full" class:active={filters.formats.length > 0} type="button" aria-haspopup="dialog" aria-expanded={openPanel === 'format'} onclick={() => toggle('format')}>
					<span class="chip-label">{formatLabel}</span>
					<span class="chip-icon" aria-hidden="true">
						<svg width="14" height="8" viewBox="0 0 14 8" fill="none">
							<path d="M1 1L7 7L13 1" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/>
						</svg>
					</span>
				</button>
				<Dropdown open={openPanel === 'format'} onClose={close} align="right" ariaLabel="Format">
					<div class="panel">
						<div class="panel-section">
							{#each FORMAT_OPTIONS as fmt (fmt.value)}
								<Checkbox
									checked={filters.formats.includes(fmt.value)}
									label={fmt.label}
									onToggle={() => {
										const was = filters.formats.includes(fmt.value);
										filters.toggleFormat(fmt.value);
										trackFilterChange('format', fmt.label, was ? 'removed' : 'added');
									}}
								/>
							{/each}
						</div>
						{#if filters.formats.length > 0}
							<button class="panel-clear" onclick={() => (filters.formats = [])}>CLEAR</button>
						{/if}
					</div>
				</Dropdown>
			</div>

			<!-- ERA -->
			<div class="chip-wrap chip-full">
				<button class="chip chip-full" class:active={filters.decades.length > 0} type="button" aria-haspopup="dialog" aria-expanded={openPanel === 'era'} onclick={() => toggle('era')}>
					<span class="chip-label">{eraLabel}</span>
					<span class="chip-icon" aria-hidden="true">
						<svg width="14" height="8" viewBox="0 0 14 8" fill="none">
							<path d="M1 1L7 7L13 1" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/>
						</svg>
					</span>
				</button>
				<Dropdown open={openPanel === 'era'} onClose={close} align="right" ariaLabel="Era">
					<div class="panel">
						<div class="panel-section">
							{#each DECADES as d (d)}
								<Checkbox
									checked={filters.decades.includes(d)}
									label={d}
									onToggle={() => toggleDecade(d)}
								/>
							{/each}
						</div>
						{#if filters.decades.length > 0}
							<button class="panel-clear" onclick={() => (filters.decades = [])}>CLEAR</button>
						{/if}
					</div>
				</Dropdown>
			</div>

			<!-- POSTERS / TEXT display mode (paired with ERA) -->
			<div class="seg seg-full seg-view-mode" role="tablist" aria-label="Display mode">
				<button role="tab" aria-selected={displayMode === 'posters'} class="seg-tab" class:active={displayMode === 'posters'} onclick={() => onDisplayModeChange?.('posters')}>POSTERS</button>
				<button role="tab" aria-selected={displayMode === 'text'} class="seg-tab" class:active={displayMode === 'text'} onclick={() => onDisplayModeChange?.('text')}>TEXT</button>
			</div>
		</div>
	</div>
</div>

<style>
	.toolbar {
		/* Toolbar always uses the light-mode palette regardless of house-lights
		   dimming. Without this, the global dark-theme overrides turn the chip
		   surfaces dark, leaving cream text on cream icon tiles. */
		--color-surface: #ffffff;
		--color-text: #1f1f1f;
		--color-border: #1f1f1f;
		--color-cream: #eae5c2;
		--color-text-tertiary: #5a5a5a;
		display: flex;
		width: 100%;
		align-items: flex-start;
		gap: 32px;
		font-family: var(--font-sans);
		color: var(--color-text);
	}

	.cluster {
		display: flex;
		gap: 16px;
	}

	.cluster-left {
		flex: 1;
		width: 100%;
		align-items: flex-start;
	}

	.col {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	/* Search column flex-grows so the search input + date pills stretch. */
	.col-wide { flex: 1 1 0; min-width: 316px; }

	/* Three-column grid:
	   col 1 — segments stack (ALL/NEW/REP + POSTERS/TEXT), fixed 200px
	   cols 2 & 3 — chips (WHERE/GENRE on row 1, FORMAT/ERA on row 2), share remaining space
	   Source order is WHERE, GENRE, ALL/NEW/REP, FORMAT, ERA, POSTERS/TEXT, so
	   we explicitly place each child via nth-child. */
	.col-narrow {
		flex: 2 1 0;
		display: grid;
		grid-template-columns: 1fr 1fr 200px;
		grid-template-rows: auto auto;
		gap: 16px;
		min-width: 0;
	}
	.col-narrow > :nth-child(1) { grid-column: 1; grid-row: 1; } /* WHERE */
	.col-narrow > :nth-child(2) { grid-column: 2; grid-row: 1; } /* GENRE */
	.col-narrow > :nth-child(3) { grid-column: 3; grid-row: 1; } /* ALL/NEW/REP */
	.col-narrow > :nth-child(4) { grid-column: 1; grid-row: 2; } /* FORMAT */
	.col-narrow > :nth-child(5) { grid-column: 2; grid-row: 2; } /* ERA */
	.col-narrow > :nth-child(6) { grid-column: 3; grid-row: 2; } /* POSTERS/TEXT */

	.chip-full { width: 100%; }
	.seg-full  { width: 100%; }
	.seg-full .seg-tab { flex: 1; }

	/* FILTERS chip is phone-only — hidden by default. Selector ties two
	   classes so it beats `.chip { display: inline-flex }` regardless of
	   declaration order. */
	.chip.chip-mobile-filters { display: none; }

	@media (max-width: 1023px) {
		.toolbar {
			flex-wrap: wrap;
			gap: 16px;
		}
	}

	@media (max-width: 839px) {
		.toolbar { gap: 12px; }
		.cluster-left {
			flex-direction: column;
			width: 100%;
			gap: 12px;
		}
		.col-wide {
			width: 100%;
			display: grid;
			grid-template-columns: 1fr auto;
			column-gap: 8px;
			row-gap: 12px;
			align-items: stretch;
		}
		.col-wide > .chip-input {
			grid-column: 1 / 2;
			grid-row: 1;
			width: auto;
		}
		.col-wide > .chip-mobile-filters {
			grid-column: 2 / 3;
			grid-row: 1;
			width: auto;
		}
		.col-wide > .chip-wrap {
			grid-column: 1 / -1;
			grid-row: 2;
		}

		/* Phone: WHERE/GENRE/FORMAT/ERA + ALL/NEW/REP all collapse into the
		   FILTERS sheet. Only POSTERS/TEXT remains visible (under the FILTERS
		   chip) as the view-mode toggle. */
		.col-narrow {
			display: flex;
			flex-direction: column;
			width: 100%;
			gap: 12px;
			min-width: 0;
		}
		.col-narrow > *:not(.seg-view-mode) { display: none; }
		.col-narrow .seg-view-mode { width: 100%; }
		.chip.chip-mobile-filters { display: inline-flex; }
	}

	@media (max-width: 479px) {
		.seg-view-mode { display: none; }
		.chip.chip-mobile-filters { display: inline-flex; }
	}

	/* Segmented toggle */
	.seg {
		display: inline-flex;
		align-items: stretch;
		height: 36px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: var(--shadow-brutalist);
		overflow: hidden;
	}

	.seg-tab {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 8px 10px;
		font-family: var(--font-sans);
		font-weight: 400;
		font-size: 15px;
		letter-spacing: -0.01em;
		color: var(--color-text);
		background: var(--color-surface);
		border: none;
		border-right: 1px solid var(--color-border);
		cursor: pointer;
		min-height: 34px;
		white-space: nowrap;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp);
	}

	.seg-tab:last-child { border-right: none; }
	.seg-tab:hover:not(.active) { background: var(--color-cream); }
	.seg-tab.active { background: var(--color-text); color: var(--color-cream); }

	.seg-icon {
		gap: 8px;
		padding: 8px 10px;
	}
	.seg-icon-label {
		font-weight: 500;
		font-size: 14px;
		letter-spacing: -0.01em;
	}

	.opt-btn-wide { width: 100%; }

	/* Chip + popover anchor */
	.chip-wrap {
		position: relative;
		display: inline-flex;
	}

	.chip {
		display: inline-flex;
		align-items: stretch;
		height: 36px;
		min-width: 160px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: var(--shadow-brutalist);
		overflow: hidden;
		padding: 0;
		font-family: var(--font-sans);
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			transform var(--duration-fast) var(--ease-sharp),
			box-shadow var(--duration-fast) var(--ease-sharp);
	}

	.chip:hover { background: var(--color-cream); }

	/* Active = a filter is applied to this dimension. Invert to black/cream so
	   it's instantly scannable which chips are "doing something" vs. idle. */
	.chip.active {
		background: var(--color-text);
		color: var(--color-cream);
	}
	.chip.active .chip-label {
		color: var(--color-cream);
		font-weight: 700;
	}
	.chip.active .chip-icon {
		background: var(--color-cream);
		color: var(--color-text);
	}
	.chip.active:hover { background: var(--color-accent-hover, #2f2f2f); }

	.chip:active {
		transform: translate(4px, 4px);
		box-shadow: 0 0 0 0 transparent;
	}

	/* SEARCH variant: the chip itself is an input */
	.chip-input {
		cursor: text;
		min-width: 220px;
	}
	.chip-input:hover { background: var(--color-surface); }
	.chip-input:focus-within { background: var(--color-surface); }

	/* Search variant gets a softer active treatment so the input stays usable */
	.chip.chip-input.active {
		background: var(--color-cream);
		color: var(--color-text);
	}
	.chip.chip-input.active .chip-input-field { color: var(--color-text); }
	.chip.chip-input.active .chip-icon {
		background: var(--color-text);
		color: var(--color-cream);
	}

	.chip-input-field {
		flex: 1;
		min-width: 0;
		padding: 8px 12px;
		font-family: var(--font-sans);
		font-weight: 400;
		font-size: 16px;
		letter-spacing: -0.01em;
		color: var(--color-text);
		background: transparent;
		border: none;
		outline: none;
		text-align: left;
	}

	.chip-input-field::placeholder {
		color: var(--color-text);
		opacity: 1;
		text-transform: uppercase;
	}

	.chip-input-field::-webkit-search-cancel-button,
	.chip-input-field::-webkit-search-decoration {
		-webkit-appearance: none;
		appearance: none;
	}

	.chip-clear {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--color-text);
		cursor: pointer;
	}

	.chip-label {
		flex: 1;
		display: inline-flex;
		align-items: center;
		padding: 8px 12px;
		font-weight: 400;
		font-size: 16px;
		letter-spacing: -0.01em;
		color: var(--color-text);
		text-align: left;
	}

	.chip-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		flex-shrink: 0;
		background: var(--color-cream);
		color: var(--color-text);
		border-left: 1px solid var(--color-border);
	}

	/* Popover panel body */
	.panel {
		min-width: 260px;
		font-family: var(--font-sans);
	}
	.panel-wide { min-width: 320px; }

	.panel-section { padding: 12px; }
	.panel-divider { border-top: 1px solid var(--color-border); }
	.panel-section-label {
		padding: 8px 12px 6px;
		font-weight: 700;
		font-size: 10px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-text-tertiary);
	}

	.panel-grid-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}

	.opt-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 8px 10px;
		font-family: var(--font-sans);
		font-weight: 400;
		font-size: 14px;
		letter-spacing: -0.01em;
		color: var(--color-text);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp);
	}
	.opt-btn:hover { background: var(--color-cream); }
	.opt-btn.active { background: var(--color-text); color: var(--color-cream); }

	.panel-input {
		width: 100%;
		padding: 8px 10px;
		font-family: var(--font-sans);
		font-size: 16px;
		color: var(--color-text);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		outline: none;
	}
	.panel-input::placeholder { color: var(--color-text-tertiary); }
	.panel-input:focus { box-shadow: var(--shadow-brutalist-sm); }

	.panel-clear {
		display: block;
		width: 100%;
		padding: 10px 12px;
		font-family: var(--font-sans);
		font-weight: 500;
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text);
		background: var(--color-cream);
		border: none;
		border-top: 1px solid var(--color-border);
		cursor: pointer;
		text-align: center;
	}
	.panel-clear:hover { background: var(--color-text); color: var(--color-cream); }

	.panel-scroll {
		max-height: 320px;
		overflow-y: auto;
	}

	@media (max-width: 767px) {
		.toolbar { gap: 10px; }
		.chip { min-width: 0; flex: 1 1 calc(50% - 5px); }
		.seg { flex: 1 1 100%; justify-content: center; }
		.seg-tab { flex: 1; }
	}
</style>
