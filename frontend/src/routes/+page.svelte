<script lang="ts">
	import FilmCard from '$lib/components/calendar/FilmCard.svelte';
	import TableView from '$lib/components/calendar/TableView.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import JsonLd from '$lib/seo/JsonLd.svelte';
	import { webSiteSchema, faqSchema } from '$lib/seo/json-ld';
	import { filters } from '$lib/stores/filters.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { formatScreeningDate, toLondonDateStr, groupBy } from '$lib/utils';

	let { data } = $props();

	// Group screenings by film, then by date
	const filmMap = $derived.by(() => {
		const map = new Map<string, {
			film: (typeof data.screenings)[0]['film'];
			screenings: (typeof data.screenings)[0][];
		}>();

		for (const s of data.screenings) {
			if (!s.film) continue;

			// Apply film search filter
			if (filters.filmSearch && !s.film.title.toLowerCase().includes(filters.filmSearch.toLowerCase())) continue;

			// Apply cinema filter
			if (filters.cinemaIds.length > 0 && !filters.cinemaIds.includes(s.cinema?.id ?? '')) continue;

			// Apply date filter
			if (filters.dateFrom || filters.dateTo) {
				const screeningDate = s.datetime.split('T')[0];
				if (filters.dateFrom && screeningDate < filters.dateFrom) continue;
				if (filters.dateTo && screeningDate > filters.dateTo) continue;
			}

			// Apply format filter — exclude screenings with no format when filtering
			if (filters.formats.length > 0 && (!s.format || !filters.formats.includes(s.format))) continue;

			// Apply time filter (use London timezone)
			if (filters.timeFrom !== null && filters.timeTo !== null) {
				const hour = parseInt(
					new Date(s.datetime).toLocaleString('en-GB', {
						hour: 'numeric', hour12: false, timeZone: 'Europe/London'
					})
				);
				if (hour < filters.timeFrom || hour > filters.timeTo) continue;
			}

			// Apply programming type filter (OR logic: show if film matches ANY selected type)
			if (filters.programmingTypes.length > 0) {
				const isRepertory = s.film.isRepertory;
				const matchesAny = filters.programmingTypes.some((type) =>
					type === 'repertory' ? isRepertory : !isRepertory
				);
				if (!matchesAny) continue;
			}

			const existing = map.get(s.film.id);
			if (existing) {
				existing.screenings.push(s);
			} else {
				map.set(s.film.id, { film: s.film, screenings: [s] });
			}
		}

		return map;
	});

	// Group by date for day sections
	const dayGroups = $derived.by(() => {
		const allScreenings = [...filmMap.values()].flatMap((f) =>
			f.screenings.map((s) => ({ ...s, film: f.film }))
		);

		const grouped = groupBy(allScreenings, (s) => toLondonDateStr(s.datetime));

		return Object.entries(grouped)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([date, screenings]) => {
				// Group screenings by film within each day
				const filmGroups = groupBy(screenings, (s) => s.film.id);
				const films = Object.values(filmGroups).map((filmScreenings) => ({
					film: filmScreenings[0].film,
					screenings: filmScreenings.sort(
						(a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
					)
				}));

				return { date, films };
			});
	});

	// For table view: flatten to rows of film + screenings
	const tableRows = $derived.by(() => {
		return [...filmMap.values()].map(({ film, screenings }) => ({
			film: {
				id: film.id,
				title: film.title,
				year: film.year,
				directors: film.directors ?? [],
				runtime: film.runtime,
				isRepertory: film.isRepertory ?? false,
				genres: [],
				posterUrl: film.posterUrl
			},
			screenings: screenings
				.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
				.map((s) => ({
					id: s.id,
					datetime: s.datetime,
					format: s.format ?? null,
					bookingUrl: s.bookingUrl,
					cinema: s.cinema ?? { id: '', name: 'Unknown', shortName: null }
				}))
		}));
	});
</script>

<div class="sr-only" aria-live="polite" role="status">
	{#if dayGroups.length === 0}
		No screenings found
	{:else}
		{filmMap.size} films showing
	{/if}
</div>

<JsonLd data={webSiteSchema()} />
<JsonLd data={faqSchema([
	{ question: 'What is pictures.london?', answer: 'pictures.london is a comprehensive London cinema listings site showing every film screening across independent and chain cinemas, updated daily.' },
	{ question: 'Which cinemas does pictures.london cover?', answer: 'We cover 57+ London cinemas including BFI Southbank, Prince Charles Cinema, Barbican, ICA, Curzon, Picturehouse, Everyman, and many independent venues.' },
	{ question: 'Is pictures.london free to use?', answer: 'Yes, pictures.london is completely free. We aggregate screening times and link directly to cinema booking pages.' },
	{ question: 'Can I import my Letterboxd watchlist?', answer: 'Yes! Visit the Letterboxd Import page, enter your username, and see which films on your watchlist are currently showing in London cinemas.' }
])} />

<section class="py-6">
	<div class="max-w-[1400px] mx-auto px-4 md:px-8">
		{#if dayGroups.length === 0}
			<EmptyState
				title="No screenings found"
				description="Try adjusting your filters or check back later."
			/>
		{:else if preferences.viewMode === 'text'}
			<TableView rows={tableRows} />
		{:else}
			{#each dayGroups as { date, films } (date)}
				<div class="day-section mb-8">
					<div class="day-header flex items-baseline gap-3 mb-4 pb-1.5 border-b-2 border-[var(--color-border)]">
						<h2 class="font-display text-sm font-bold tracking-wide-swiss uppercase">
							{formatScreeningDate(date)}
						</h2>
						<span class="text-xs text-[var(--color-text-tertiary)] tracking-wide-swiss uppercase">
							{new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' }).toUpperCase()}
						</span>
					</div>

					<div class="film-grid">
						{#each films as { film, screenings } (film.id)}
							<FilmCard
								film={{
									id: film.id,
									title: film.title,
									year: film.year,
									director: film.directors?.[0] ?? null,
									runtime: film.runtime,
									genres: [],
									posterUrl: film.posterUrl,
									tmdbId: null
								}}
								screenings={screenings.map((s) => ({
									id: s.id,
									datetime: s.datetime,
									cinemaName: s.cinema?.name ?? 'Unknown',
									cinemaSlug: s.cinema?.id ?? '',
									bookingUrl: s.bookingUrl
								}))}
								activeCinemaIds={filters.cinemaIds}
							/>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</section>

<style>
	.film-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		column-gap: 1rem;
		row-gap: 0;
		grid-auto-rows: auto;
	}

	@media (min-width: 768px) {
		.film-grid {
			grid-template-columns: repeat(3, 1fr);
			column-gap: 1.25rem;
		}
	}

	@media (min-width: 1024px) {
		.film-grid {
			grid-template-columns: repeat(4, 1fr);
			column-gap: 1.25rem;
		}
	}

	@media (min-width: 1280px) {
		.film-grid {
			grid-template-columns: repeat(6, 1fr);
		}
	}
</style>
