<script lang="ts">
	import LetterboxdRatingReveal from '$lib/components/film/LetterboxdRatingReveal.svelte';
	import FilmSidebar from '$lib/components/film/FilmSidebar.svelte';
	import CalendarPopover from '$lib/components/filters/CalendarPopover.svelte';
	import JsonLd from '$lib/seo/JsonLd.svelte';
	import { movieSchema, breadcrumbSchema } from '$lib/seo/json-ld';
	import { filmStatuses } from '$lib/stores/film-status.svelte';
	import { today as todayStore } from '$lib/stores/today.svelte';
	import {
		formatTime,
		toLondonDateStr,
		groupBy,
		getPosterImageAttributes,
		filmByline,
		formatScreeningFormat
	} from '$lib/utils';
	import { trackFilmView, trackBookingClick, trackFilmStatusChange, trackCalendarExport } from '$lib/analytics/posthog';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import type { FilmStatus } from '$lib/types';

	// Lazy-load the below-the-fold "If you like this" rail after first paint.
	// The component is image-heavy and never needed for LCP. Awaiting on a
	// browser-only promise keeps it out of the SSR/hydration critical path.
	let SimilarRail = $state<typeof import('$lib/components/film/FilmSimilarRail.svelte').default | null>(null);

	let { data } = $props();

	const film = $derived(data.film);
	const screenings = $derived(data.screenings);
	const similar = $derived(data.similar ?? []);
	const currentStatus = $derived(filmStatuses.getStatus(film.id));

	onMount(() => {
		trackFilmView({
			filmId: film.id,
			filmTitle: film.title,
			filmYear: film.year,
			genres: film.genres,
			directors: film.directors
		}, 'film_detail');

		// Defer the similar-rail chunk until the browser is idle so it doesn't
		// compete with the hero/showings paint.
		if (browser) {
			const load = () =>
				import('$lib/components/film/FilmSimilarRail.svelte').then((m) => {
					SimilarRail = m.default;
				});
			if ('requestIdleCallback' in window) {
				requestIdleCallback(load, { timeout: 2000 });
			} else {
				setTimeout(load, 1500);
			}
		}
	});

	function toggleStatus(status: FilmStatus) {
		const previousStatus = currentStatus;
		filmStatuses.toggleStatus(film.id, status);
		trackFilmStatusChange(
			{ filmId: film.id, filmTitle: film.title, filmYear: film.year, genres: film.genres, directors: film.directors },
			previousStatus,
			previousStatus === status ? null : status
		);
	}

	const futureScreenings = $derived.by(() => {
		// Decorate-sort-undecorate to avoid `new Date()` per element per
		// comparator call — film pages routinely show 50+ screenings.
		const now = Date.now();
		const decorated: Array<{ s: typeof screenings[number]; ms: number }> = [];
		for (const s of screenings) {
			const ms = new Date(s.datetime).getTime();
			if (ms > now) decorated.push({ s, ms });
		}
		decorated.sort((a, b) => a.ms - b.ms);
		return decorated.map((d) => d.s);
	});

	const nextScreening = $derived(futureScreenings[0]);

	const nextScreeningLabel = $derived.by(() => {
		if (!nextScreening) return null;
		const today = todayStore.value;
		const nextDate = toLondonDateStr(nextScreening.datetime);
		if (nextDate === today) return 'today';
		// Resolve "tomorrow" through the same London-civil-date helper used for
		// `today` and `nextDate` so all three operands speak the same date
		// language. Behaviour-equivalent here (UTC noon and London noon are
		// always the same calendar day), but the previous shape mixed UTC
		// slices with London civils — the same code-smell that masked #445.
		const tomorrowD = new Date(today + 'T12:00:00Z');
		tomorrowD.setUTCDate(tomorrowD.getUTCDate() + 1);
		if (nextDate === toLondonDateStr(tomorrowD)) return 'tomorrow';
		return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Europe/London' })
			.format(new Date(nextScreening.datetime))
			.toLowerCase();
	});

	// Day groups for the day strip
	const groupedByDate = $derived.by(() => {
		const grouped = groupBy(futureScreenings, (s) => toLondonDateStr(s.datetime));
		// `futureScreenings` is already sorted ascending by epoch-ms and
		// `toLondonDateStr` is monotonic in ms, so `groupBy` inserts day keys in
		// chronological order — which JS preserves for string keys. The previous
		// `.sort(localeCompare)` was therefore a no-op over YYYY-MM-DD keys.
		return Object.entries(grouped);
	});

	let selectedDay = $state<string | null>(null);
	let datePickerOpen = $state(false);
	let showAll = $state(false);

	const activeDay = $derived(
		showAll ? null : (selectedDay ?? (groupedByDate[0]?.[0] ?? null))
	);

	// If the user picked a date outside the strip, look it up in the grouped
	// screenings; if there are none, render an empty state with the date label.
	const activeDayScreenings = $derived(
		activeDay ? (groupedByDate.find(([d]) => d === activeDay)?.[1] ?? []) : futureScreenings
	);

	function pickDate(iso: string) {
		selectedDay = iso;
		showAll = false;
		datePickerOpen = false;
	}

	function pickStripDay(date: string) {
		selectedDay = date;
		showAll = false;
	}

	function fullDayLabel(date: string) {
		if (date === todayStr) return 'Today';
		return new Intl.DateTimeFormat('en-GB', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			timeZone: 'Europe/London'
		}).format(new Date(date + 'T12:00:00Z'));
	}

	// Group the active day's screenings by cinema
	const screeningsByCinema = $derived.by(() => {
		const byCinema = groupBy(activeDayScreenings, (s) => s.cinema?.name ?? 'Unknown');
		return Object.entries(byCinema);
	});

	const posterImage = $derived(
		getPosterImageAttributes(film.posterUrl, {
			baseSize: 'w500',
			srcSetSizes: ['w342', 'w500', 'w780'],
			sizes: '(min-width: 1024px) 320px, (min-width: 768px) 280px, 100vw'
		})
	);

	const bylineText = $derived(filmByline(film));

	const metaParts = $derived.by(() => {
		const parts: string[] = [];
		if (film.runtime) parts.push(`${film.runtime} min`);
		if (film.countries?.length) parts.push(film.countries[0]);
		if (film.certification) parts.push(film.certification);
		if (film.genres?.length) parts.push(film.genres.slice(0, 2).map((g) => g.charAt(0).toUpperCase() + g.slice(1)).join(' / '));
		return parts;
	});

	// Pulled from the shared today store so the "Today" pill in the day strip
	// advances at midnight without requiring a route re-load.
	const todayStr = $derived(todayStore.value);
	function dayLabel(date: string) {
		if (date === todayStr) return 'Today';
		return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/London' }).format(new Date(date + 'T12:00:00Z'));
	}

</script>

<svelte:head>
	<title>{film.title} — pictures · london</title>
	<meta name="description" content="{film.title} ({film.year}) — {futureScreenings.length} screenings in London" />
	<meta property="og:title" content="{film.title} — pictures · london" />
	<meta property="og:description" content="{film.title} ({film.year}){film.directors?.length ? ` directed by ${film.directors[0]}` : ''} — {futureScreenings.length} screenings in London" />
	<meta property="og:type" content="video.movie" />
	{#if film.posterUrl}<meta property="og:image" content={film.posterUrl} />{/if}
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<JsonLd data={movieSchema(film)} />
<JsonLd data={breadcrumbSchema([{ name: 'Home', url: '/' }, { name: film.title, url: `/film/${film.id}` }])} />

<!-- Breadcrumb -->
<div class="breadcrumb">
	<a href="/">Programme</a>
	<span class="sep">›</span>
	<span class="current">{film.title}</span>
</div>

<!-- Hero -->
<section class="hero">
	<div class="poster-col">
		{#if film.posterUrl}
			<div class="poster-frame">
				<img
					src={posterImage?.src ?? film.posterUrl}
					srcset={posterImage?.srcset}
					sizes={posterImage?.sizes}
					alt="{film.title} poster"
					width="320"
					height="480"
					fetchpriority="high"
					decoding="async"
				/>
			</div>
		{/if}
	</div>

	<div class="info-col">
		<div class="eyebrow">
			{#if film.isRepertory}Repertory{:else}Now showing{/if}
			{#if nextScreening} · next screening {nextScreeningLabel}{/if}
		</div>

		<h1 class="film-title">{film.title}</h1>

		{#if film.originalTitle && film.originalTitle !== film.title}
			<p class="original-title">{film.originalTitle}</p>
		{/if}

		{#if bylineText}
			<p class="byline">a film by {bylineText}</p>
		{/if}

		{#if metaParts.length}
			<p class="meta">{metaParts.join(' · ')}</p>
		{/if}

		{#if film.synopsis}
			<p class="synopsis">{film.synopsis}</p>
		{/if}

		<div class="cta-row">
			{#if nextScreening}
				<a
					class="cta primary"
					href={nextScreening.bookingUrl}
					target="_blank"
					rel="noopener noreferrer"
					onclick={() => trackBookingClick({
						filmId: film.id,
						filmTitle: film.title,
						screeningId: nextScreening.id,
						screeningTime: nextScreening.datetime,
						cinemaId: nextScreening.cinema?.id,
						cinemaName: nextScreening.cinema?.name,
						format: nextScreening.format,
						bookingUrl: nextScreening.bookingUrl
					}, 'film_detail')}
				>
					Book next showing <span class="cta-detail">{formatTime(nextScreening.datetime)}, {nextScreening.cinema?.shortName ?? nextScreening.cinema?.name}</span>
				</a>
			{/if}
			{#if currentStatus === 'want_to_see'}
				<button
					type="button"
					class="cta secondary"
					onclick={() => toggleStatus('want_to_see')}
					aria-pressed={true}
				>
					♥ Remove from saved
				</button>
			{:else}
				<button
					type="button"
					class="cta secondary"
					onclick={() => toggleStatus('want_to_see')}
					aria-pressed={false}
				>
					♡ Save
				</button>
			{/if}
			{#if film.trailerUrl}
				<a class="cta secondary" href={film.trailerUrl} target="_blank" rel="noopener noreferrer">Trailer</a>
			{/if}
		</div>

		{#if film.letterboxdRating && film.letterboxdRating > 0}
			<div class="letterboxd-rating">
				<LetterboxdRatingReveal rating={film.letterboxdRating} filmId={film.id} />
			</div>
		{/if}
	</div>
</section>

<!-- Showings + Sidebar grid -->
<div class="body-grid">
	<section class="showings" aria-labelledby="showings-heading">
		<div class="showings-head">
			<h2 id="showings-heading" class="showings-title">Showings</h2>

			<div class="day-strip">
				{#if groupedByDate.length > 1}
					{#each groupedByDate.slice(0, 7) as [date] (date)}
						<button
							type="button"
							class="strip-btn"
							class:active={activeDay === date}
							onclick={() => pickStripDay(date)}
						>
							{dayLabel(date)}
						</button>
					{/each}
					<button
						type="button"
						class="strip-btn"
						class:active={showAll}
						onclick={() => (showAll = !showAll)}
					>
						Show all
					</button>
				{/if}

				<div class="picker-wrap">
					<button
						type="button"
						class="pick-date-btn"
						onclick={() => (datePickerOpen = !datePickerOpen)}
						aria-expanded={datePickerOpen}
						aria-haspopup="dialog"
					>
						<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
							<rect x="1.5" y="3" width="13" height="11" stroke="currentColor" stroke-width="1.1" fill="none"/>
							<line x1="1.5" y1="6.5" x2="14.5" y2="6.5" stroke="currentColor" stroke-width="1.1"/>
							<line x1="5" y1="1.5" x2="5" y2="4.5" stroke="currentColor" stroke-width="1.1"/>
							<line x1="11" y1="1.5" x2="11" y2="4.5" stroke="currentColor" stroke-width="1.1"/>
						</svg>
						Pick date
						<span class="chevron">▾</span>
					</button>
					{#if datePickerOpen}
						<div class="popover" role="dialog" aria-label="Pick a date">
							<CalendarPopover
								selected={activeDay ?? todayStr}
								today={todayStr}
								onSelect={(iso) => pickDate(iso)}
								onClose={() => (datePickerOpen = false)}
							/>
						</div>
					{/if}
				</div>
			</div>
		</div>

		{#snippet screeningRow(s: typeof activeDayScreenings[number])}
			{@const cinemaName = s.cinema?.name ?? 'Unknown'}
			<a
				class="screening-row screening-link"
				href={s.bookingUrl}
				target="_blank"
				rel="noopener noreferrer"
				aria-label="Book {formatTime(s.datetime)} at {cinemaName}"
				onclick={() => trackBookingClick({
					filmId: film.id,
					filmTitle: film.title,
					screeningId: s.id,
					screeningTime: s.datetime,
					cinemaId: s.cinema?.id,
					cinemaName: s.cinema?.name,
					format: s.format,
					bookingUrl: s.bookingUrl
				}, 'film_detail')}
			>
				<div class="row-cinema">
					<span class="cinema-name">{cinemaName}</span>
					{#if s.cinema?.shortName && s.cinema.shortName !== cinemaName}
						<span class="cinema-sub">{s.cinema.shortName}</span>
					{/if}
				</div>
				<div class="row-slot">
					<time class="slot-time" datetime={s.datetime}>{formatTime(s.datetime)}</time>
					{#if s.format && s.format !== 'unknown'}
						<span class="slot-format">{formatScreeningFormat(s.format)}</span>
					{/if}
				</div>
			</a>
		{/snippet}

		{#if activeDayScreenings.length === 0}
			<p class="empty">
				{#if selectedDay}
					No screenings on {new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }).format(new Date(selectedDay + 'T12:00:00Z'))}.
					<button type="button" class="empty-clear" onclick={() => { selectedDay = null; showAll = true; }}>Show all upcoming</button>
				{:else}
					No upcoming screenings.
				{/if}
			</p>
		{:else}
			<div class="screening-row screening-head" aria-hidden="true">
				<div class="row-cinema head-cell">Where</div>
				<div class="row-slot head-cell">When</div>
			</div>
			{#if showAll}
				{#each groupedByDate as [date, dayScreenings] (date)}
					<div class="day-divider">{fullDayLabel(date)}</div>
					{#each dayScreenings as s (s.id)}
						{@render screeningRow(s)}
					{/each}
				{/each}
			{:else}
				{#each activeDayScreenings as s (s.id)}
					{@render screeningRow(s)}
				{/each}
			{/if}
		{/if}

		<!-- External links -->
		<div class="external-links">
			{#if film.letterboxdUrl}<a href={film.letterboxdUrl} target="_blank" rel="noopener noreferrer" class="ext">Letterboxd</a>{/if}
			{#if film.imdbId}<a href="https://www.imdb.com/title/{film.imdbId}" target="_blank" rel="noopener noreferrer" class="ext">IMDb</a>{/if}
			{#if film.tmdbId}<a href="https://www.themoviedb.org/movie/{film.tmdbId}" target="_blank" rel="noopener noreferrer" class="ext">TMDB</a>{/if}
		</div>
	</section>

	<FilmSidebar
		film={{
			id: film.id,
			title: film.title,
			year: film.year,
			genres: film.genres,
			directors: film.directors,
			cast: film.cast,
			countries: film.countries,
			languages: film.languages,
			tagline: film.tagline
		}}
		{currentStatus}
		onToggleStatus={toggleStatus}
	/>
</div>

{#if SimilarRail && similar.length >= 2}
	<SimilarRail {similar} />
{/if}

<style>
	/* ── Breadcrumb ── */
	.breadcrumb {
		max-width: 1340px;
		margin: 0 auto;
		padding: 16px 16px 0;
		font-family: var(--font-sans);
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-text);
	}

	@media (min-width: 768px) {
		.breadcrumb { padding: 20px 24px 0; }
	}

	.breadcrumb a { color: var(--color-text); text-decoration: none; }
	.breadcrumb a:hover { color: var(--color-text); text-decoration: underline; text-underline-offset: 3px; }
	.breadcrumb .sep { margin: 0 8px; color: var(--color-text-tertiary); }
	.breadcrumb .current { color: var(--color-text-tertiary); }

	/* ── Hero ── */
	.hero {
		max-width: 1340px;
		margin: 0 auto;
		padding: 20px 16px 28px;
		display: grid;
		grid-template-columns: 1fr;
		gap: 20px;
	}

	@media (min-width: 768px) {
		.hero {
			grid-template-columns: 264px 1fr;
			gap: 28px;
			padding: 28px 24px 36px;
		}
	}

	@media (min-width: 1024px) {
		.hero {
			grid-template-columns: 320px 1fr;
			gap: 36px;
		}
	}

	.poster-col { align-self: start; }

	.poster-frame {
		width: 100%;
		aspect-ratio: 2 / 3;
		border: 1px solid var(--color-border);
		overflow: hidden;
		background: var(--color-surface);
	}

	@media (max-width: 767px) {
		.poster-frame {
			max-width: 264px;
			margin: 0 auto;
		}
	}

	.poster-frame img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.info-col { min-width: 0; }

	.eyebrow {
		font-family: var(--font-sans);
		font-size: 10px;
		font-weight: 700;
		color: var(--color-text);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		margin-bottom: 14px;
	}

	.film-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 36px;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 0.95;
		color: var(--color-text);
		text-transform: uppercase;
	}

	@media (min-width: 768px) {
		.film-title { font-size: 52px; }
	}

	@media (min-width: 1024px) {
		.film-title { font-size: 64px; }
	}

	.original-title {
		font-family: var(--font-sans);
		font-size: 14px;
		font-weight: 400;
		color: var(--color-text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 10px 0 0;
	}

	.byline {
		margin: 16px 0 0;
		font-family: var(--font-sans);
		font-size: 14px;
		font-weight: 400;
		color: var(--color-text);
		line-height: 1.3;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	@media (min-width: 1024px) {
		.byline { font-size: 16px; margin-top: 20px; }
	}

	.meta {
		margin: 8px 0 0;
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 500;
		color: var(--color-text-tertiary);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.synopsis {
		margin: 20px 0 0;
		font-family: var(--font-sans);
		font-size: 16px;
		font-weight: 400;
		color: var(--color-text);
		line-height: 1.5;
		max-width: 600px;
	}

	@media (min-width: 1024px) {
		.synopsis { font-size: 17px; margin-top: 24px; }
	}

	.cta-row {
		margin-top: 24px;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.cta {
		padding: 10px 16px;
		min-height: 40px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-brutalist);
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		background: var(--color-surface);
		color: var(--color-text);
		text-decoration: none;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			transform var(--duration-fast) var(--ease-sharp),
			box-shadow var(--duration-fast) var(--ease-sharp);
	}

	.cta:hover { background: var(--color-cream); }

	.cta:active,
	.cta.pressed {
		transform: translate(4px, 4px);
		box-shadow: 0 0 0 0 transparent;
	}

	.cta.pressed {
		background: var(--color-text);
		color: var(--color-cream);
	}

	.cta.primary {
		background: var(--color-text);
		color: var(--color-cream);
	}

	.cta.primary:hover { background: var(--color-accent-hover); }

	.cta.secondary.active {
		background: var(--color-text);
		color: var(--color-cream);
	}

	.cta-detail {
		font-family: var(--font-sans);
		font-weight: 400;
		font-size: 12px;
		letter-spacing: 0.04em;
		opacity: 0.85;
	}

	.letterboxd-rating { margin-top: 20px; }

	/* ── Body grid ── */
	.body-grid {
		max-width: 1340px;
		margin: 0 auto;
		padding: 16px 16px 0;
		display: grid;
		grid-template-columns: 1fr;
		gap: 28px;
	}

	@media (min-width: 768px) {
		.body-grid { padding: 20px 24px 0; }
	}

	@media (min-width: 1024px) {
		.body-grid {
			grid-template-columns: 1fr 300px;
			gap: 36px;
		}
	}

	.showings {
		min-width: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
	}

	.screening-row:last-child .row-cinema {
		border-bottom-left-radius: var(--radius-lg);
	}
	.screening-row:last-child .row-slot {
		border-bottom-right-radius: var(--radius-lg);
	}

	.showings-head {
		background: #1f1f1f;
		color: #eae5c2;
		padding: 10px 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		border-top-left-radius: var(--radius-lg);
		border-top-right-radius: var(--radius-lg);
	}

	.showings-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: #eae5c2;
		text-transform: uppercase;
	}

	@media (min-width: 768px) {
		.showings-title { font-size: 20px; }
	}

	.day-strip {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
		align-items: center;
	}

	.strip-btn {
		min-width: 52px;
		padding: 5px 10px;
		text-align: center;
		background: transparent;
		color: #eae5c2;
		border: 1px solid #eae5c2;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp);
	}

	.strip-btn.active {
		background: #eae5c2;
		color: #1f1f1f;
		font-weight: 700;
	}

	.strip-btn:hover:not(.active) {
		background: rgba(234, 229, 194, 0.18);
	}

	.picker-wrap {
		position: relative;
		margin-left: 6px;
	}

	.pick-date-btn {
		padding: 5px 10px;
		background: transparent;
		color: #eae5c2;
		border: 1px solid #eae5c2;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.pick-date-btn:hover { background: rgba(234, 229, 194, 0.18); }

	.pick-date-btn .chevron {
		opacity: 0.75;
		margin-left: 2px;
	}

	.popover {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 20;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: var(--shadow-brutalist);
	}

	@media (max-width: 767px) {
		.popover { right: auto; left: 0; }
	}

	.empty {
		margin: 0;
		padding: 24px 16px;
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 500;
		color: var(--color-text-tertiary);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.empty-clear {
		display: inline-block;
		margin-left: 10px;
		background: transparent;
		border: none;
		padding: 0;
		font-family: var(--font-sans);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.empty-clear:hover { color: var(--color-text); }

	/* ── Screening rows ──
	   One row per screening. Cinema gutter 70%, time slot 30% — every row
	   is the same height so the section reads like a table. */
	.screening-row {
		display: flex;
		align-items: stretch;
		border-top: 1px solid var(--color-border);
		min-height: 48px;
	}

	.screening-head { min-height: 0; }

	.day-divider {
		padding: 8px 16px;
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
		border-top: 1px solid var(--color-border);
	}
	.day-divider:first-child { border-top: none; }
	.screening-head .head-cell {
		background: var(--color-bg);
		padding: 6px 16px;
		font-family: var(--font-sans);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-text-tertiary);
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: flex-start;
		text-align: left;
	}

	.screening-link {
		text-decoration: none;
		color: inherit;
	}
	.screening-link:hover .row-cinema,
	.screening-link:hover .row-slot {
		background: var(--color-cream);
	}

	.row-cinema {
		flex: 0 0 70%;
		background: var(--color-bg-subtle);
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 2px;
		min-width: 0;
		border-right: 1px solid var(--color-border);
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	.cinema-name {
		font-family: var(--font-sans);
		font-size: 14px;
		font-weight: 700;
		color: var(--color-text);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		line-height: 1.15;
	}

	.cinema-sub {
		font-family: var(--font-sans);
		font-size: 10px;
		font-weight: 500;
		color: var(--color-text-tertiary);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.row-slot {
		flex: 0 0 30%;
		padding: 12px 16px;
		display: inline-flex;
		align-items: center;
		gap: 12px;
		background: transparent;
		color: var(--color-text);
		text-decoration: none;
		font-family: var(--font-sans);
		min-width: 0;
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}


	.slot-time {
		font-family: var(--font-sans);
		font-size: 15px;
		color: var(--color-text);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.01em;
	}

	.slot-format {
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 500;
		color: var(--color-text-tertiary);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	/* Mobile: stack cinema on top, time below — 70/30 horizontal too tight <600 */
	@media (max-width: 599px) {
		.screening-row { flex-direction: column; }
		.row-cinema {
			flex: 0 0 auto;
			width: 100%;
			border-right: none;
			border-bottom: 1px solid var(--color-border);
			padding: 8px 14px;
		}
		.row-slot { flex: 0 0 auto; width: 100%; }
	}

	/* ── External links ── */
	.external-links {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
		padding: 16px;
		border-top: 1px solid var(--color-border);
	}

	.ext {
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 700;
		color: var(--color-text);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.ext:hover { color: var(--color-text-tertiary); }
</style>
