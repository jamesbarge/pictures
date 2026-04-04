<script lang="ts">
	import FilmCard from './FilmCard.svelte';
	import { formatScreeningDate } from '$lib/utils';
	import type { Film, Screening } from '$lib/types';

	interface FilmWithScreenings {
		film: Film;
		screenings: Screening[];
	}

	let {
		date,
		films,
		activeCinemaIds = []
	}: {
		date: string;
		films: FilmWithScreenings[];
		activeCinemaIds?: string[];
	} = $props();

	const dateLabel = $derived(formatScreeningDate(date));
	const dateDetail = $derived.by(() => {
		const d = new Date(date + 'T00:00:00');
		return d.toLocaleDateString('en-GB', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			timeZone: 'Europe/London'
		}).toUpperCase();
	});
</script>

<section class="day-section">
	<div class="day-header">
		<h2 class="day-label font-display">{dateLabel}</h2>
		{#if dateLabel !== dateDetail}
			<span class="day-detail">{dateDetail}</span>
		{/if}
	</div>

	<div class="film-grid">
		{#each films as { film, screenings } (film.id)}
			<FilmCard
				film={{
					id: film.id,
					title: film.title,
					year: film.year,
					director: film.directors[0] ?? null,
					runtime: film.runtime,
					genres: film.genres,
					posterUrl: film.posterUrl,
					tmdbId: film.tmdbId
				}}
				screenings={screenings.map((s) => ({
					id: s.id,
					datetime: s.datetime,
					cinemaName: s.cinemaId,
					cinemaSlug: s.cinemaId,
					bookingUrl: s.bookingUrl
				}))}
				{activeCinemaIds}
			/>
		{/each}
	</div>
</section>

<style>
	.day-section {
		margin-bottom: 2rem;
	}

	.day-header {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		margin-bottom: 1rem;
		padding-bottom: 0.375rem;
		border-bottom: 2px solid var(--color-border);
	}

	.day-label {
		font-size: var(--font-size-sm);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.day-detail {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.film-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
	}

	@media (min-width: 768px) {
		.film-grid {
			grid-template-columns: repeat(3, 1fr);
			gap: 1.25rem;
		}
	}

	@media (min-width: 1024px) {
		.film-grid {
			grid-template-columns: repeat(4, 1fr);
			gap: 1.5rem;
		}
	}

	@media (min-width: 1280px) {
		.film-grid {
			grid-template-columns: repeat(5, 1fr);
		}
	}
</style>
