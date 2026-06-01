<script lang="ts">
	import { formatTime } from '$lib/utils';
	import { trackScreeningClick } from '$lib/analytics/posthog';

	interface Screening {
		id: string;
		datetime: string;
		cinemaName: string;
		format?: string | null;
		bookingUrl?: string;
	}

	interface Film {
		id: string | number;
		title: string;
		year?: number | null;
		director?: string | null;
	}

	let {
		films
	}: {
		films: Array<{ film: Film; screenings: Screening[] }>;
	} = $props();

	// Flatten film+screenings into one row per upcoming screening, sorted by time.
	const rows = $derived.by(() => {
		const out: Array<{ film: Film; screening: Screening }> = [];
		for (const { film, screenings } of films) {
			for (const s of screenings) {
				if (new Date(s.datetime) <= new Date()) continue;
				out.push({ film, screening: s });
			}
		}
		out.sort((a, b) => new Date(a.screening.datetime).getTime() - new Date(b.screening.datetime).getTime());
		return out;
	});

	function fmt(f: string | null | undefined): string {
		if (!f || f === 'unknown' || f === 'dcp') return '';
		return f.toUpperCase().replace('_', ' ');
	}

	function clickRow(film: Film, s: Screening) {
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

	{#each rows as { film, screening } (screening.id)}
		<a
			role="row"
			class="text-row"
			href={screening.bookingUrl ?? `/film/${film.id}`}
			target={screening.bookingUrl ? '_blank' : undefined}
			rel={screening.bookingUrl ? 'noopener noreferrer' : undefined}
			onclick={() => clickRow(film, screening)}
		>
			<time class="cell time" datetime={screening.datetime}>{formatTime(screening.datetime)}</time>
			<span class="cell title">{film.title.toUpperCase()}</span>
			<span class="cell director hide-md">{(film.director ?? '').toUpperCase()}</span>
			<span class="cell year hide-sm">{film.year ?? ''}</span>
			<span class="cell format hide-sm">{fmt(screening.format)}</span>
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
	.cell.director { color: var(--color-text-tertiary); }
	.cell.year { color: var(--color-text-tertiary); font-variant-numeric: tabular-nums; }
	.cell.format { color: var(--color-text-tertiary); font-weight: 300; }
	.cell.cinema { font-weight: 500; }

	@media (max-width: 1023px) {
		.text-thead,
		.text-row {
			grid-template-columns: 56px minmax(0, 2fr) minmax(0, 1.5fr) minmax(0, 1.5fr);
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
