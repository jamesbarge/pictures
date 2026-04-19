<script lang="ts">
	import { formatTime, getPosterImageAttributes } from '$lib/utils';
	import { trackScreeningClick } from '$lib/analytics/posthog';

	interface Screening {
		id: string;
		datetime: string;
		cinemaName: string;
		cinemaSlug?: string;
		format?: string | null;
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
		maxScreenings = 3
	}: {
		film: Film;
		screenings: Screening[];
		maxScreenings?: number;
	} = $props();

	const upcoming = $derived.by(() =>
		screenings
			.filter((s) => new Date(s.datetime) > new Date())
			.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
	);

	const visible = $derived(upcoming.slice(0, maxScreenings));
	const overflow = $derived(Math.max(0, upcoming.length - maxScreenings));

	const titleFirst = $derived(film.title.charAt(0));
	const titleRest = $derived(film.title.slice(1));

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

	const posterImage = $derived(
		getPosterImageAttributes(film.posterUrl, {
			baseSize: 'w342',
			srcSetSizes: ['w185', 'w342', 'w500'],
			sizes: '(min-width: 1280px) 220px, (min-width: 1024px) 240px, 50vw'
		})
	);

	function normalisedFormat(fmt: string | null | undefined): string {
		if (!fmt || fmt === 'unknown' || fmt === 'dcp') return 'DCP';
		return fmt.toUpperCase().replace('_', ' ');
	}

	function handleScreeningClick(s: Screening) {
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
					loading="lazy"
					decoding="async"
				/>
			{:else}
				<div class="poster-fallback"><span>{film.title}</span></div>
			{/if}
		</div>
	</a>

	<a href="/film/{film.id}" class="title-link">
		<h3 class="title film-title">
			<span class="title-italic-cap">{titleFirst}</span><span>{titleRest}</span>
		</h3>
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
						<span class="screening-format">{normalisedFormat(s.format)}</span>
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

	.title-italic-cap {
		font-style: italic;
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
