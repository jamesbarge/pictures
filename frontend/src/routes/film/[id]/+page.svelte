<script lang="ts">
	import LetterboxdRatingReveal from '$lib/components/film/LetterboxdRatingReveal.svelte';
	import CalendarPopover from '$lib/components/filters/CalendarPopover.svelte';
	import JsonLd from '$lib/seo/JsonLd.svelte';
	import { movieSchema, breadcrumbSchema } from '$lib/seo/json-ld';
	import { filmStatuses } from '$lib/stores/film-status.svelte';
	import { formatTime, formatScreeningDate, toLondonDateStr, groupBy, getPosterImageAttributes } from '$lib/utils';
	import { trackFilmView, trackBookingClick, trackFilmStatusChange, trackCalendarExport } from '$lib/analytics/posthog';
	import { onMount } from 'svelte';
	import type { FilmStatus } from '$lib/types';

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

	const futureScreenings = $derived(
		screenings
			.filter((s) => new Date(s.datetime) > new Date())
			.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
	);

	const nextScreening = $derived(futureScreenings[0]);

	const nextScreeningLabel = $derived.by(() => {
		if (!nextScreening) return null;
		const today = toLondonDateStr(new Date());
		const nextDate = toLondonDateStr(nextScreening.datetime);
		if (nextDate === today) return 'today';
		const tomorrowD = new Date(today + 'T12:00:00Z');
		tomorrowD.setUTCDate(tomorrowD.getUTCDate() + 1);
		if (nextDate === tomorrowD.toISOString().split('T')[0]) return 'tomorrow';
		return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Europe/London' })
			.format(new Date(nextScreening.datetime))
			.toLowerCase();
	});

	// Day groups for the day strip
	const groupedByDate = $derived.by(() => {
		const grouped = groupBy(futureScreenings, (s) => toLondonDateStr(s.datetime));
		return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
	});

	let selectedDay = $state<string | null>(null);
	let datePickerOpen = $state(false);

	const activeDay = $derived(selectedDay ?? (groupedByDate[0]?.[0] ?? null));

	// If the user picked a date outside the strip, look it up in the grouped
	// screenings; if there are none, render an empty state with the date label.
	const activeDayScreenings = $derived(
		activeDay ? (groupedByDate.find(([d]) => d === activeDay)?.[1] ?? []) : futureScreenings
	);

	function pickDate(iso: string) {
		selectedDay = iso;
		datePickerOpen = false;
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

	const bylineText = $derived.by(() => {
		const parts: string[] = [];
		if (film.directors?.length) parts.push(film.directors.join(', '));
		if (film.year) parts.push(String(film.year));
		return parts.join(', ');
	});

	const metaParts = $derived.by(() => {
		const parts: string[] = [];
		if (film.runtime) parts.push(`${film.runtime} min`);
		if (film.countries?.length) parts.push(film.countries[0]);
		if (film.certification) parts.push(film.certification);
		if (film.genres?.length) parts.push(film.genres.slice(0, 2).map((g) => g.charAt(0).toUpperCase() + g.slice(1)).join(' / '));
		return parts;
	});

	const titleFirst = $derived(film.title.charAt(0));
	const titleRest = $derived(film.title.slice(1));

	const todayStr = toLondonDateStr(new Date());
	function dayLabel(date: string) {
		if (date === todayStr) return 'Today';
		return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/London' }).format(new Date(date + 'T12:00:00Z'));
	}

	function normalisedFormat(fmt: string | null | undefined): string {
		if (!fmt || fmt === 'unknown' || fmt === 'dcp') return 'DCP';
		return fmt.toUpperCase().replace('_', ' ');
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

		<h1 class="film-title">
			<span class="italic-cap">{titleFirst}</span><span>{titleRest}</span>
		</h1>

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
			<button
				type="button"
				class="cta secondary"
				class:active={currentStatus === 'want_to_see'}
				onclick={() => toggleStatus('want_to_see')}
				aria-pressed={currentStatus === 'want_to_see'}
			>
				♡ Save
			</button>
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
			<h2 id="showings-heading" class="showings-title">
				<span class="italic-cap">S</span>howings
			</h2>

			<div class="day-strip">
				{#if groupedByDate.length > 1}
					{#each groupedByDate.slice(0, 7) as [date] (date)}
						<button
							type="button"
							class="strip-btn"
							class:active={activeDay === date}
							onclick={() => (selectedDay = date)}
						>
							{dayLabel(date)}
						</button>
					{/each}
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

		{#if activeDayScreenings.length === 0}
			<p class="empty">
				{#if selectedDay}
					No screenings on {new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }).format(new Date(selectedDay + 'T12:00:00Z'))}.
					<button type="button" class="empty-clear" onclick={() => (selectedDay = null)}>Show all upcoming</button>
				{:else}
					No upcoming screenings.
				{/if}
			</p>
		{:else}
			{#each screeningsByCinema as [cinemaName, slots] (cinemaName)}
				<div class="cinema-block">
					<header class="cinema-head">
						<div class="cinema-name-wrap">
							<span class="cinema-name">{cinemaName}</span>
							{#if slots[0]?.cinema?.shortName && slots[0].cinema.shortName !== cinemaName}
								<span class="cinema-sub">{slots[0].cinema.shortName}</span>
							{/if}
						</div>
					</header>
					<div class="slots">
						{#each slots as s (s.id)}
							<div class="slot-wrap">
								<a
									class="slot"
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
									<time class="slot-time" datetime={s.datetime}>{formatTime(s.datetime)}</time>
									{#if s.format && s.format !== 'unknown'}
										<span class="slot-format">{normalisedFormat(s.format)}</span>
									{/if}
								</a>
								<a
									href="/api/calendar?screening={s.id}"
									download
									class="ical-btn"
									aria-label="Add to calendar"
									onclick={(e) => {
										e.stopPropagation();
										trackCalendarExport({
											filmId: film.id,
											filmTitle: film.title,
											screeningId: s.id,
											cinemaName: s.cinema?.name
										});
									}}
								>
									<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
										<rect x="1.5" y="3" width="13" height="11" stroke="currentColor" stroke-width="1.1" fill="none"/>
										<line x1="1.5" y1="6.5" x2="14.5" y2="6.5" stroke="currentColor" stroke-width="1.1"/>
										<line x1="5" y1="1.5" x2="5" y2="4.5" stroke="currentColor" stroke-width="1.1"/>
										<line x1="11" y1="1.5" x2="11" y2="4.5" stroke="currentColor" stroke-width="1.1"/>
									</svg>
								</a>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		{/if}

		<!-- External links -->
		<div class="external-links">
			{#if film.letterboxdUrl}<a href={film.letterboxdUrl} target="_blank" rel="noopener noreferrer" class="ext">Letterboxd</a>{/if}
			{#if film.imdbId}<a href="https://www.imdb.com/title/{film.imdbId}" target="_blank" rel="noopener noreferrer" class="ext">IMDb</a>{/if}
			{#if film.tmdbId}<a href="https://www.themoviedb.org/movie/{film.tmdbId}" target="_blank" rel="noopener noreferrer" class="ext">TMDB</a>{/if}
		</div>
	</section>

	<aside class="sidebar">
		<section class="credits-section">
			<h3 class="credits-title">Credits</h3>

			{#if film.directors?.length}
				<div class="credit-row">
					<span class="credit-key">Director{film.directors.length > 1 ? 's' : ''}</span>
					<span class="credit-val">{film.directors.join(', ')}</span>
				</div>
			{/if}

			{#if film.cast?.length}
				<div class="credit-row">
					<span class="credit-key">Cast</span>
					<span class="credit-val">{film.cast.slice(0, 5).map((c) => c.name).join(', ')}</span>
				</div>
			{/if}

			{#if film.countries?.length}
				<div class="credit-row">
					<span class="credit-key">Country</span>
					<span class="credit-val">{film.countries.join(', ')}</span>
				</div>
			{/if}

			{#if film.languages?.length}
				<div class="credit-row">
					<span class="credit-key">Language</span>
					<span class="credit-val">{film.languages.join(', ')}</span>
				</div>
			{/if}
		</section>

		{#if film.tagline}
			<section class="tagline-section">
				<p class="tagline">{film.tagline}</p>
			</section>
		{/if}

		<section class="status-section">
			<h3 class="credits-title"><span class="italic-cap">S</span>tatus</h3>
			<div class="status-row">
				<button
					type="button"
					class="status-btn"
					class:active={currentStatus === 'want_to_see'}
					onclick={() => toggleStatus('want_to_see')}
					aria-pressed={currentStatus === 'want_to_see'}
				>
					Want to see
				</button>
				<button
					type="button"
					class="status-btn"
					class:active={currentStatus === 'not_interested'}
					onclick={() => toggleStatus('not_interested')}
					aria-pressed={currentStatus === 'not_interested'}
				>
					Not interested
				</button>
			</div>
		</section>
	</aside>
</div>

{#if similar.length >= 2}
	<section class="similar" aria-labelledby="similar-heading">
		<header class="similar-head">
			<h2 id="similar-heading" class="similar-title">
				<span class="italic-cap">I</span>f you like this
			</h2>
		</header>
		<div class="similar-rail">
			{#each similar as s (s.id)}
				<a href="/film/{s.id}" class="similar-card">
					<div class="similar-poster">
						{#if s.posterUrl}
							<img src={s.posterUrl} alt={s.title} loading="lazy" />
						{:else}
							<div class="similar-poster-fallback"><span>{s.title}</span></div>
						{/if}
					</div>
					<h3 class="similar-name">{s.title}</h3>
					{#if s.year}<p class="similar-year">{s.year}</p>{/if}
				</a>
			{/each}
		</div>
	</section>
{/if}

<style>
	.breadcrumb {
		max-width: 1400px;
		margin: 0 auto;
		padding: 14px 2rem;
		border-bottom: 1px solid var(--color-border-subtle);
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 13px;
		color: var(--color-text-tertiary);
	}

	.breadcrumb a { color: var(--color-text-tertiary); }
	.breadcrumb a:hover { color: var(--color-text); }
	.breadcrumb .sep { margin: 0 8px; }
	.breadcrumb .current {
		color: var(--color-text-secondary);
		font-style: normal;
		font-family: var(--font-serif);
	}

	.hero {
		max-width: 1400px;
		margin: 0 auto;
		padding: 28px 2rem 32px;
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	@media (min-width: 768px) {
		.hero {
			grid-template-columns: 280px 1fr;
			gap: 32px;
			padding: 40px 2rem 32px;
		}
	}

	@media (min-width: 1024px) {
		.hero {
			grid-template-columns: 320px 1fr;
			gap: 40px;
		}
	}

	.poster-col { align-self: start; }

	.poster-frame {
		width: 100%;
		aspect-ratio: 2 / 3;
		border: 1px solid var(--color-border);
		overflow: hidden;
		background: var(--color-bg-subtle);
	}

	@media (max-width: 767px) {
		.poster-frame {
			max-width: 280px;
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
		font-family: var(--font-mono-plex);
		font-size: 10px;
		color: var(--color-text-tertiary);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		margin-bottom: 12px;
	}

	.film-title {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 48px;
		font-weight: 300;
		letter-spacing: -0.035em;
		line-height: 0.9;
		color: var(--color-text);
		font-variation-settings: '"SOFT" 100', '"opsz" 144';
	}

	@media (min-width: 768px) {
		.film-title { font-size: 72px; }
	}

	@media (min-width: 1024px) {
		.film-title { font-size: 96px; }
	}

	.film-title .italic-cap { font-weight: 400; font-style: italic; }

	.original-title {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 16px;
		color: var(--color-text-tertiary);
		margin: 8px 0 0;
	}

	.byline {
		margin: 18px 0 0;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 18px;
		color: var(--color-text-secondary);
		font-weight: 400;
		line-height: 1.2;
	}

	@media (min-width: 1024px) {
		.byline { font-size: 24px; margin-top: 20px; }
	}

	.meta {
		margin: 10px 0 0;
		font-family: var(--font-mono-plex);
		font-size: 10px;
		color: var(--color-text-tertiary);
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	@media (min-width: 1024px) {
		.meta { font-size: 11px; }
	}

	.synopsis {
		margin: 20px 0 0;
		font-family: var(--font-serif);
		font-size: 16px;
		font-weight: 400;
		color: var(--color-text-secondary);
		line-height: 1.45;
		max-width: 560px;
		font-variation-settings: '"SOFT" 100', '"opsz" 24';
	}

	@media (min-width: 1024px) {
		.synopsis { font-size: 18px; margin-top: 24px; }
	}

	.cta-row {
		margin-top: 24px;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.cta {
		padding: 12px 18px;
		border: 1px solid var(--color-border);
		font-family: var(--font-serif);
		font-size: 14px;
		font-weight: 500;
		letter-spacing: -0.005em;
		cursor: pointer;
		font-variation-settings: '"SOFT" 100', '"opsz" 36';
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
		background: transparent;
		color: var(--color-text);
	}

	.cta.primary {
		background: var(--color-text);
		color: var(--color-bg);
	}

	.cta.primary:hover { background: var(--color-text-secondary); }

	.cta.secondary {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-weight: 400;
	}

	.cta.secondary:hover { background: var(--color-bg-subtle); }

	.cta.secondary.active {
		background: var(--color-text);
		color: var(--color-bg);
	}

	.cta-detail {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-weight: 400;
	}

	.letterboxd-rating { margin-top: 20px; }

	/* Body grid */
	.body-grid {
		max-width: 1400px;
		margin: 0 auto;
		padding: 32px 2rem 60px;
		display: grid;
		grid-template-columns: 1fr;
		gap: 32px;
	}

	@media (min-width: 1024px) {
		.body-grid {
			grid-template-columns: 1fr 280px;
			gap: 40px;
		}
	}

	.showings { min-width: 0; }

	.showings-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 16px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}

	.showings-title {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 28px;
		font-weight: 400;
		letter-spacing: -0.025em;
		color: var(--color-text);
		font-variation-settings: '"SOFT" 100', '"opsz" 96';
	}

	@media (min-width: 1024px) {
		.showings-title { font-size: 32px; }
	}

	.showings-title .italic-cap { font-style: italic; }

	.day-strip {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}

	.strip-btn {
		min-width: 52px;
		padding: 6px 8px;
		text-align: center;
		background: transparent;
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		cursor: pointer;
		font-family: var(--font-serif);
		font-size: 12px;
		font-weight: 400;
		letter-spacing: -0.005em;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp);
	}

	.strip-btn.active {
		background: var(--color-text);
		color: var(--color-bg);
		font-weight: 500;
	}

	.strip-btn:hover:not(.active) {
		background: var(--color-bg-subtle);
		color: var(--color-text);
	}

	.picker-wrap {
		position: relative;
		margin-left: 6px;
	}

	.pick-date-btn {
		padding: 6px 10px;
		background: var(--color-bg);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		cursor: pointer;
		font-family: var(--font-serif);
		font-size: 12px;
		font-weight: 500;
		letter-spacing: -0.005em;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.pick-date-btn .chevron {
		color: var(--color-text-tertiary);
		margin-left: 2px;
	}

	.popover {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 20;
	}

	@media (max-width: 767px) {
		.popover {
			right: auto;
			left: 0;
		}
	}

	.empty-clear {
		display: inline-block;
		margin-left: 8px;
		background: transparent;
		border: none;
		padding: 0;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 14px;
		color: var(--color-text-secondary);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.empty-clear:hover { color: var(--color-text); }

	.cinema-block {
		padding: 18px 0;
		border-top: 1px solid var(--color-border-subtle);
	}

	.cinema-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 10px;
	}

	.cinema-name {
		font-family: var(--font-serif);
		font-size: 20px;
		font-weight: 500;
		color: var(--color-text);
		letter-spacing: -0.012em;
	}

	.cinema-sub {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 14px;
		color: var(--color-text-tertiary);
		margin-left: 10px;
	}

	.slots {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.slot-wrap {
		display: inline-flex;
		align-items: stretch;
	}

	.slot {
		padding: 10px 14px;
		background: transparent;
		border: 1px solid var(--color-border);
		border-right: none;
		cursor: pointer;
		display: inline-flex;
		align-items: baseline;
		gap: 8px;
		color: inherit;
	}

	.slot:hover { background: var(--color-bg-subtle); }

	.slot-time {
		font-family: var(--font-mono-plex);
		font-size: 14px;
		color: var(--color-text);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}

	.slot-format {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 12px;
		color: var(--color-text-tertiary);
	}

	.ical-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		border: 1px solid var(--color-border);
		color: var(--color-text-tertiary);
		cursor: pointer;
		background: transparent;
		transition: color var(--duration-fast) var(--ease-sharp),
			background-color var(--duration-fast) var(--ease-sharp);
	}

	.ical-btn:hover {
		color: var(--color-text);
		background: var(--color-bg-subtle);
	}

	.empty {
		margin: 24px 0;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 14px;
		color: var(--color-text-tertiary);
	}

	.external-links {
		display: flex;
		gap: 16px;
		margin-top: 28px;
		padding-top: 16px;
		border-top: 1px dotted var(--color-border-subtle);
	}

	.ext {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 13px;
		color: var(--color-text-tertiary);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.ext:hover { color: var(--color-text); }

	/* Sidebar */
	.sidebar {
		padding-left: 0;
	}

	@media (min-width: 1024px) {
		.sidebar {
			border-left: 1px solid var(--color-border-subtle);
			padding-left: 32px;
		}
	}

	.credits-section, .status-section, .tagline-section {
		padding-bottom: 20px;
		border-bottom: 1px solid var(--color-border-subtle);
		margin-bottom: 18px;
	}

	.credits-title {
		margin: 0 0 10px;
		font-family: var(--font-serif);
		font-size: 14px;
		font-weight: 500;
		letter-spacing: -0.005em;
		color: var(--color-text);
	}
	.credits-title .italic-cap { font-style: italic; }

	.credit-row {
		padding: 5px 0;
		display: flex;
		gap: 8px;
		align-items: baseline;
	}

	.credit-key {
		font-family: var(--font-mono-plex);
		font-size: 10px;
		color: var(--color-text-tertiary);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		min-width: 90px;
		padding-top: 3px;
	}

	.credit-val {
		flex: 1;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 13px;
		color: var(--color-text-secondary);
		line-height: 1.3;
	}

	.tagline {
		margin: 0;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 16px;
		color: var(--color-text-secondary);
		line-height: 1.35;
	}

	.status-row {
		display: flex;
		border: 1px solid var(--color-border);
	}

	.status-btn {
		flex: 1;
		padding: 8px 10px;
		font-family: var(--font-serif);
		font-size: 12.5px;
		font-weight: 400;
		letter-spacing: -0.005em;
		color: var(--color-text-secondary);
		background: transparent;
		border: none;
		border-right: 1px solid var(--color-border);
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp);
	}

	.status-btn:last-child { border-right: none; }

	.status-btn:hover {
		background: var(--color-bg-subtle);
		color: var(--color-text);
	}

	.status-btn.active {
		background: var(--color-text);
		color: var(--color-bg);
		font-weight: 500;
	}

	/* ── Similar films rail ── */
	.similar {
		max-width: 1400px;
		margin: 0 auto;
		padding: 32px 2rem 64px;
		border-top: 1px solid var(--color-border-subtle);
	}

	.similar-head {
		margin-bottom: 20px;
	}

	.similar-title {
		margin: 0;
		font-family: var(--font-serif);
		font-weight: 400;
		font-size: 28px;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--color-text);
		font-variation-settings: '"SOFT" 100', '"opsz" 36';
	}

	.similar-title .italic-cap {
		font-family: var(--font-serif-italic);
		font-style: italic;
	}

	.similar-rail {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
		gap: 20px 18px;
	}

	@media (max-width: 767px) {
		.similar-rail {
			display: flex;
			overflow-x: auto;
			scroll-snap-type: x mandatory;
			gap: 14px;
			padding-bottom: 8px;
		}
		.similar-card {
			flex: 0 0 132px;
			scroll-snap-align: start;
		}
	}

	.similar-card {
		display: flex;
		flex-direction: column;
		color: var(--color-text);
		text-decoration: none;
	}

	.similar-poster {
		position: relative;
		aspect-ratio: 2 / 3;
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border-subtle);
		margin-bottom: 8px;
		overflow: hidden;
	}

	.similar-poster img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.similar-poster-fallback {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 8px;
		font-family: var(--font-serif);
		font-size: 12px;
		color: var(--color-text-tertiary);
	}

	.similar-name {
		margin: 0 0 2px;
		font-family: var(--font-serif);
		font-weight: 400;
		font-size: 14px;
		line-height: 1.2;
		color: var(--color-text);
		font-variation-settings: '"SOFT" 100', '"opsz" 24';
	}

	.similar-year {
		margin: 0;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 12px;
		color: var(--color-text-tertiary);
	}
</style>
