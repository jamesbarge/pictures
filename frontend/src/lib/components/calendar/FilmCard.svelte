<script lang="ts">
	import { formatTime, getPosterImageAttributes } from '$lib/utils';
	import FittedTitleCanvas from '$lib/components/pretext/FittedTitleCanvas.svelte';
	import { trackScreeningClick } from '$lib/analytics/posthog';

	interface Screening {
		id: string;
		datetime: string;
		cinemaName: string;
		cinemaSlug?: string;
		bookingUrl?: string;
	}

	interface Film {
		id: string | number;
		title: string;
		year?: number | null;
		director?: string | null;
		runtime?: number | null;
		genres?: string[] | null;
		posterUrl?: string | null;
		tmdbId?: number | null;
	}

	let {
		film,
		screenings,
		activeCinemaIds = [],
		maxScreenings = 3
	}: {
		film: Film;
		screenings: Screening[];
		activeCinemaIds?: string[];
		maxScreenings?: number;
	} = $props();

	let isHovered = $state(false);

	const filteredScreenings = $derived.by(() => {
		let s = screenings
			.filter((sc) => new Date(sc.datetime) > new Date())
			.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

		if (activeCinemaIds.length > 0) {
			s = s.filter((sc) => activeCinemaIds.includes(sc.cinemaSlug ?? ''));
		}

		return s;
	});

	const visibleScreenings = $derived(filteredScreenings.slice(0, maxScreenings));
	const overflowCount = $derived(Math.max(0, filteredScreenings.length - maxScreenings));

	const metaLine = $derived.by(() => {
		const parts: string[] = [];
		if (film.year) parts.push(String(film.year));
		if (film.director) parts.push(film.director);
		return parts.join(' · ');
	});

	const detailLine = $derived.by(() => {
		const parts: string[] = [];
		if (film.runtime) parts.push(`${film.runtime}m`);
		if (film.genres?.length) parts.push(film.genres.slice(0, 2).join(', '));
		return parts.join(' · ').toLowerCase();
	});

	const posterImage = $derived(
		getPosterImageAttributes(film.posterUrl, {
			baseSize: 'w342',
			srcSetSizes: ['w185', 'w342', 'w500'],
			sizes: '(min-width: 1280px) 220px, (min-width: 1024px) 23vw, (min-width: 768px) 30vw, 46vw'
		})
	);
</script>

<article
	class="film-card group"
	aria-label="{film.title}{film.year ? ` (${film.year})` : ''}"
	onmouseenter={() => (isHovered = true)}
	onmouseleave={() => (isHovered = false)}
>
	<!-- Row 1: Poster -->
	<a href="/film/{film.id}" class="poster-link">
		<div class="poster-container relative aspect-[2/3] overflow-hidden bg-[var(--color-bg-subtle)]">
			{#if film.posterUrl}
				<img
					src={posterImage?.src ?? film.posterUrl}
					srcset={posterImage?.srcset}
					sizes={posterImage?.sizes}
					alt="{film.title} poster"
					class="w-full h-full object-cover"
					loading="lazy"
					decoding="async"
				/>
			{:else}
				<div class="w-full h-full flex items-center justify-center p-4">
					<span class="font-display text-lg text-center text-[var(--color-text-tertiary)] tracking-tight-swiss">
						{film.title}
					</span>
				</div>
			{/if}

			{#if isHovered && film.posterUrl}
				<FittedTitleCanvas
					title={film.title}
					posterUrl={posterImage?.src ?? film.posterUrl}
				/>
			{/if}
		</div>
	</a>

	<!-- Row 2: Title -->
	<a href="/film/{film.id}" class="title-area">
		<h3 class="film-title font-display">
			{film.title}
		</h3>
	</a>

	<!-- Row 3: Metadata (year, director, runtime, genres) -->
	<a href="/film/{film.id}" class="meta-area">
		{#if metaLine}
			<p class="meta-text">{metaLine}</p>
		{/if}
		{#if detailLine}
			<p class="detail-text">{detailLine}</p>
		{/if}
	</a>

	<!-- Row 4: Screening pills -->
	<div class="screenings-area">
		{#if visibleScreenings.length > 0}
			<div class="flex flex-col gap-px">
				{#each visibleScreenings as screening}
					<a
						href={screening.bookingUrl ?? `/film/${film.id}`}
						class="screening-pill"
						target={screening.bookingUrl ? '_blank' : undefined}
						rel={screening.bookingUrl ? 'noopener noreferrer' : undefined}
						aria-label="{screening.bookingUrl ? 'Book' : 'View'} {film.title} at {formatTime(screening.datetime)}, {screening.cinemaName}"
						onclick={() => trackScreeningClick({
							filmId: String(film.id),
							filmTitle: film.title,
							filmYear: film.year,
							screeningId: screening.id,
							screeningTime: screening.datetime,
							cinemaName: screening.cinemaName
						}, 'calendar')}
					>
						<time class="font-semibold" datetime={screening.datetime}>{formatTime(screening.datetime)}</time>
						<span>{screening.cinemaName}</span>
					</a>
				{/each}
				{#if overflowCount > 0}
					<a
						href="/film/{film.id}"
						class="text-xs text-[var(--color-text-tertiary)] mt-1 tracking-wide-swiss uppercase hover:text-[var(--color-text)]"
						aria-label="{overflowCount} more screenings of {film.title}"
					>
						+{overflowCount} more
					</a>
				{/if}
			</div>
		{/if}
	</div>
</article>

<style>
	.film-card {
		display: grid;
		grid-template-rows: subgrid;
		grid-row: span 4;
		gap: 0;
	}

	.poster-link {
		display: block;
	}

	.title-area {
		display: block;
		padding-top: 0.5rem;
	}

	.film-title {
		font-size: var(--font-size-sm);
		font-weight: 600;
		letter-spacing: -0.02em;
		text-transform: uppercase;
		line-height: 1.3;
	}

	.meta-area {
		display: block;
	}

	.meta-text {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-top: 0.125rem;
	}

	.detail-text {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-top: 0.125rem;
	}

	.screenings-area {
		padding-top: 0.375rem;
		padding-bottom: 1.5rem;
	}

	.poster-container {
		border: 1px solid var(--color-border-subtle);
		transition: border-color var(--duration-fast) var(--ease-sharp);
	}

	.film-card:hover .poster-container {
		border-color: var(--color-border);
	}
</style>
