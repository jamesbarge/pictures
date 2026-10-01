<script lang="ts">
	import { formatTime, getPosterImageAttributes } from '$lib/utils';
	import { trackScreeningClick } from '$lib/analytics/posthog';
	import { formatLabel, type CardFilm, type CardScreening } from './card-shapes';

	let {
		film,
		screenings,
		now,
		maxScreenings = 3,
		priority = false,
		sleeper = false
	}: {
		film: CardFilm;
		screenings: CardScreening[];
		/**
		 * Epoch ms to judge "upcoming" against. Required, and deliberately not
		 * defaulted to `Date.now()`: this card is rendered from ISR-cached HTML,
		 * so a live clock here would make the first client render disagree with
		 * the server's and shift the keyed blocks below. Callers pass
		 * `hydrationSafeClock().now`. See `$lib/hydration-clock`.
		 */
		now: number;
		maxScreenings?: number;
		priority?: boolean;
		/**
		 * THE SLEEPER marker — one acclaimed-but-under-seen repertory film per
		 * London day.
		 *
		 * A per-(day, film) render decision supplied by the parent, exactly like
		 * `priority`, and deliberately NOT a field on `CardFilm`: the same film
		 * is the sleeper on one day and not on another, and `CardFilm` is shared
		 * by three components.
		 *
		 * Must never be derived from a clock on this side — it comes from the
		 * server payload. See the note on `now` above.
		 */
		sleeper?: boolean;
	} = $props();

	const upcoming = $derived.by(() =>
		screenings
			.filter((s) => new Date(s.datetime).getTime() > now)
			.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
	);

	const visible = $derived(upcoming.slice(0, maxScreenings));
	const overflow = $derived(Math.max(0, upcoming.length - maxScreenings));

	const distinctFormats = $derived.by(() => {
		const seen = new Set<string>();
		for (const s of upcoming) {
			const label = formatLabel(s.format);
			if (label) seen.add(label);
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

	function handleClick(s: CardScreening) {
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

<!--
	The SLEEPER explanation lives on the <article>, not inside .rail. `.poster-row`
	is an <a> whose accessible name is computed from its subtree, so an sr-only
	string in the rail would append to the LINK name and read as
	"1975 KUBRICK THE SLEEPER HIGHLY RATED RARELY SEEN". Hoisting it here keeps
	link names clean and states it once, in the right place.
	No numeral in the wording: ratings are deliberately spoiler-gated product-wide
	(see LetterboxdRatingReveal.svelte) and the marker must not leak one.
-->
<article
	class="card"
	aria-label={sleeper ? `${film.title} — The Sleeper: highly rated, rarely seen` : film.title}
>
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
			{#if sleeper}
				<!-- A <div>, not an <a> like .more-rail: .rail already sits inside
				     <a class="poster-row"> and nested anchors are invalid HTML. -->
				<!--
					aria-hidden on the CELL, not just the text. `.rail` sits inside
					<a class="poster-row">, whose accessible name is computed from its
					subtree — and name-from-content can fall back to a `title` on an
					otherwise-empty element, which would append this sentence to the
					LINK's name. That is the exact leak the article-level aria-label
					exists to avoid. Hiding the cell keeps `title` as a pointer-only
					affordance; AT users get the explanation once, on the <article>.
				-->
				<div
					class="rail-cell rail-sleeper"
					aria-hidden="true"
					title="The Sleeper — highly rated, rarely seen. One pick per day."
				>
					<span class="rail-sleeper-text">THE SLEEPER</span>
				</div>
			{/if}
		</div>
	</a>

	<a href="/film/{film.id}" class="title-row">
		<h3 class="title">{film.title.toUpperCase()}</h3>
	</a>

	{#if visible.length}
		<div class="screenings-row">
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

	/* ── THE SLEEPER ──────────────────────────────────────────────────────────
	   Bottom-anchored inverted block filling the dead space below the
	   year/director/format cells. The rail is 396px tall (it stretches to the
	   poster) while those cells sum to at most ~130px, so `margin-top: auto`
	   consumes slack ONLY: card width and height are unchanged, and
	   `fitToFirstRow` in +page.svelte — which measures `:scope > .card` to align
	   the black day bar with the card row — is therefore undisturbed.

	   Colours are hardcoded hex, matching `.day-header` in +page.svelte, and
	   deliberately NOT tokenised the way `.more-rail` below is. Every inverting
	   token pair collapses somewhere:
	     - var(--color-text) on var(--color-cream) is cream-on-cream under
	       [data-theme="dark"], where both resolve to #eae5c2;
	     - the DimmerDial lerps --color-text toward cream but leaves
	       --color-cream fixed, ending at ~1.05:1 contrast;
	     - --color-screening-bg/-text invert together and so cross at t≈0.5.
	   `.more-rail` has this bug today; do not copy it. */
	.rail-sleeper {
		margin-top: auto;
		align-items: center;
		justify-content: center;
		padding: 10px 4px;
		background: #1f1f1f;
		color: #eae5c2;
		border-top: 1px solid var(--color-border);
		border-bottom: none;
	}

	.rail-sleeper-text {
		/* Reads bottom-to-top, the same construction as .more-count/.more-label
		   below — already proven on WebKit, which the mobile suite runs. */
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: 12px;
		line-height: 1;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	/* Dark theme sets a #1a1a1a page surface, against which a #1f1f1f block
	   reads as a hole rather than a mark. Flip the pair so it stays a block. */
	:global([data-theme='dark']) .rail-sleeper {
		background: #eae5c2;
		color: #1f1f1f;
	}

	/* Very narrow viewports: the poster (and so the rail) gets short enough
	   that 120px of vertical type crowds the cells above. Tighten, never clip. */
	@media (max-width: 359px) {
		.rail-sleeper {
			padding: 6px 4px;
		}
		.rail-sleeper-text {
			font-size: 10px;
			letter-spacing: 0.08em;
		}
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
