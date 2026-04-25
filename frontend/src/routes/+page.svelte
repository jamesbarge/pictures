<script lang="ts">
	import DesktopHybridCard from '$lib/components/calendar/DesktopHybridCard.svelte';
	import MobileFilmRow from '$lib/components/calendar/MobileFilmRow.svelte';
	import DayMasthead from '$lib/components/calendar/DayMasthead.svelte';
	import DesktopFilterSidebar from '$lib/components/filters/DesktopFilterSidebar.svelte';
	import MobileFilterSheet from '$lib/components/filters/MobileFilterSheet.svelte';
	import FilmTypeFilter from '$lib/components/filters/FilmTypeFilter.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import JsonLd from '$lib/seo/JsonLd.svelte';
	import { webSiteSchema, faqSchema } from '$lib/seo/json-ld';
	import { filters } from '$lib/stores/filters.svelte';
	import { today as todayStore } from '$lib/stores/today.svelte';
	import { buildFilmMap } from '$lib/calendar-filter';
	import { toLondonDateStr, groupBy, compareFilmsByCalendarPriority } from '$lib/utils';
	import { trackFilterNoResults } from '$lib/analytics/posthog';
	import { browser } from '$app/environment';
	import { page } from '$app/state';

	let { data } = $props();

	// Sidebar collapsed state — persist across sessions.
	const SIDEBAR_STORAGE_KEY = 'pictures-sidebar-collapsed';
	function loadCollapsed(): boolean {
		if (!browser) return false;
		try { return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'; } catch { return false; }
	}
	let sidebarCollapsed = $state(loadCollapsed());
	$effect(() => {
		if (!browser) return;
		try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed)); } catch { /* ignore */ }
	});

	const cinemas = $derived((page.data?.cinemas ?? []) as Array<{
		id: string;
		name: string;
		shortName: string | null;
		address: { area: string } | null;
	}>);

	let mobileFilterOpen = $state(false);

	// Group screenings by film + apply filters via the pure helper in
	// `$lib/calendar-filter`. The helper owns the one-sided-range invariant
	// warning internally — see calendar-filter.ts.
	const filmMap = $derived.by(() =>
		buildFilmMap(
			data.screenings,
			{
				filmSearch: filters.filmSearch,
				cinemaIds: filters.cinemaIds,
				dateFrom: filters.dateFrom,
				dateTo: filters.dateTo,
				formats: filters.formats,
				timeFrom: filters.timeFrom,
				timeTo: filters.timeTo,
				programmingTypes: filters.programmingTypes,
				genres: filters.genres,
				decades: filters.decades
			},
			{ today: todayStore.value, now: Date.now() }
		)
	);

	const dayGroups = $derived.by(() => {
		const all = [...filmMap.values()].flatMap((f) => f.screenings.map((s) => ({ ...s, film: f.film })));
		const grouped = groupBy(all, (s) => toLondonDateStr(s.datetime));
		return Object.entries(grouped)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([date, screenings]) => {
				const filmGroups = groupBy(screenings, (s) => s.film.id);
				const films = Object.values(filmGroups)
					.map((filmScreenings) => ({
						film: filmScreenings[0].film,
						screenings: filmScreenings.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
					}))
					.sort(compareFilmsByCalendarPriority);
				return { date, films };
			});
	});

	// Flat list of unique films for the desktop hybrid grid, sorted by calendar priority.
	const hybridFilms = $derived.by(() => {
		return [...filmMap.values()]
			.map(({ film, screenings }) => ({
				film,
				screenings: screenings.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
			}))
			.sort(compareFilmsByCalendarPriority);
	});

	const screeningCount = $derived.by(() => {
		let n = 0;
		for (const { screenings } of filmMap.values()) n += screenings.length;
		return n;
	});

	let lastTrackedEmpty = false;
	$effect(() => {
		if (!browser) return;
		const hasFilters = filters.cinemaIds.length > 0 || filters.dateFrom || filters.formats.length > 0 ||
			filters.programmingTypes.length > 0 || filters.timeFrom !== null || filters.filmSearch;
		const isEmpty = filmMap.size === 0;
		if (isEmpty && hasFilters && !lastTrackedEmpty) {
			trackFilterNoResults({
				cinemaIds: filters.cinemaIds,
				formats: filters.formats,
				dateFrom: filters.dateFrom,
				programmingTypes: filters.programmingTypes
			});
			lastTrackedEmpty = true;
		} else if (!isEmpty) {
			lastTrackedEmpty = false;
		}
	});

	const activeFilterCount = $derived(filters.activeFilterCount);
</script>

<div class="sr-only" aria-live="polite" role="status">
	{#if dayGroups.length === 0}No screenings found{:else}{filmMap.size} films showing{/if}
</div>

<JsonLd data={webSiteSchema()} />
<JsonLd data={faqSchema([
	{ question: 'What is pictures.london?', answer: 'pictures.london is a comprehensive London cinema listings site showing every film screening across independent and chain cinemas, updated daily.' },
	{ question: 'Which cinemas does pictures.london cover?', answer: 'We cover 57+ London cinemas including BFI Southbank, Prince Charles Cinema, Barbican, ICA, Curzon, Picturehouse, Everyman, and many independent venues.' },
	{ question: 'Is pictures.london free to use?', answer: 'Yes, pictures.london is completely free. We aggregate screening times and link directly to cinema booking pages.' },
	{ question: 'Can I import my Letterboxd watchlist?', answer: 'Yes! Visit the Letterboxd Import page, enter your username, and see which films on your watchlist are currently showing in London cinemas.' }
])} />

<!-- ── DESKTOP LAYOUT (≥ 1024px) ── -->
<div class="desktop-shell">
	<div class="desktop-masthead-wrap">
		<DayMasthead />
	</div>

	<div class="desktop-grid" class:sidebar-collapsed={sidebarCollapsed}>
		{#if !sidebarCollapsed}
			<div class="sidebar-wrap">
				<DesktopFilterSidebar
					cinemas={cinemas}
					filmCount={filmMap.size}
					screeningCount={screeningCount}
					onHide={() => (sidebarCollapsed = true)}
				/>
			</div>
		{:else}
			<button
				type="button"
				class="sidebar-rail"
				onclick={() => (sidebarCollapsed = false)}
				aria-label="Expand filters"
				title="Expand filters"
			>
				<svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true">
					<circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2" fill="none"/>
					<path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.2"/>
				</svg>
				<span class="rail-label">Filters</span>
				{#if activeFilterCount > 0}
					<span class="rail-count">·{activeFilterCount}</span>
				{/if}
				<span class="rail-chevron">›</span>
			</button>
		{/if}

		<main class="desktop-main">
			<div class="desktop-toolbar">
				<FilmTypeFilter />
				<span class="count-line">
					<span class="count-num">{filmMap.size}</span> films ·
					<span class="count-num">{screeningCount}</span> screenings
				</span>
			</div>

			{#if filmMap.size === 0}
				<EmptyState title="No screenings found" description="Try adjusting your filters or check back later." />
			{:else}
				<div class="desktop-film-grid">
					{#each hybridFilms as { film, screenings } (film.id)}
						<DesktopHybridCard
							film={{
								id: film.id,
								title: film.title,
								year: film.year,
								director: film.director ?? null,
								runtime: film.runtime,
								posterUrl: film.posterUrl
							}}
							screenings={screenings.map((s) => ({
								id: s.id,
								datetime: s.datetime,
								cinemaName: s.cinema?.name ?? 'Unknown',
								cinemaSlug: s.cinema?.id ?? '',
								format: s.format,
								bookingUrl: s.bookingUrl
							}))}
						/>
					{/each}
				</div>
			{/if}
		</main>
	</div>
</div>

<!-- ── MOBILE LAYOUT (< 1024px) ── -->
<div class="mobile-shell">
	<div class="mobile-header">
		<div class="mobile-date-label">
			{#if dayGroups.length > 0}
				{@const d = new Date(dayGroups[0].date + 'T12:00:00Z')}
				{@const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Europe/London' }).format(d)}
				{@const dayNum = Number(new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'Europe/London' }).format(d))}
				{@const ordinals = {1:'first',2:'second',3:'third',4:'fourth',5:'fifth',6:'sixth',7:'seventh',8:'eighth',9:'ninth',10:'tenth',11:'eleventh',12:'twelfth',13:'thirteenth',14:'fourteenth',15:'fifteenth',16:'sixteenth',17:'seventeenth',18:'eighteenth',19:'nineteenth',20:'twentieth',21:'twenty-first',22:'twenty-second',23:'twenty-third',24:'twenty-fourth',25:'twenty-fifth',26:'twenty-sixth',27:'twenty-seventh',28:'twenty-eighth',29:'twenty-ninth',30:'thirtieth',31:'thirty-first'} as Record<number, string>}
				{weekday}<span class="italic-comma">,</span> the {ordinals[dayNum] ?? `${dayNum}th`}
			{:else}
				No films
			{/if}
		</div>

		<div class="mobile-search-row">
			<div class="mobile-search">
				<svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true">
					<circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2" fill="none"/>
					<path d="M9.5 9.5L13 13" stroke="currentColor" stroke-width="1.2"/>
				</svg>
				<input
					type="search"
					placeholder="Search films, cinemas, directors…"
					bind:value={filters.filmSearch}
					aria-label="Search films, cinemas, directors"
				/>
			</div>
			<button class="mobile-filter-btn" onclick={() => (mobileFilterOpen = true)} aria-expanded={mobileFilterOpen}>
				Filter
				{#if activeFilterCount > 0}
					<span class="count">·{activeFilterCount}</span>
				{/if}
			</button>
		</div>

		<div class="mobile-type-tabs">
			<FilmTypeFilter />
		</div>
	</div>

	{#if dayGroups.length === 0}
		<EmptyState title="No screenings found" description="Try adjusting your filters or check back later." />
	{:else}
		<div class="mobile-list">
			{#each dayGroups as { date, films } (date)}
				<section class="mobile-day">
					{#each films as { film, screenings } (film.id)}
						<MobileFilmRow
							film={{
								id: film.id,
								title: film.title,
								year: film.year,
								director: film.director ?? null,
								runtime: film.runtime,
								posterUrl: film.posterUrl
							}}
							screenings={screenings.map((s) => ({
								id: s.id,
								datetime: s.datetime,
								cinemaName: s.cinema?.name ?? 'Unknown',
								bookingUrl: s.bookingUrl
							}))}
						/>
					{/each}
				</section>
			{/each}
		</div>
	{/if}
</div>

<MobileFilterSheet
	cinemas={cinemas}
	filmCount={filmMap.size}
	open={mobileFilterOpen}
	onClose={() => (mobileFilterOpen = false)}
/>

<style>
	/* ---------- Desktop ---------- */
	.desktop-shell {
		display: none;
	}

	@media (min-width: 1024px) {
		.desktop-shell {
			display: block;
			max-width: 1400px;
			margin: 0 auto;
			padding: 0 2rem 4rem;
		}
	}

	.desktop-masthead-wrap {
		padding: 1.5rem 0 0;
	}

	.desktop-grid {
		display: grid;
		grid-template-columns: 240px 1fr;
		min-height: 600px;
	}

	.desktop-grid.sidebar-collapsed {
		grid-template-columns: 44px 1fr;
	}

	.sidebar-wrap {
		display: flex;
		flex-direction: column;
	}

	.sidebar-rail {
		position: sticky;
		top: var(--header-height, 56px);
		align-self: start;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 18px 8px;
		background: transparent;
		border: none;
		border-right: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		cursor: pointer;
		font-family: var(--font-serif);
		font-size: 13px;
		letter-spacing: -0.005em;
		writing-mode: vertical-rl;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp);
		min-height: 180px;
	}

	.sidebar-rail:hover {
		background: var(--color-bg-subtle);
		color: var(--color-text);
	}

	.sidebar-rail svg {
		writing-mode: horizontal-tb;
	}

	.sidebar-rail .rail-count {
		font-family: var(--font-serif-italic);
		font-style: italic;
		color: var(--color-accent);
	}

	.sidebar-rail .rail-chevron {
		color: var(--color-text-tertiary);
		writing-mode: horizontal-tb;
	}

	.desktop-main {
		padding: 18px 0 60px;
		padding-left: 2.5rem;
	}

	.sidebar-collapsed .desktop-main {
		padding-left: 1.5rem;
	}

	.desktop-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 18px;
	}

	.count-line {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 14px;
		color: var(--color-text-tertiary);
	}
	.count-line .count-num { color: var(--color-text-secondary); }

	.desktop-film-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 32px 22px;
	}

	@media (min-width: 1024px) and (max-width: 1279px) {
		.desktop-film-grid {
			grid-template-columns: repeat(3, 1fr);
		}
		.sidebar-collapsed .desktop-film-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	@media (min-width: 1280px) {
		.sidebar-collapsed .desktop-film-grid {
			grid-template-columns: repeat(5, 1fr);
		}
	}

	/* ---------- Mobile ---------- */
	.mobile-shell {
		display: block;
		padding: 0.25rem 1.125rem 2rem;
	}

	@media (min-width: 1024px) {
		.mobile-shell {
			display: none;
		}
	}

	.mobile-header {
		padding: 12px 0 0;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.mobile-date-label {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 22px;
		font-weight: 400;
		line-height: 1;
		color: var(--color-text);
		letter-spacing: -0.01em;
		padding: 4px 0 14px;
		border-bottom: 1px solid var(--color-border);
	}

	.mobile-date-label .italic-comma { font-style: italic; color: var(--color-text-tertiary); }

	.mobile-search-row {
		display: flex;
		gap: 8px;
		padding: 10px 0;
	}

	.mobile-search {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 9px 12px;
		background: transparent;
		border: 1px solid var(--color-border);
		color: var(--color-text-tertiary);
		min-width: 0;
	}

	.mobile-search input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		font-family: var(--font-serif-italic);
		font-style: italic;
		/* 16px minimum to prevent iOS Safari auto-zoom on focus. */
		font-size: 16px;
		color: var(--color-text);
		min-width: 0;
	}

	.mobile-search input::placeholder {
		color: var(--color-text-tertiary);
	}

	.mobile-filter-btn {
		padding: 0 16px;
		border: 1px solid var(--color-border);
		background: var(--color-text);
		color: var(--color-bg);
		font-family: var(--font-serif);
		font-size: 13px;
		font-weight: 500;
		letter-spacing: -0.005em;
		cursor: pointer;
		font-variation-settings: '"SOFT" 100', '"opsz" 24';
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.mobile-filter-btn .count {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-weight: 400;
		opacity: 0.7;
	}

	.mobile-type-tabs {
		padding: 0 0 12px;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.mobile-list {
		padding-top: 0;
	}

	.mobile-day {
		display: flex;
		flex-direction: column;
	}
</style>
