<script lang="ts">
	import FilmCard from '$lib/components/calendar/FilmCard.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { formatScreeningDate, toLondonDateStr, groupBy, compareFilmsByCalendarPriority } from '$lib/utils';
	import { toCardScreening } from '$lib/components/calendar/card-shapes';

	let { data } = $props();
	type LoadedScreening = (typeof data.screenings)[number];

	const dayGroups = $derived.by(() => {
		// Drop past screenings — ISR caches this page, so filter at render time.
		// Decorate each kept screening with its parsed timestamp so subsequent
		// sorts compare numbers instead of re-parsing the datetime string.
		const now = Date.now();
		type DecoratedScreening = LoadedScreening & { _ms: number };
		const kept: DecoratedScreening[] = [];
		for (const s of data.screenings) {
			if (!s.film) continue;
			const ms = new Date(s.datetime).getTime();
			if (ms <= now) continue;
			(s as DecoratedScreening)._ms = ms;
			kept.push(s as DecoratedScreening);
		}
		const grouped = groupBy(kept, (s) => toLondonDateStr(s.datetime));

		return Object.entries(grouped)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([date, screenings]) => {
				const filmGroups = groupBy(screenings, (s) => s.film.id);
				const films = Object.values(filmGroups)
					.map((filmScreenings) => {
						filmScreenings.sort((a, b) => a._ms - b._ms);
						return {
							film: filmScreenings[0].film,
							screenings: filmScreenings,
							earliestMs: filmScreenings[0]._ms
						};
					})
					.sort(compareFilmsByCalendarPriority);
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
			{#each dayGroups as { date, films }, dayIndex (date)}
				<div class="day-section mb-8">
					<div class="flex items-baseline gap-3 mb-4 pb-1.5 border-b-2 border-[var(--color-border)]">
						<h2 class="font-display text-sm font-bold tracking-wide-swiss uppercase">
							{formatScreeningDate(date)}
						</h2>
						<span class="text-xs text-[var(--color-text-tertiary)] tracking-wide-swiss uppercase">
							{new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Europe/London' }).toUpperCase()}
						</span>
					</div>

					<div class="film-grid">
						{#each films as { film, screenings }, i (film.id)}
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
								screenings={screenings.map(toCardScreening)}
								priority={dayIndex === 0 && i === 0}
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
		content-visibility: auto;
		contain-intrinsic-size: auto 900px;
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
