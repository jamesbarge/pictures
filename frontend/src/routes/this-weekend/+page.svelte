<script lang="ts">
	import FilmCard from '$lib/components/calendar/FilmCard.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { formatScreeningDate, toLondonDateStr, groupBy } from '$lib/utils';

	let { data } = $props();
	type LoadedScreening = (typeof data.screenings)[number];

	const dayGroups = $derived.by(() => {
		// Drop past screenings — ISR caches this page, so filter at render time.
		const now = Date.now();
		const allScreenings: LoadedScreening[] = data.screenings.filter(
			(s) => new Date(s.datetime).getTime() > now
		);
		const grouped = groupBy(allScreenings.filter((s) => s.film), (s) => toLondonDateStr(s.datetime));

		return Object.entries(grouped)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([date, screenings]) => {
				const filmGroups = groupBy(screenings, (s) => s.film.id);
				const films = Object.values(filmGroups).map((filmScreenings) => ({
					film: filmScreenings[0].film,
					screenings: filmScreenings.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
				}));
				return { date, films };
			});
	});
</script>

<svelte:head>
	<title>This Weekend — pictures · london</title>
	<meta name="description" content="Films showing in London this weekend" />
</svelte:head>

<section class="py-6">
	<div class="max-w-[1400px] mx-auto px-4 md:px-8">
		{#if dayGroups.length === 0}
			<EmptyState title="No weekend screenings yet" description="Check back closer to the weekend." />
		{:else}
			{#each dayGroups as { date, films } (date)}
				<div class="day-section mb-8">
					<div class="flex items-baseline gap-3 mb-4 pb-1.5 border-b-2 border-[var(--color-border)]">
						<h2 class="font-display text-sm font-bold tracking-wide-swiss uppercase">
							{formatScreeningDate(date)}
						</h2>
						<span class="text-xs text-[var(--color-text-tertiary)] tracking-wide-swiss uppercase">
							{new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Europe/London' }).toUpperCase()}
						</span>
					</div>

					<div class="film-grid">
						{#each films as { film, screenings } (film.id)}
							<FilmCard
								film={{
									id: film.id,
									title: film.title,
									year: film.year,
									director: film.director ?? null,
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
		.film-grid { grid-template-columns: repeat(3, 1fr); column-gap: 1.25rem; }
	}

	@media (min-width: 1024px) {
		.film-grid { grid-template-columns: repeat(4, 1fr); }
	}

	@media (min-width: 1280px) {
		.film-grid { grid-template-columns: repeat(6, 1fr); }
	}
</style>
