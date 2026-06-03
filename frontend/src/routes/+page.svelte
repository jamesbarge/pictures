<script lang="ts">
	import FigmaFilmCard from '$lib/components/calendar/FigmaFilmCard.svelte';
	import FigmaTextDay from '$lib/components/calendar/FigmaTextDay.svelte';
	import FigmaToolbar from '$lib/components/filters/FigmaToolbar.svelte';
	import DimmerDial from '$lib/components/ui/DimmerDial.svelte';

	type DisplayMode = 'posters' | 'text';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import JsonLd from '$lib/seo/JsonLd.svelte';
	import { webSiteSchema, faqSchema } from '$lib/seo/json-ld';
	import { filters } from '$lib/stores/filters.svelte';
	import { today as todayStore } from '$lib/stores/today.svelte';
	import { buildFilmMap } from '$lib/calendar-filter';
	import { toLondonDateStr, compareFilmsByCalendarPriority } from '$lib/utils';
	import { toCardScreening } from '$lib/components/calendar/card-shapes';
	import { trackFilterNoResults } from '$lib/analytics/posthog';
	import { browser } from '$app/environment';
	import { page } from '$app/state';

	let { data } = $props();

	const cinemas = $derived((page.data?.cinemas ?? []) as Array<{
		id: string;
		name: string;
		shortName: string | null;
		address: { area: string } | null;
		coordinates: { lat: number; lng: number } | null;
	}>);

	let mobileFilterOpen = $state(false);
	let displayMode = $state<DisplayMode>('posters');

	// Lazy-load the mobile filter sheet on first open. The sheet (plus its
	// MobileDatePicker subtree) is filter UI that never renders until the user
	// taps Filter in the toolbar, so keep it out of the home route's client
	// chunk until then. Mirrors the FilmSimilarRail lazy pattern.
	let MobileFilterSheet =
		$state<typeof import('$lib/components/filters/MobileFilterSheet.svelte').default | null>(null);

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

	// Build day-grouped films in a single pass over `filmMap`. The previous
	// implementation flatMapped every screening into a flat list, groupBy'd
	// twice (date → films), then sorted screenings inside each film using
	// `new Date()` in the comparator — N log N allocations per filter change.
	// This version:
	//   • Buckets directly into `Map<date, Map<filmId, entry>>` in one pass.
	//   • Parses each datetime exactly once and stashes the ms onto the
	//     screening for the per-film sort and the calendar-priority sort.
	//   • Lets `compareFilmsByCalendarPriority` consume the pre-computed
	//     `earliestMs` field instead of re-parsing.
	const dayGroups = $derived.by(() => {
		type Screening = (typeof data.screenings)[number];
		type Film = NonNullable<Screening['film']>;
		type Decorated = Screening & { _ms: number };
		type Entry = { film: Film; screenings: Decorated[]; earliestMs: number };

		const dateMap = new Map<string, Map<string, Entry>>();

		for (const { film, screenings } of filmMap.values()) {
			for (const s of screenings) {
				const dt = new Date(s.datetime);
				const ms = dt.getTime();
				const date = toLondonDateStr(dt);

				let day = dateMap.get(date);
				if (!day) {
					day = new Map();
					dateMap.set(date, day);
				}
				let entry = day.get(film.id);
				if (!entry) {
					entry = { film: film as Film, screenings: [], earliestMs: ms };
					day.set(film.id, entry);
				}
				const decorated = s as Decorated;
				decorated._ms = ms;
				entry.screenings.push(decorated);
				if (ms < entry.earliestMs) entry.earliestMs = ms;
			}
		}

		const sortedDates = [...dateMap.keys()].sort();
		return sortedDates.map((date) => {
			const dayEntries = [...dateMap.get(date)!.values()];
			for (const e of dayEntries) e.screenings.sort((a, b) => a._ms - b._ms);
			dayEntries.sort(compareFilmsByCalendarPriority);
			return { date, films: dayEntries };
		});
	});

	const MIN_FILMS_VISIBLE = 24;
	const MAX_DAYS_VISIBLE = 7;
	const visibleDayGroups = $derived.by(() => {
		const out: typeof dayGroups = [];
		let filmCount = 0;
		for (const day of dayGroups) {
			out.push(day);
			filmCount += day.films.length;
			if (out.length >= MAX_DAYS_VISIBLE) break;
			if (filmCount >= MIN_FILMS_VISIBLE) break;
		}
		return out;
	});

	const hasActiveFilters = $derived(
		filters.filmSearch.length > 0 ||
		filters.cinemaIds.length > 0 ||
		!!filters.dateFrom ||
		filters.formats.length > 0 ||
		filters.programmingTypes.length > 0 ||
		filters.genres.length > 0 ||
		filters.decades.length > 0 ||
		filters.timeFrom !== null
	);

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

	const ORDINALS: Record<number, string> = {
		1:'first',2:'second',3:'third',4:'fourth',5:'fifth',6:'sixth',7:'seventh',8:'eighth',9:'ninth',10:'tenth',
		11:'eleventh',12:'twelfth',13:'thirteenth',14:'fourteenth',15:'fifteenth',16:'sixteenth',17:'seventeenth',
		18:'eighteenth',19:'nineteenth',20:'twentieth',21:'twenty-first',22:'twenty-second',23:'twenty-third',
		24:'twenty-fourth',25:'twenty-fifth',26:'twenty-sixth',27:'twenty-seventh',28:'twenty-eighth',
		29:'twenty-ninth',30:'thirtieth',31:'thirty-first'
	};

	const mastheadDate = $derived.by(() => {
		const iso = todayStore.value;
		const d = new Date(iso + 'T12:00:00Z');
		const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Europe/London' }).format(d);
		const dayNum = Number(new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'Europe/London' }).format(d));
		const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'Europe/London' }).format(d);
		return { weekday, ordinal: ORDINALS[dayNum] ?? `${dayNum}th`, month };
	});

	// Shrink the day section to the actual width of its first row of cards, so
	// the black day-header bar lines up with the card grid even when a day has
	// fewer cards than fit per row.
	function fitToFirstRow(node: HTMLElement) {
		function update() {
			const filmRow = node.querySelector<HTMLElement>('.film-row');
			if (!filmRow) { node.style.width = ''; return; }
			const cards = filmRow.querySelectorAll<HTMLElement>(':scope > .card');
			if (!cards.length) { node.style.width = ''; return; }
			// Release the previous pin BEFORE measuring. The pinned inline width
			// overrides the CSS `width: 100%`, so a section pinned narrow (e.g.
			// after a mobile-width pass) would wrap its cards inside the stale
			// pin and re-measure one card per row forever — the section could
			// shrink but never grow back (resize ratchet).
			node.style.width = '';
			let minTop = Infinity;
			for (const c of cards) if (c.offsetTop < minTop) minTop = c.offsetTop;
			const firstRow = [...cards].filter(c => c.offsetTop === minTop);
			const lastInRow = firstRow[firstRow.length - 1];
			const right = lastInRow.getBoundingClientRect().right;
			const left = filmRow.getBoundingClientRect().left;
			node.style.width = `${right - left}px`;
		}
		// Defer one frame so layout has settled (cards may not have measured yet).
		requestAnimationFrame(update);
		const observer = new ResizeObserver(update);
		// Observe the node for content-driven changes (rows collapsing changes
		// its height), and the parent for viewport growth — the node's own box
		// can't grow while pinned, so it would never report a wider viewport.
		observer.observe(node);
		if (node.parentElement) observer.observe(node.parentElement);
		return { destroy() { observer.disconnect(); } };
	}

	interface DayParts { isToday: boolean; weekday: string; ordinal: string; month: string; }
	function dayParts(iso: string): DayParts {
		if (iso === todayStore.value) return { isToday: true, weekday: 'Today', ordinal: '', month: '' };
		const d = new Date(iso + 'T12:00:00Z');
		// Intl returns weekday + month in title case ("Monday", "May") — keep as-is.
		const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Europe/London' }).format(d).toUpperCase();
		const dayNum = Number(new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'Europe/London' }).format(d));
		const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'Europe/London' }).format(d).toUpperCase();
		const ordinal = (ORDINALS[dayNum] ?? `${dayNum}th`).toUpperCase();
		return { isToday: false, weekday, ordinal, month };
	}
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

<div class="page-chrome">
	<FigmaToolbar
		{cinemas}
		{displayMode}
		onDisplayModeChange={(m) => (displayMode = m)}
		onOpenFilters={() => {
			if (!MobileFilterSheet) {
				import('$lib/components/filters/MobileFilterSheet.svelte').then((m) => {
					MobileFilterSheet = m.default;
				});
			}
			mobileFilterOpen = true;
		}}
	/>

	{#if visibleDayGroups.length === 0}
		<EmptyState
			title="No screenings found"
			description={hasActiveFilters ? 'Your filters returned no upcoming screenings.' : 'Check back later — scrapers update daily.'}
		>
			{#if hasActiveFilters}
				<button type="button" class="clear-filters-btn" onclick={() => filters.clearAll()}>
					Clear filters
				</button>
			{/if}
		</EmptyState>
	{:else}
		{#each visibleDayGroups as { date, films }, di (date)}
				{@const parts = dayParts(date)}
				<section class="day" class:day-wide={displayMode === 'text'} use:fitToFirstRow>
					<header class="day-header">
						<h2>
							{#if parts.isToday}
								TODAY
							{:else}
								{parts.weekday} THE <span class="day-ord">{parts.ordinal}</span> OF {parts.month}
							{/if}
						</h2>
					</header>
					{#if displayMode === 'text'}
						<FigmaTextDay
							films={films.map(({ film, screenings }) => ({
								film: {
									id: film.id,
									title: film.title,
									year: film.year,
									director: film.director ?? null
								},
								screenings: screenings.map((s) => ({
									id: s.id,
									datetime: s.datetime,
									cinemaName: s.cinema?.name ?? 'Unknown',
									format: s.format,
									bookingUrl: s.bookingUrl
								}))
							}))}
						/>
					{:else}
						<div class="film-row">
							{#each films as { film, screenings }, fi (film.id)}
								<FigmaFilmCard
									film={{
										id: film.id,
										title: film.title,
										year: film.year,
										director: film.director ?? null,
										runtime: film.runtime,
										posterUrl: film.posterUrl
									}}
									screenings={screenings.map(toCardScreening)}
									priority={di === 0 && fi < 4}
								/>
							{/each}
						</div>
					{/if}
			</section>
		{/each}
	{/if}
</div>

<div class="dimmer-anchor">
	<DimmerDial />
</div>

{#if MobileFilterSheet}
	<MobileFilterSheet
		cinemas={cinemas}
		filmCount={filmMap.size}
		open={mobileFilterOpen}
		onClose={() => (mobileFilterOpen = false)}
	/>
{/if}

<style>
	/* Page chrome hugs the cards row exactly so the toolbar above and the day
	   section below share the same left/right edges. Width staircase mirrors
	   the .day rule below. Each card is 328px and overlaps the previous by 1px
	   via `margin-left: -1px`, so N cards = 328 + (N-1)*327. */
	.page-chrome {
		width: 100%;
		margin: 0 auto;
		padding: 24px 16px 60px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}

	@media (min-width: 1030px) {
		.page-chrome { max-width: calc(982px + 48px); }
	}

	@media (min-width: 1357px) {
		.page-chrome { max-width: calc(1309px + 48px); }
	}

	.dimmer-anchor {
		position: fixed;
		top: 32px;
		right: 24px;
		z-index: 60;
		transition: opacity var(--duration-normal) var(--ease-sharp), visibility 0s linear;
	}

	/* The dial shares the header's top-right corner; when the header compacts
	   the nav row moves up into that space, so fade the dial out. It returns
	   when the user scrolls back to the top. */
	:global(html[data-header-compact]) .dimmer-anchor {
		opacity: 0;
		visibility: hidden;
		transition:
			opacity var(--duration-normal) var(--ease-sharp),
			visibility 0s linear var(--duration-normal);
	}

	@media (min-width: 768px) {
		.page-chrome {
			padding: 28px 24px 80px;
			gap: 35px;
		}
	}

	.masthead {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 28px;
		font-weight: 400;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--color-text);
		text-align: left;
	}

	@media (min-width: 768px) {
		.masthead {
			font-size: 36px;
		}
	}

	.m-weekday { font-weight: 700; }
	.m-comma   { color: var(--color-text-tertiary); }
	.m-ordinal { font-weight: 300; color: var(--color-text-secondary); }
	.m-month   { font-weight: 300; color: var(--color-text-tertiary); }

	/* Day section caps at N cards wide for the viewport. The fitToFirstRow JS
	   action overrides this with an explicit shrunken width when a day has
	   fewer cards than the cap, so the black header bar lines up with the
	   actual cards beneath it. */
	.day {
		display: flex;
		flex-direction: column;
		align-self: flex-start;
		width: 100%;
		max-width: 100%;
	}

	@media (min-width: 703px) {
		.day { max-width: 655px; }     /* 2 cards (656 - 1) */
	}

	@media (min-width: 1030px) {
		.day { max-width: 982px; }     /* 3 cards (984 - 2) */
	}

	@media (min-width: 1357px) {
		.day { max-width: 1309px; }    /* 4 cards (1312 - 3) */
	}

	/* In TEXT mode, the day section ignores the card-row width ladder and uses
	   the full page-chrome width — the table doesn't need to line up with poster
	   cards underneath, and the row data benefits from breathing room. */
	.day.day-wide { max-width: 100%; }

	.clear-filters-btn {
		padding: 10px 18px;
		min-height: 40px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-brutalist);
		background: var(--color-surface);
		color: var(--color-text);
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			transform var(--duration-fast) var(--ease-sharp),
			box-shadow var(--duration-fast) var(--ease-sharp);
	}

	.clear-filters-btn:hover { background: var(--color-cream); }

	.clear-filters-btn:active {
		transform: translate(4px, 4px);
		box-shadow: 0 0 0 0 transparent;
	}

	.day-header {
		/* Fixed colours so the bar stays readable when house lights are dimmed
		   (without this, --color-text inverts to cream-on-cream). */
		background: #1f1f1f;
		color: #eae5c2;
		padding: 6px 16px;
		text-align: left;
		border-top-left-radius: 16px;
		border-top-right-radius: 16px;
	}

	.day-header h2 {
		margin: 0;
		font-family: var(--font-sans);
		font-weight: 300;
		font-size: 20px;
		letter-spacing: -0.01em;
		color: #eae5c2;
		text-transform: none;
		text-align: left;
	}

	.day-header .day-ord {
		font-weight: 700;
	}

	@media (min-width: 768px) {
		.day-header h2 {
			font-size: 24px;
		}
	}

	.film-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
	}

	/* Cards touch on desktop — borders overlap to read as 1px lines */
	@media (min-width: 768px) {
		.film-row :global(.card) + :global(.card) {
			margin-left: -1px;
		}
	}

	/* Mobile: stack cards one per row with a separator */
	@media (max-width: 767px) {
		.film-row {
			flex-direction: column;
		}

		.film-row :global(.card) + :global(.card) {
			margin-top: -1px;
		}
	}
</style>
