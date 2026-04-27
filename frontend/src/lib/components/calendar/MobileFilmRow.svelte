<script lang="ts">
	import { formatTime, getPosterImageAttributes } from '$lib/utils';
	import { trackScreeningClick } from '$lib/analytics/posthog';

	interface Screening {
		id: string;
		datetime: string;
		cinemaName: string;
		bookingUrl?: string;
	}

	interface Film {
		id: string | number;
		title: string;
		year?: number | null;
		director?: string | null;
		runtime?: number | null;
		country?: string | null;
		certification?: string | null;
		posterUrl?: string | null;
	}

	let {
		film,
		screenings,
		maxScreenings = 3,
		priority = false
	}: {
		film: Film;
		screenings: Screening[];
		maxScreenings?: number;
		/** Mark this row's poster as the LCP candidate (first row above fold). */
		priority?: boolean;
	} = $props();

	const upcoming = $derived.by(() =>
		screenings
			.filter((s) => new Date(s.datetime) > new Date())
			.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
	);

	const visible = $derived(upcoming.slice(0, maxScreenings));
	const overflow = $derived(Math.max(0, upcoming.length - maxScreenings));

	const posterImage = $derived(
		getPosterImageAttributes(film.posterUrl, {
			baseSize: 'w185',
			srcSetSizes: ['w92', 'w185', 'w342'],
			sizes: '116px'
		})
	);

	const bylineText = $derived.by(() => {
		const parts: string[] = [];
		if (film.director) parts.push(film.director);
		if (film.year) parts.push(String(film.year));
		return parts.join(', ');
	});

	const metaParts = $derived.by(() => {
		const parts: string[] = [];
		if (film.runtime) parts.push(`${film.runtime}m`);
		if (film.country) parts.push(film.country);
		if (film.certification) parts.push(film.certification);
		return parts;
	});

	function handleClick(s: Screening) {
		trackScreeningClick({
			filmId: String(film.id),
			filmTitle: film.title,
			filmYear: film.year,
			screeningId: s.id,
			screeningTime: s.datetime,
			cinemaName: s.cinemaName
		}, 'calendar');
	}

	const titleFirst = $derived(film.title.charAt(0));
	const titleRest = $derived(film.title.slice(1));
</script>

<article class="row film-card">
	<div class="text-col">
		<a href="/film/{film.id}" class="title-link">
			<h3 class="title film-title">
				<span class="title-italic-cap">{titleFirst}</span><span>{titleRest}</span>
			</h3>
		</a>
		{#if bylineText}
			<p class="byline">a film by {bylineText}</p>
		{/if}
		{#if metaParts.length}
			<p class="meta">{metaParts.join(' · ')}</p>
		{/if}

		{#if visible.length}
			<div class="screenings">
				{#each visible as s (s.id)}
					<a
						class="screening"
						href={s.bookingUrl ?? `/film/${film.id}`}
						target={s.bookingUrl ? '_blank' : undefined}
						rel={s.bookingUrl ? 'noopener noreferrer' : undefined}
						onclick={() => handleClick(s)}
					>
						<time class="screening-time" datetime={s.datetime}>{formatTime(s.datetime)}</time>
						<span class="screening-cinema">{s.cinemaName}</span>
					</a>
				{/each}
				{#if overflow > 0}
					<a class="more" href="/film/{film.id}">
						+ <span class="more-count">{overflow}</span> more
					</a>
				{/if}
			</div>
		{/if}
	</div>

	<a href="/film/{film.id}" class="poster-link" aria-label={film.title}>
		<div class="poster">
			{#if film.posterUrl}
				<img
					src={posterImage?.src ?? film.posterUrl}
					srcset={posterImage?.srcset}
					sizes={posterImage?.sizes}
					alt=""
					width="116"
					height="174"
					loading={priority ? 'eager' : 'lazy'}
					fetchpriority={priority ? 'high' : 'auto'}
					decoding="async"
				/>
			{:else}
				<div class="poster-fallback"><span>{film.title}</span></div>
			{/if}
		</div>
	</a>
</article>

<style>
	.row {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		padding: 18px 0 20px;
		border-bottom: 1px solid var(--color-border-subtle);
		/* Skip layout/paint for offscreen rows. The browser renders only when
		   the row scrolls within ~viewport. `contain-intrinsic-size` reserves
		   space so scroll position and Cmd-F still work, with no CLS. */
		content-visibility: auto;
		contain-intrinsic-size: auto 220px;
	}

	.text-col {
		flex: 1;
		min-width: 0;
	}

	.title-link { display: block; }

	.title {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 32px;
		font-weight: 300;
		letter-spacing: -0.025em;
		line-height: 0.92;
		color: var(--color-text);
		font-variation-settings: '"SOFT" 100', '"opsz" 144';
	}

	.title-italic-cap {
		font-weight: 400;
		font-style: italic;
	}

	.byline {
		margin: 8px 0 2px;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 14px;
		color: var(--color-text-secondary);
		font-weight: 400;
		line-height: 1.2;
	}

	.meta {
		margin: 8px 0 10px;
		font-family: var(--font-mono-plex);
		font-size: 9px;
		color: var(--color-text-tertiary);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.screenings {
		display: flex;
		flex-direction: column;
	}

	.screening {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 3px 0;
		color: inherit;
	}

	.screening-time {
		font-family: var(--font-mono-plex);
		font-size: 12px;
		font-weight: 400;
		min-width: 44px;
		color: var(--color-accent);
		font-variant-numeric: tabular-nums;
	}

	.screening-cinema {
		flex: 1;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 13px;
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.more {
		display: inline-block;
		padding-top: 4px;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 12px;
		color: var(--color-text-tertiary);
	}

	.more-count { color: var(--color-text-secondary); }

	.poster-link { flex-shrink: 0; }

	.poster {
		width: 116px;
		aspect-ratio: 2 / 3;
		border: 1px solid var(--color-border);
		overflow: hidden;
		background: var(--color-bg-subtle);
	}

	.poster img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.poster-fallback {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
	}

	.poster-fallback span {
		font-family: var(--font-serif);
		font-size: 12px;
		text-align: center;
		color: var(--color-text-tertiary);
	}
</style>
