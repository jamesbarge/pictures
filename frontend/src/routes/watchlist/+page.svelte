<script lang="ts">
	import { filmStatuses } from '$lib/stores/film-status.svelte';
	import { apiGet } from '$lib/api/client';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { formatTime } from '$lib/utils';
	import { onMount } from 'svelte';

	interface WatchlistFilm {
		id: string;
		title: string;
		year: number | null;
		directors: string[];
		runtime: number | null;
		posterUrl: string | null;
		screeningCount: number;
		nextScreening: string | null;
	}

	let films = $state<WatchlistFilm[]>([]);
	let loading = $state(true);
	let sortBy = $state<'next' | 'added' | 'title'>('next');

	const wantToSeeIds = $derived(filmStatuses.getFilmIdsByStatus('want_to_see'));

	async function loadFilms() {
		if (wantToSeeIds.length === 0) {
			films = [];
			loading = false;
			return;
		}

		loading = true;

		const results = await Promise.all(
			wantToSeeIds.map(async (id): Promise<WatchlistFilm | null> => {
				try {
					const res = await apiGet<{
						film: { id: string; title: string; year: number | null; directors: string[]; runtime: number | null; posterUrl: string | null };
						screenings: Array<{ id: string; datetime: string; bookingUrl: string }>;
					}>(`/api/films/${id}`);
					const futureScreenings = res.screenings
						.filter((s) => new Date(s.datetime) > new Date())
						.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

					return {
						id: res.film.id,
						title: res.film.title,
						year: res.film.year,
						directors: res.film.directors,
						runtime: res.film.runtime,
						posterUrl: res.film.posterUrl,
						screeningCount: futureScreenings.length,
						nextScreening: futureScreenings[0]?.datetime ?? null
					};
				} catch (e) {
					console.error(`[watchlist] Failed to load film ${id}:`, e instanceof Error ? e.message : e);
					return null;
				}
			})
		);

		films = results.filter((r): r is WatchlistFilm => r !== null);
		loading = false;
	}

	onMount(loadFilms);

	const sortedFilms = $derived.by(() => {
		const sorted = [...films];
		if (sortBy === 'title') {
			sorted.sort((a, b) => a.title.localeCompare(b.title));
		} else if (sortBy === 'next') {
			sorted.sort((a, b) => {
				if (!a.nextScreening && !b.nextScreening) return 0;
				if (!a.nextScreening) return 1;
				if (!b.nextScreening) return -1;
				return new Date(a.nextScreening).getTime() - new Date(b.nextScreening).getTime();
			});
		}
		return sorted;
	});

	const currentlyShowing = $derived(sortedFilms.filter((f) => f.screeningCount > 0));
	const notPlaying = $derived(sortedFilms.filter((f) => f.screeningCount === 0));
</script>

<svelte:head>
	<title>Watchlist — pictures · london</title>
	<meta name="description" content="Your saved films — see which are currently showing in London cinemas" />
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="py-6">
	<div class="max-w-[1400px] mx-auto px-4 md:px-8">
		<div class="flex items-baseline justify-between mb-6 pb-1.5 border-b-2 border-[var(--color-border)]">
			<div class="flex items-baseline gap-3">
				<h1 class="font-display text-sm font-bold tracking-wide-swiss uppercase">WATCHLIST</h1>
				{#if !loading}
					<span class="text-xs text-[var(--color-text-tertiary)] font-mono">{wantToSeeIds.length}</span>
				{/if}
			</div>

			{#if films.length > 1}
				<div class="flex gap-2">
					<button class="sort-btn" class:active={sortBy === 'next'} onclick={() => sortBy = 'next'}>NEXT</button>
					<button class="sort-btn" class:active={sortBy === 'title'} onclick={() => sortBy = 'title'}>A–Z</button>
				</div>
			{/if}
		</div>

		{#if loading}
			<p class="text-sm text-[var(--color-text-tertiary)] uppercase tracking-wide-swiss">Loading...</p>
		{:else if wantToSeeIds.length === 0}
			<EmptyState
				title="Your watchlist is empty"
				description="Browse films and tap 'Want to See' to add them here."
			/>
		{:else}
			{#if currentlyShowing.length > 0}
				<div class="mb-8">
					<h2 class="section-label">CURRENTLY SHOWING</h2>
					<div class="film-list">
						{#each currentlyShowing as film (film.id)}
							<a href="/film/{film.id}" class="watchlist-row">
								{#if film.posterUrl}
									<img src={film.posterUrl} alt="" class="wl-poster" loading="lazy" />
								{:else}
									<div class="wl-poster-empty"></div>
								{/if}
								<div class="wl-info">
									<span class="wl-title">{film.title}</span>
									<span class="wl-meta">{film.year ?? ''}{film.directors.length ? ` · ${film.directors[0]}` : ''}</span>
								</div>
								<div class="wl-screenings">
									<span class="wl-count">{film.screeningCount} SCREENINGS</span>
									{#if film.nextScreening}
										<span class="wl-next">Next: {formatTime(film.nextScreening)}</span>
									{/if}
								</div>
								<button
									class="wl-remove"
									onclick={(e) => { e.preventDefault(); filmStatuses.removeStatus(film.id); films = films.filter(f => f.id !== film.id); }}
									aria-label="Remove from watchlist"
								>
									<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none">
										<path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"/>
									</svg>
								</button>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			{#if notPlaying.length > 0}
				<div>
					<h2 class="section-label">NOT CURRENTLY PLAYING</h2>
					<div class="film-list">
						{#each notPlaying as film (film.id)}
							<a href="/film/{film.id}" class="watchlist-row muted">
								{#if film.posterUrl}
									<img src={film.posterUrl} alt="" class="wl-poster" loading="lazy" />
								{:else}
									<div class="wl-poster-empty"></div>
								{/if}
								<div class="wl-info">
									<span class="wl-title">{film.title}</span>
									<span class="wl-meta">{film.year ?? ''}{film.directors.length ? ` · ${film.directors[0]}` : ''}</span>
								</div>
								<span class="wl-no-screenings">NO SCREENINGS</span>
							</a>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</section>

<style>
	.sort-btn {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-tertiary);
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
	}

	.sort-btn.active {
		color: var(--color-text);
		border-bottom: 1px solid var(--color-accent);
	}

	.section-label {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-text-tertiary);
		margin-bottom: 0.75rem;
	}

	.film-list {
		display: flex;
		flex-direction: column;
	}

	.watchlist-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0;
		border-bottom: 1px solid var(--color-border-subtle);
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	.watchlist-row:hover {
		background: var(--color-bg-subtle);
		margin: 0 -0.75rem;
		padding-left: 0.75rem;
		padding-right: 0.75rem;
	}

	.watchlist-row.muted {
		opacity: 0.5;
	}

	.wl-poster {
		width: 36px;
		height: 54px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.wl-poster-empty {
		width: 36px;
		height: 54px;
		background: var(--color-bg-subtle);
		flex-shrink: 0;
	}

	.wl-info {
		flex: 1;
		min-width: 0;
	}

	.wl-title {
		display: block;
		font-size: var(--font-size-sm);
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.wl-meta {
		display: block;
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
	}

	.wl-screenings {
		text-align: right;
		flex-shrink: 0;
	}

	.wl-count {
		display: block;
		font-size: var(--font-size-xs);
		font-family: var(--font-mono);
		color: var(--color-text-secondary);
	}

	.wl-next {
		display: block;
		font-size: var(--font-size-xs);
		font-family: var(--font-mono);
		color: var(--color-text-tertiary);
	}

	.wl-no-screenings {
		font-size: var(--font-size-xs);
		font-family: var(--font-mono);
		color: var(--color-text-tertiary);
		flex-shrink: 0;
	}

	.wl-remove {
		padding: 0.375rem;
		color: var(--color-text-tertiary);
		background: transparent;
		border: none;
		cursor: pointer;
		flex-shrink: 0;
	}

	.wl-remove:hover {
		color: var(--color-accent);
	}
</style>
