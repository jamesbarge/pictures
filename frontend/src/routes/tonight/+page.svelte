<script lang="ts">
	import FilmCard from '$lib/components/calendar/FilmCard.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { ScreeningWithDetails } from '$lib/types';
	import { formatDate } from '$lib/utils';

	let { data } = $props();

	const todayLabel = formatDate(new Date());

	const filmMap = $derived.by(() => {
		const map = new Map<string, { film: ScreeningWithDetails['film']; screenings: ScreeningWithDetails[] }>();
		for (const s of data.screenings) {
			if (!s.film) continue;
			const existing = map.get(s.film.id);
			if (existing) {
				existing.screenings.push(s);
			} else {
				map.set(s.film.id, { film: s.film, screenings: [s] });
			}
		}
		return [...map.values()];
	});
</script>

<svelte:head>
	<title>Tonight — pictures · london</title>
	<meta name="description" content="Films showing in London tonight" />
</svelte:head>

<section class="py-6">
	<div class="max-w-[1400px] mx-auto px-4 md:px-8">
		<div class="flex items-baseline gap-3 mb-4 pb-1.5 border-b-2 border-[var(--color-border)]">
			<h1 class="font-display text-sm font-bold tracking-wide-swiss uppercase">TONIGHT</h1>
			<span class="text-xs text-[var(--color-text-tertiary)] tracking-wide-swiss uppercase">{todayLabel}</span>
		</div>

		{#if filmMap.length === 0}
			<EmptyState title="Nothing showing tonight" description="Check back later or browse all screenings." />
		{:else}
			<div class="film-grid">
				{#each filmMap as { film, screenings } (film.id)}
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
