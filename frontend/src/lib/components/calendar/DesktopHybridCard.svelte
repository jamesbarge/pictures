<script lang="ts">
	import {
		formatTime,
		getPosterImageAttributes,
		filmByline,
		cardFilmMetaParts,
		formatScreeningFormat
	} from '$lib/utils';
	import { trackScreeningClick } from '$lib/analytics/posthog';
	import type { CardFilm, CardScreening } from './card-shapes';

	let {
		film,
		screenings,
		maxScreenings = 3,
		priority = false
	}: {
		film: CardFilm;
		screenings: CardScreening[];
		maxScreenings?: number;
		/** Mark this card's poster as the LCP candidate (above-fold). */
		priority?: boolean;
	} = $props();

	// Parent (+page.svelte) already filters past screenings via buildFilmMap and
	// sorts ascending in dayGroups, so we can avoid re-filtering and re-sorting
	// per card — significant savings when hundreds of cards render.
	const visible = $derived(screenings.slice(0, maxScreenings));
	const overflow = $derived(Math.max(0, screenings.length - maxScreenings));

	const bylineText = $derived(filmByline(film));
	const metaParts = $derived(cardFilmMetaParts(film));

	const posterImage = $derived(
		getPosterImageAttributes(film.posterUrl, {
			baseSize: 'w342',
			srcSetSizes: ['w185', 'w342', 'w500'],
			sizes: '(min-width: 1280px) 220px, (min-width: 1024px) 240px, 50vw'
		})
	);

	function handleScreeningClick(s: CardScreening) {
		trackScreeningClick({
			filmId: String(film.id),
			filmTitle: film.title,
			filmYear: film.year,
			screeningId: s.id,
			screeningTime: s.datetime,
			cinemaName: s.cinemaName
		}, 'calendar');
	}
</script>

<article class="card film-card">
	<a href="/film/{film.id}" class="poster-link" aria-label={film.title}>
		<div class="poster">
			{#if film.posterUrl}
				<img
					src={posterImage?.src ?? film.posterUrl}
					srcset={posterImage?.srcset}
					sizes={posterImage?.sizes}
					alt=""
					width="342"
					height="513"
					loading={priority ? 'eager' : 'lazy'}
					fetchpriority={priority ? 'high' : 'auto'}
					decoding="async"
				/>
			{:else}
				<div class="poster-fallback"><span>{film.title}</span></div>
			{/if}
		</div>
	</a>

	<a href="/film/{film.id}" class="title-link">
		<h3 class="title film-title">{film.title}</h3>
	</a>

	{#if bylineText}
		<p class="byline">{bylineText}</p>
	{/if}

	{#if metaParts.length}
		<p class="meta">{metaParts.join(' · ')}</p>
	{/if}

	{#if visible.length > 0}
		<div class="screenings">
			{#each visible as s, i (s.id)}
				<a
					class="screening"
					href={s.bookingUrl ?? `/film/${film.id}`}
					target={s.bookingUrl ? '_blank' : undefined}
					rel={s.bookingUrl ? 'noopener noreferrer' : undefined}
					onclick={() => handleScreeningClick(s)}
				>
					<time class="screening-time" class:lead={i === 0} datetime={s.datetime}>{formatTime(s.datetime)}</time>
					<span class="screening-cinema">{s.cinemaName}</span>
					{#if s.format}
						<span class="screening-format">{formatScreeningFormat(s.format)}</span>
					{/if}
				</a>
			{/each}
			{#if overflow > 0}
				<a class="more" href="/film/{film.id}">
					+ <span class="more-count">{overflow}</span> more screening{overflow === 1 ? '' : 's'}
				</a>
			{/if}
		</div>
	{/if}
</article>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 0;
		/* Skip layout/paint for offscreen cards. `contain-intrinsic-size`
		   reserves enough vertical space (poster aspect + meta + screenings)
		   so scroll anchoring stays stable and there's no CLS on first reveal.
		   Real cards are ~550–700px on a 4-col grid (poster ~450px tall at
		   2:3 in a ~300px column, plus title/byline/meta/3 screenings); under-
		   reserving causes visible jumps as offscreen cards reveal. `auto`
		   lets the browser refine after first measurement. */
		content-visibility: auto;
		contain-intrinsic-size: auto 640px;
	}

	.poster-link {
		display: block;
	}

	.poster {
		width: 100%;
		aspect-ratio: 2 / 3;
		overflow: hidden;
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border);
		margin-bottom: 10px;
	}

	.poster img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.poster-fallback {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.poster-fallback span {
		font-family: var(--font-serif);
		font-size: 18px;
		font-weight: 400;
		text-align: center;
		color: var(--color-text-tertiary);
		letter-spacing: -0.02em;
	}

	.title-link { display: block; }

	.title {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 20px;
		font-weight: 400;
		letter-spacing: -0.02em;
		line-height: 0.98;
		color: var(--color-text);
		font-variation-settings: '"SOFT" 100', '"opsz" 48';
	}

	.byline {
		margin: 3px 0 0;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 12.5px;
		color: var(--color-text-secondary);
		font-weight: 400;
		line-height: 1.2;
	}

	.meta {
		margin: 3px 0 8px;
		font-family: var(--font-mono-plex);
		font-size: 9px;
		color: var(--color-text-tertiary);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.screenings {
		padding-top: 8px;
		border-top: 1px solid var(--color-border-subtle);
	}

	.screening {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 2px 0;
		color: inherit;
	}

	.screening:hover .screening-cinema { color: var(--color-text); }

	.screening-time {
		font-family: var(--font-mono-plex);
		font-size: 11.5px;
		color: var(--color-text-secondary);
		font-weight: 500;
		min-width: 36px;
		font-variant-numeric: tabular-nums;
	}

	.screening-time.lead {
		color: var(--color-accent);
	}

	.screening-cinema {
		flex: 1;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 11.5px;
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.screening-format {
		font-family: var(--font-mono-plex);
		font-size: 9px;
		color: var(--color-text-tertiary);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.more {
		display: block;
		padding-top: 4px;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 11.5px;
		color: var(--color-text-tertiary);
	}

	.more:hover { color: var(--color-text); }

	.more-count {
		color: var(--color-text-secondary);
	}
</style>
