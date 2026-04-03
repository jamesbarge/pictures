<script lang="ts">
	import FilmCard from '$lib/components/calendar/FilmCard.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { ScreeningWithDetails } from '$lib/types';
	import { groupBy } from '$lib/utils';

	let { data } = $props();
	const festival = $derived(data.festival);
	const screenings = $derived(data.screenings ?? []);

	const filmGroups = $derived.by(() => {
		const grouped = groupBy(screenings, (s) => s.film?.id ?? 'unknown');
		return Object.values(grouped).map((ss) => ({
			film: ss[0].film,
			screenings: ss.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
		}));
	});
</script>

<svelte:head>
	<title>{festival?.name ?? 'Festival'} — pictures · london</title>
	<meta name="description" content="{festival?.name ?? 'Festival'} — screenings and programme in London" />
</svelte:head>

<section class="py-6">
	<div class="max-w-[1400px] mx-auto px-4 md:px-8">
		<h1 class="font-display text-2xl font-bold tracking-tight-swiss uppercase mb-2">
			{festival?.name ?? 'Festival'}
		</h1>
		{#if festival?.description}
			<p class="text-sm text-[var(--color-text-secondary)] mb-6 max-w-[40rem]">{festival.description}</p>
		{/if}

		{#if filmGroups.length === 0}
			<EmptyState title="No screenings" description="No programme available yet." />
		{:else}
			<div class="film-grid">
				{#each filmGroups as { film, screenings } (film?.id)}
					{#if film}
						<FilmCard
							film={{ id: film.id, title: film.title, year: film.year, director: film.directors?.[0] ?? null, runtime: film.runtime, genres: film.genres ?? [], posterUrl: film.posterUrl, tmdbId: null }}
							screenings={screenings.map((s) => ({ id: s.id, datetime: s.datetime, cinemaName: s.cinema?.name ?? '', cinemaSlug: s.cinema?.id ?? '', bookingUrl: s.bookingUrl }))}
						/>
					{/if}
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
		grid-auto-rows: auto;
	}
	@media (min-width: 768px) { .film-grid { grid-template-columns: repeat(3, 1fr); column-gap: 1.25rem; } }
	@media (min-width: 1024px) { .film-grid { grid-template-columns: repeat(4, 1fr); } }
	@media (min-width: 1280px) { .film-grid { grid-template-columns: repeat(6, 1fr); } }
</style>
