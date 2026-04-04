<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import { filmStatuses } from '$lib/stores/film-status.svelte';
	import { formatTime, formatScreeningDate, toLondonDateStr, groupBy } from '$lib/utils';
	import { trackFilmView, trackBookingClick } from '$lib/analytics/posthog';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import type { FilmStatus } from '$lib/types';

	let { data } = $props();

	const film = $derived(data.film);
	const screenings = $derived(data.screenings);
	const currentStatus = $derived(filmStatuses.getStatus(film.id));

	onMount(() => {
		trackFilmView({
			filmId: film.id,
			filmTitle: film.title,
			filmYear: film.year,
			genres: film.genres,
			directors: film.directors
		}, 'film_detail');
	});

	function toggleStatus(status: FilmStatus) {
		filmStatuses.toggleStatus(film.id, status);
	}

	const futureScreenings = $derived(
		screenings
			.filter((s) => new Date(s.datetime) > new Date())
			.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
	);

	const groupedByDate = $derived.by(() => {
		const grouped = groupBy(futureScreenings, (s) => toLondonDateStr(s.datetime));
		return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
	});
</script>

<svelte:head>
	<title>{film.title} — pictures · london</title>
	<meta name="description" content="{film.title} ({film.year}) — {futureScreenings.length} screenings in London" />
	<meta property="og:title" content="{film.title} — pictures · london" />
	<meta property="og:description" content="{film.title} ({film.year}){film.directors?.length ? ` directed by ${film.directors[0]}` : ''} — {futureScreenings.length} screenings in London" />
	<meta property="og:type" content="video.movie" />
	{#if film.posterUrl}
		<meta property="og:image" content={film.posterUrl} />
	{/if}
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
	<!-- Hero -->
	<div class="film-hero">
		{#if film.posterUrl}
			<div class="poster-col">
				<img
					src={film.posterUrl}
					alt="{film.title} poster"
					class="w-full border border-[var(--color-border-subtle)]"
					width="280"
					height="420"
					fetchpriority="high"
				/>
			</div>
		{/if}

		<div class="info-col">
			<h1 class="film-title font-display">{film.title}</h1>

			{#if film.originalTitle && film.originalTitle !== film.title}
				<p class="original-title">{film.originalTitle}</p>
			{/if}

			{#if film.tagline}
				<p class="tagline">{film.tagline}</p>
			{/if}

			<div class="meta-row">
				{#if film.year}<span>{film.year}</span>{/if}
				{#if film.runtime}<span>{film.runtime}m</span>{/if}
				{#if film.certification}<span>{film.certification}</span>{/if}
				{#if film.countries?.length}<span>{film.countries[0]}</span>{/if}
			</div>

			{#if film.directors?.length}
				<p class="directors">
					<span class="label">Director{film.directors.length > 1 ? 's' : ''}</span>
					{film.directors.join(', ')}
				</p>
			{/if}

			{#if film.cast?.length}
				<p class="cast">
					<span class="label">Cast</span>
					{film.cast.slice(0, 5).map((c) => c.name).join(', ')}
				</p>
			{/if}

			{#if film.genres?.length}
				<div class="genres">
					{#each film.genres as genre}
						<Badge variant="muted">{genre}</Badge>
					{/each}
				</div>
			{/if}

			{#if film.synopsis}
				<p class="synopsis">{film.synopsis}</p>
			{/if}

			<!-- Status toggle -->
			<div class="status-row" role="group" aria-label="Film status">
				<button
					class="status-btn"
					class:active={currentStatus === 'want_to_see'}
					aria-pressed={currentStatus === 'want_to_see'}
					onclick={() => toggleStatus('want_to_see')}
				>
					WANT TO SEE
				</button>
				<button
					class="status-btn"
					class:active={currentStatus === 'not_interested'}
					aria-pressed={currentStatus === 'not_interested'}
					onclick={() => toggleStatus('not_interested')}
				>
					NOT INTERESTED
				</button>
			</div>

			<!-- External links -->
			<div class="external-links">
				{#if film.letterboxdUrl}
					<a href={film.letterboxdUrl} target="_blank" rel="noopener noreferrer" class="ext-link">Letterboxd<span class="sr-only"> (opens in new tab)</span></a>
				{/if}
				{#if film.imdbId}
					<a href="https://www.imdb.com/title/{film.imdbId}" target="_blank" rel="noopener noreferrer" class="ext-link">IMDb<span class="sr-only"> (opens in new tab)</span></a>
				{/if}
				{#if film.tmdbId}
					<a href="https://www.themoviedb.org/movie/{film.tmdbId}" target="_blank" rel="noopener noreferrer" class="ext-link">TMDB<span class="sr-only"> (opens in new tab)</span></a>
				{/if}
			</div>
		</div>
	</div>

	<!-- Screenings -->
	{#if futureScreenings.length > 0}
		<section class="screenings-section" aria-labelledby="screenings-heading">
			<h2 id="screenings-heading" class="section-heading font-display">
				UPCOMING SCREENINGS
				<span class="screening-count">{futureScreenings.length}</span>
			</h2>

			{#each groupedByDate as [date, dayScreenings] (date)}
				<div class="day-group">
					<h3 class="day-label">{formatScreeningDate(date)}</h3>
					<div class="screening-rows">
						{#each dayScreenings as screening (screening.id)}
							<div class="screening-row-wrapper">
								<a
									href={screening.bookingUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="screening-row"
									aria-label="Book {formatTime(screening.datetime)} at {screening.cinema?.name ?? 'cinema'}"
								>
									<time class="screening-time" datetime={screening.datetime}>{formatTime(screening.datetime)}</time>
									<span class="screening-cinema">{screening.cinema?.name ?? 'Unknown'}</span>
									{#if screening.format && screening.format !== 'unknown' && screening.format !== 'dcp'}
										<Badge variant="muted">{screening.format.toUpperCase()}</Badge>
									{/if}
									{#if screening.screen}
										<span class="screening-screen">{screening.screen}</span>
									{/if}
									<svg aria-hidden="true" class="booking-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
										<path d="M2 10L10 2M10 2H4M10 2V8" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"/>
									</svg>
								</a>
								<a
									href="/api/calendar?screening={screening.id}"
									download
									class="ical-btn"
									title="Add to calendar"
									aria-label="Add {formatTime(screening.datetime)} at {screening.cinema?.name ?? 'cinema'} to calendar"
									onclick={(e) => e.stopPropagation()}
								>
									<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
										<rect x="1" y="2.5" width="12" height="10" rx="0" stroke="currentColor" stroke-width="1.2"/>
										<line x1="1" y1="5.5" x2="13" y2="5.5" stroke="currentColor" stroke-width="1.2"/>
										<line x1="4" y1="1" x2="4" y2="4" stroke="currentColor" stroke-width="1.2"/>
										<line x1="10" y1="1" x2="10" y2="4" stroke="currentColor" stroke-width="1.2"/>
									</svg>
								</a>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</section>
	{/if}
</div>

<style>
	.film-hero {
		display: grid;
		grid-template-columns: 1fr;
		gap: 2rem;
	}

	@media (min-width: 768px) {
		.film-hero {
			grid-template-columns: 280px 1fr;
		}
	}

	.poster-col img {
		max-width: 280px;
	}

	.film-title {
		font-size: var(--font-size-3xl);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}

	.original-title {
		font-size: var(--font-size-lg);
		font-style: italic;
		color: var(--color-text-secondary);
		margin-top: 0.25rem;
	}

	.tagline {
		font-size: var(--font-size-base);
		font-style: italic;
		color: var(--color-text-tertiary);
		margin-top: 0.5rem;
	}

	.meta-row {
		display: flex;
		gap: 0.75rem;
		margin-top: 1rem;
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.meta-row span:not(:last-child)::after {
		content: '·';
		margin-left: 0.75rem;
		color: var(--color-text-tertiary);
	}

	.directors, .cast {
		margin-top: 0.75rem;
		font-size: var(--font-size-sm);
		color: var(--color-text);
	}

	.label {
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		display: block;
		margin-bottom: 0.125rem;
	}

	.genres {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-top: 1rem;
	}

	.synopsis {
		margin-top: 1.25rem;
		font-size: var(--font-size-base);
		line-height: 1.6;
		color: var(--color-text-secondary);
		max-width: 40rem;
	}

	.status-row {
		display: inline-flex;
		margin-top: 1.5rem;
		border: 1px solid var(--color-border);
	}

	.status-btn {
		padding: 0.5rem 1rem;
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-secondary);
		background: transparent;
		border: none;
		border-right: 1px solid var(--color-border);
		cursor: pointer;
		transition: color var(--duration-fast) var(--ease-sharp),
			background-color var(--duration-fast) var(--ease-sharp);
	}

	.status-btn:last-child {
		border-right: none;
	}

	.status-btn:hover {
		color: var(--color-text);
		background: var(--color-bg-subtle);
	}

	.status-btn.active {
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
	}

	.external-links {
		display: flex;
		gap: 1rem;
		margin-top: 1rem;
	}

	.ext-link {
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-tertiary);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.ext-link:hover {
		color: var(--color-text);
	}

	/* Screenings section */
	.screenings-section {
		margin-top: 3rem;
		border-top: 2px solid var(--color-border);
		padding-top: 1.5rem;
	}

	.section-heading {
		font-size: var(--font-size-sm);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 1.5rem;
	}

	.screening-count {
		font-family: var(--font-mono);
		color: var(--color-text-tertiary);
		margin-left: 0.5rem;
	}

	.day-group {
		margin-bottom: 1.5rem;
	}

	.day-label {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-tertiary);
		margin-bottom: 0.5rem;
	}

	.screening-rows {
		display: flex;
		flex-direction: column;
	}

	.screening-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0;
		border-bottom: 1px solid var(--color-border-subtle);
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	.screening-row:hover {
		background: var(--color-bg-subtle);
		margin: 0 -0.75rem;
		padding-left: 0.75rem;
		padding-right: 0.75rem;
	}

	.screening-time {
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		font-weight: 600;
		min-width: 3rem;
	}

	.screening-cinema {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		flex: 1;
	}

	.screening-screen {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
	}

	.booking-arrow {
		color: var(--color-text-tertiary);
		flex-shrink: 0;
	}

	.screening-row:hover .booking-arrow {
		color: var(--color-text);
	}

	.screening-row-wrapper {
		display: flex;
		align-items: center;
	}

	.ical-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		flex-shrink: 0;
		color: var(--color-text-tertiary);
		transition: color var(--duration-fast) var(--ease-sharp);
	}

	.ical-btn:hover {
		color: var(--color-text);
	}
</style>
