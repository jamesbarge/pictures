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
		priority?: boolean;
	} = $props();

	const upcoming = $derived.by(() =>
		screenings
			.filter((s) => new Date(s.datetime) > new Date())
			.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
	);

	const visible = $derived(upcoming.slice(0, maxScreenings));
	const overflow = $derived(Math.max(0, upcoming.length - maxScreenings));

	const distinctFormats = $derived.by(() => {
		const seen = new Set<string>();
		for (const s of upcoming) {
			if (!s.format || s.format === 'unknown' || s.format === 'dcp') continue;
			seen.add(s.format.toUpperCase().replace('_', ' '));
		}
		return [...seen].slice(0, 2);
	});

	const directorLines = $derived.by(() => {
		if (!film.director) return [] as string[];
		return film.director.toUpperCase().split(/\s+/).slice(0, 4);
	});

	const posterImage = $derived(
		getPosterImageAttributes(film.posterUrl, {
			baseSize: 'w342',
			srcSetSizes: ['w185', 'w342', 'w500'],
			sizes: '(min-width: 1280px) 264px, (min-width: 1024px) 22vw, 50vw'
		})
	);

	function handleClick(s: Screening) {
		trackScreeningClick(
			{
				filmId: String(film.id),
				filmTitle: film.title,
				filmYear: film.year,
				screeningId: s.id,
				screeningTime: s.datetime,
				cinemaName: s.cinemaName
			},
			'calendar'
		);
	}
</script>

<article class="card" aria-label={film.title}>
	<a href="/film/{film.id}" class="poster-row">
		<div class="poster">
			{#if film.posterUrl}
				<img
					src={posterImage?.src ?? film.posterUrl}
					srcset={posterImage?.srcset}
					sizes={posterImage?.sizes}
					alt=""
					loading={priority ? 'eager' : 'lazy'}
					fetchpriority={priority ? 'high' : 'auto'}
					decoding="async"
				/>
			{:else}
				<div class="poster-fallback"><span>{film.title}</span></div>
			{/if}
		</div>
		<div class="rail">
			{#if film.year}
				<div class="rail-cell rail-year">{film.year}</div>
			{/if}
			{#if directorLines.length}
				<div class="rail-cell rail-director">
					{#each directorLines as line (line)}<span>{line}</span>{/each}
				</div>
			{/if}
			{#each distinctFormats as fmt (fmt)}
				<div class="rail-cell rail-format">{fmt}</div>
			{/each}
		</div>
	</a>

	<a href="/film/{film.id}" class="title-row">
		<h3 class="title">{film.title.toUpperCase()}</h3>
	</a>

	{#if visible.length}
		<div class="screenings-row" class:filled={visible.length === maxScreenings}>
			<div class="screening-list">
				{#each visible as s (s.id)}
					<a
						class="screening-line"
						href={s.bookingUrl ?? `/film/${film.id}`}
						target={s.bookingUrl ? '_blank' : undefined}
						rel={s.bookingUrl ? 'noopener noreferrer' : undefined}
						onclick={() => handleClick(s)}
					>
						<time class="screening-time" datetime={s.datetime}>{formatTime(s.datetime)}</time>
						<span class="screening-cinema">{s.cinemaName.toUpperCase()}</span>
					</a>
				{/each}
			</div>
			{#if overflow > 0}
				<a class="more-rail" href="/film/{film.id}" aria-label="{overflow} more screenings of {film.title}">
					<span class="more-count">{overflow}</span>
					<span class="more-label">MORE</span>
				</a>
			{/if}
		</div>
	{/if}
</article>

<style>
	.card {
		display: flex;
		flex-direction: column;
		width: 328px;
		max-width: 100%;
		font-family: var(--font-sans);
		color: var(--color-text);
		background: transparent;
	}

	@media (max-width: 399px) {
		.card { width: 100%; }
		.poster {
			width: auto;
			flex: 1 1 auto;
			height: auto;
			aspect-ratio: 264 / 396;
		}
	}

	/* Poster + format rail */
	.poster-row {
		display: flex;
		align-items: stretch;
		border: 1px solid var(--color-border);
	}

	.poster {
		width: 264px;
		height: 396px;
		flex-shrink: 0;
		border-right: 1px solid var(--color-border);
		overflow: hidden;
		background: transparent;
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
		padding: 1rem;
	}

	.poster-fallback span {
		font-family: var(--font-sans);
		font-size: 14px;
		font-weight: 700;
		text-align: center;
		color: var(--color-text-tertiary);
		text-transform: uppercase;
	}

	.rail {
		display: flex;
		flex-direction: column;
		width: 64px;
		flex-shrink: 0;
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	.poster-row:hover .rail {
		background: var(--color-cream);
	}

	.rail-cell {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		text-align: left;
		padding: 4px 6px;
		border-bottom: 1px solid var(--color-border);
		width: 100%;
	}
	.rail-cell:last-child { border-bottom: none; }

	.rail-year {
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.01em;
	}

	.rail-director {
		flex-direction: column;
		align-items: flex-start;
		font-weight: 700;
		font-size: 10px;
		line-height: 1.1;
		letter-spacing: 0;
		max-width: 100%;
		overflow: hidden;
	}

	.rail-director span {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: block;
	}

	.rail-format {
		font-weight: 300;
		font-size: 14px;
		letter-spacing: 0;
	}

	/* Title */
	.title-row {
		display: flex;
		align-items: flex-start;
		justify-content: flex-start;
		min-height: 72px;
		padding: 6px 8px;
		border: 1px solid var(--color-border);
		border-top: none;
		text-align: left;
		text-decoration: none;
		color: var(--color-text);
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	.title-row:hover {
		background: var(--color-cream);
	}

	.title {
		margin: 0;
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: 22px;
		line-height: 1.05;
		letter-spacing: -0.02em;
		color: var(--color-text);
		text-transform: uppercase;
		text-align: left;
		font-variation-settings: normal;
	}

	/* Screenings row */
	.screenings-row {
		display: flex;
		align-items: stretch;
		min-height: 30px;
		border-left: 1px solid var(--color-border);
		border-right: 1px solid var(--color-border);
		border-bottom: 1px solid var(--color-border);
	}

	/* When all 3 screening slots are filled the bottom edge is the last
	   inter-row stroke, so the card's own bottom border is redundant — UNLESS
	   the card sits in the last visible row (no row below to close it). The
	   .last-row class is applied by the markLastRow Svelte action in +page. */
	.screenings-row.filled {
		border-bottom: none;
	}

	:global(.card.last-row) .screenings-row.filled {
		border-bottom: 1px solid var(--color-border);
	}

	.screening-list {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.screening-line {
		display: flex;
		align-items: center;
		min-height: 30px;
		border-bottom: 1px solid var(--color-border);
		color: var(--color-text);
		text-decoration: none;
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	.screening-line:last-child { border-bottom: none; }
	.screening-line:hover { background: var(--color-cream); }

	.screening-time {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		width: 64px;
		flex-shrink: 0;
		padding: 4px 12px;
		font-weight: 500;
		font-size: 16px;
		letter-spacing: -0.01em;
		font-variant-numeric: tabular-nums;
		border-right: 1px solid var(--color-border);
		min-height: 30px;
		box-sizing: border-box;
	}

	.screening-cinema {
		flex: 1;
		display: block;
		padding: 4px 8px;
		line-height: 22px;
		font-weight: 500;
		font-size: 14px;
		letter-spacing: -0.01em;
		text-align: left;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.more-rail {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-width: 25px;
		padding: 8px 4px;
		background: var(--color-text);
		color: var(--color-cream);
		border-left: 1px solid var(--color-border);
		text-decoration: none;
		font-family: var(--font-sans);
		transition: opacity var(--duration-fast) var(--ease-sharp);
	}

	.more-rail:hover { opacity: 0.85; }

	.more-count {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.01em;
	}

	.more-label {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-weight: 400;
		font-size: 14px;
		letter-spacing: 0.04em;
	}

	/* Mobile: stack tighter — poster + title go full width, rail + screenings flow under */
	@media (max-width: 767px) {
		.card {
			width: 100%;
		}

		.poster {
			width: calc(100% - 64px);
			height: auto;
			aspect-ratio: 264 / 396;
		}

		.title {
			font-size: 20px;
		}

		.title-row {
			min-height: 64px;
		}
	}
</style>
