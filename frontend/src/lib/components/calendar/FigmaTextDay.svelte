<script lang="ts">
	import { formatTime } from '$lib/utils';
	import { trackScreeningClick } from '$lib/analytics/posthog';
	import { formatLabel, type CardFilm, type CardScreening } from './card-shapes';

	let {
		films,
		now
	}: {
		films: Array<{ film: CardFilm; screenings: CardScreening[]; sleeper?: boolean }>;
		/** Epoch ms to judge "upcoming" against — see the note in FigmaFilmCard. */
		now: number;
	} = $props();

	// Flatten film+screenings into one row per upcoming screening, sorted by time.
	const rows = $derived.by(() => {
		const out: Array<{ film: CardFilm; screening: CardScreening; sleeper: boolean }> = [];
		for (const { film, screenings, sleeper } of films) {
			for (const s of screenings) {
				if (new Date(s.datetime).getTime() <= now) continue;
				out.push({ film, screening: s, sleeper: Boolean(sleeper) });
			}
		}
		out.sort((a, b) => new Date(a.screening.datetime).getTime() - new Date(b.screening.datetime).getTime());
		// This view flattens film grouping away, so THE SLEEPER flag has to ride
		// per-row — but show it only on the film's earliest remaining screening,
		// or a film with five showings stamps five chips down the day.
		// Deterministic: Array.sort is stable and `rows` derives only from props
		// plus the hydration-safe clock, so server and client first render agree.
		let marked = false;
		for (const row of out) {
			if (!row.sleeper) continue;
			if (marked) row.sleeper = false;
			else marked = true;
		}
		return out;
	});

	function clickRow(film: CardFilm, s: CardScreening) {
		trackScreeningClick(
			{
				filmId: String(film.id),
				filmTitle: film.title,
				filmYear: film.year,
				screeningId: s.id,
				screeningTime: s.datetime,
				cinemaName: s.cinemaName
			},
			'calendar-text'
		);
	}
</script>

<div class="text-table" role="table" aria-label="Screenings list">
	<div class="text-thead" role="row">
		<span role="columnheader">TIME</span>
		<span role="columnheader">TITLE</span>
		<span role="columnheader" class="hide-md">DIRECTOR</span>
		<span role="columnheader" class="hide-sm">YEAR</span>
		<span role="columnheader" class="hide-sm">FORMAT</span>
		<span role="columnheader">CINEMA</span>
	</div>

	{#each rows as { film, screening, sleeper } (screening.id)}
		<a
			role="row"
			class="text-row"
			href={screening.bookingUrl ?? `/film/${film.id}`}
			target={screening.bookingUrl ? '_blank' : undefined}
			rel={screening.bookingUrl ? 'noopener noreferrer' : undefined}
			onclick={() => clickRow(film, screening)}
		>
			<time class="cell time" datetime={screening.datetime}>{formatTime(screening.datetime)}</time>
			<!-- Chip goes BEFORE the title and inside the existing title cell. That
			     cell is nowrap/ellipsis, so a trailing chip would be silently clipped
			     on long titles; and a 7th grid column would mean editing all three
			     grid-template-columns declarations below. -->
			<span class="cell title"
				>{#if sleeper}<span
						class="sleeper-tag"
						title="The Sleeper — highly rated, rarely seen. One pick per day."
					>SLEEPER</span
					>{/if}{film.title.toUpperCase()}</span
			>
			<span class="cell director hide-md">{(film.director ?? '').toUpperCase()}</span>
			<span class="cell year hide-sm">{film.year ?? ''}</span>
			<span class="cell format hide-sm">{formatLabel(screening.format)}</span>
			<span class="cell cinema">{screening.cinemaName.toUpperCase()}</span>
		</a>
	{/each}
</div>

<style>
	.text-table {
		display: flex;
		flex-direction: column;
		font-family: var(--font-sans);
		color: var(--color-text);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-top: none;
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
		overflow: hidden;
	}

	.text-thead,
	.text-row {
		display: grid;
		grid-template-columns: 64px minmax(0, 2fr) minmax(0, 1.5fr) 56px 80px minmax(0, 1.5fr);
		align-items: center;
		padding: 8px 16px;
		border-bottom: 1px solid var(--color-border);
		column-gap: 12px;
		min-width: 0;
	}

	.text-thead {
		font-weight: 700;
		font-size: 10px;
		letter-spacing: 0.1em;
		color: var(--color-text);
		background: var(--color-cream);
		border-bottom: 1px solid var(--color-border);
	}

	.text-row {
		text-decoration: none;
		color: inherit;
		transition: background-color var(--duration-fast) var(--ease-sharp);
		min-height: 36px;
	}

	.text-row:last-child { border-bottom: none; }
	.text-row:hover { background: var(--color-cream); }

	.cell {
		font-size: 14px;
		letter-spacing: -0.01em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cell.time {
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.cell.title { font-weight: 700; }

	/* THE SLEEPER, text mode. Hardcoded hex for the same reason as
	   `.rail-sleeper` in FigmaFilmCard: every inverting token pair collapses to
	   cream-on-cream under [data-theme="dark"] or at the DimmerDial's midpoint.
	   Abbreviated to SLEEPER because at narrow widths the title shares a
	   3-column grid and "THE SLEEPER" would eat too much of it; the FAQ entry on
	   the homepage defines the term. */
	.sleeper-tag {
		display: inline-block;
		margin-right: 6px;
		padding: 1px 5px;
		background: #1f1f1f;
		color: #eae5c2;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.1em;
		line-height: 1.4;
		vertical-align: 1px;
		border-radius: 0;
	}

	:global([data-theme='dark']) .sleeper-tag {
		background: #eae5c2;
		color: #1f1f1f;
	}
	.cell.director { color: var(--color-text-tertiary); }
	.cell.year { color: var(--color-text-tertiary); font-variant-numeric: tabular-nums; }
	.cell.format { color: var(--color-text-tertiary); font-weight: 300; }
	.cell.cinema { font-weight: 500; }

	@media (max-width: 1023px) {
		.text-thead,
		.text-row {
			/* 5 columns: TIME TITLE YEAR FORMAT CINEMA (DIRECTOR is hide-md).
			   Must track the visible cell count or the last cell wraps onto an
			   implicit grid row. */
			grid-template-columns: 56px minmax(0, 2fr) 56px 80px minmax(0, 1.5fr);
			padding: 8px 12px;
		}
		.hide-md { display: none; }
	}

	@media (max-width: 639px) {
		.text-thead,
		.text-row {
			grid-template-columns: 48px minmax(0, 2fr) minmax(0, 1.5fr);
			padding: 8px 10px;
			column-gap: 8px;
		}
		.hide-sm { display: none; }
		.cell { font-size: 13px; }
	}
</style>
