<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import { formatTime } from '$lib/utils';

	interface TableFilm {
		id: string;
		title: string;
		year: number | null;
		directors: string[];
		runtime: number | null;
		isRepertory: boolean;
		genres: string[];
		posterUrl: string | null;
	}

	interface TableScreening {
		id: string;
		datetime: string;
		format: string | null;
		bookingUrl: string;
		cinema: { id: string; name: string; shortName: string | null };
	}

	interface TableRow {
		film: TableFilm;
		screenings: TableScreening[];
	}

	let { rows = [] }: { rows: TableRow[] } = $props();

	let sortBy = $state<'title' | 'year' | 'screenings'>('screenings');
	let sortDir = $state<'asc' | 'desc'>('desc');
	let expandedFilmId = $state<string | null>(null);

	const sortedRows = $derived.by(() => {
		const sorted = [...rows];
		sorted.sort((a, b) => {
			let cmp = 0;
			if (sortBy === 'title') {
				cmp = a.film.title.localeCompare(b.film.title);
			} else if (sortBy === 'year') {
				cmp = (a.film.year ?? 0) - (b.film.year ?? 0);
			} else {
				cmp = a.screenings.length - b.screenings.length;
			}
			return sortDir === 'asc' ? cmp : -cmp;
		});
		return sorted;
	});

	function toggleSort(col: 'title' | 'year' | 'screenings') {
		if (sortBy === col) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = col;
			sortDir = col === 'title' ? 'asc' : 'desc';
		}
	}

	function toggleExpand(filmId: string) {
		expandedFilmId = expandedFilmId === filmId ? null : filmId;
	}
</script>

<div class="table-view">
	<div class="table-header">
		<button class="th th-title" class:active={sortBy === 'title'} onclick={() => toggleSort('title')} aria-label="Sort by film title{sortBy === 'title' ? (sortDir === 'asc' ? ', ascending' : ', descending') : ''}">
			FILM {sortBy === 'title' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
		</button>
		<button class="th th-year" class:active={sortBy === 'year'} onclick={() => toggleSort('year')} aria-label="Sort by year{sortBy === 'year' ? (sortDir === 'asc' ? ', ascending' : ', descending') : ''}">
			YEAR {sortBy === 'year' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
		</button>
		<span class="th th-director">DIRECTOR</span>
		<span class="th th-runtime">RUNTIME</span>
		<button class="th th-screenings" class:active={sortBy === 'screenings'} onclick={() => toggleSort('screenings')} aria-label="Sort by showings{sortBy === 'screenings' ? (sortDir === 'asc' ? ', ascending' : ', descending') : ''}">
			SHOWINGS {sortBy === 'screenings' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
		</button>
		<span class="th th-next">NEXT</span>
	</div>

	{#each sortedRows as { film, screenings } (film.id)}
		<button class="table-row" class:expanded={expandedFilmId === film.id} aria-expanded={expandedFilmId === film.id} onclick={() => toggleExpand(film.id)}>
			<span class="td td-title">
				<a href="/film/{film.id}" class="film-link" onclick={(e) => e.stopPropagation()}>{film.title}</a>
				{#if film.isRepertory}
					<Badge variant="muted">REP</Badge>
				{/if}
			</span>
			<span class="td td-year">{film.year ?? '—'}</span>
			<span class="td td-director">{film.directors[0] ?? '—'}</span>
			<span class="td td-runtime">{film.runtime ? `${film.runtime}m` : '—'}</span>
			<span class="td td-screenings">{screenings.length}</span>
			<span class="td td-next">{screenings[0] ? formatTime(screenings[0].datetime) : '—'}</span>
		</button>

		{#if expandedFilmId === film.id}
			<div class="expanded-screenings">
				{#each screenings.slice(0, 10) as screening (screening.id)}
					<a
						href={screening.bookingUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="screening-row"
						aria-label="Book {formatTime(screening.datetime)} at {screening.cinema?.name ?? 'cinema'}"
					>
						<time class="sr-time" datetime={screening.datetime}>{formatTime(screening.datetime)}</time>
						<span class="sr-cinema">{screening.cinema?.name ?? 'Unknown'}</span>
						{#if screening.format && screening.format !== 'unknown' && screening.format !== 'dcp'}
							<Badge variant="muted">{screening.format.toUpperCase()}</Badge>
						{/if}
						<svg aria-hidden="true" class="sr-arrow" width="10" height="10" viewBox="0 0 12 12" fill="none">
							<path d="M2 10L10 2M10 2H4M10 2V8" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"/>
						</svg>
					</a>
				{/each}
				{#if screenings.length > 10}
					<a href="/film/{film.id}" class="sr-more">+{screenings.length - 10} more</a>
				{/if}
			</div>
		{/if}
	{/each}
</div>

<style>
	.table-view {
		width: 100%;
	}

	.table-header {
		display: grid;
		grid-template-columns: 1fr 60px 160px 70px 80px 60px;
		gap: 0.5rem;
		padding: 0.5rem 0;
		border-bottom: 2px solid var(--color-border);
	}

	.th {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-text-tertiary);
		text-align: left;
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0;
	}

	.th.active {
		color: var(--color-text);
	}

	.th-year, .th-runtime, .th-screenings, .th-next {
		font-family: var(--font-mono);
	}

	.table-row {
		display: grid;
		grid-template-columns: 1fr 60px 160px 70px 80px 60px;
		gap: 0.5rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--color-border-subtle);
		width: 100%;
		text-align: left;
		background: transparent;
		border-left: none;
		border-right: none;
		border-top: none;
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	.table-row:hover {
		background: var(--color-bg-subtle);
		margin: 0 -0.75rem;
		padding-left: 0.75rem;
		padding-right: 0.75rem;
	}

	.td {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.td-year, .td-runtime, .td-screenings, .td-next {
		font-family: var(--font-mono);
		color: var(--color-text-secondary);
	}

	.td-director {
		color: var(--color-text-secondary);
	}

	.film-link {
		font-weight: 500;
	}

	.film-link:hover {
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.expanded-screenings {
		padding: 0.25rem 0 0.75rem 0;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.screening-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.375rem 0 0.375rem 1rem;
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	.screening-row:hover {
		background: var(--color-bg-subtle);
	}

	.sr-time {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		font-weight: 600;
		min-width: 2.5rem;
	}

	.sr-cinema {
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		flex: 1;
	}

	.sr-arrow {
		color: var(--color-text-tertiary);
	}

	.sr-more {
		display: block;
		padding: 0.25rem 0 0 1rem;
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-tertiary);
	}

	.sr-more:hover {
		color: var(--color-text);
	}
</style>
