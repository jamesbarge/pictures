<script lang="ts">
	import { apiPost } from '$lib/api/client';
	import { filmStatuses } from '$lib/stores/film-status.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	interface EnrichedFilm {
		filmId: string;
		title: string;
		year: number | null;
		posterUrl: string | null;
		directors: string[];
		screenings: {
			count: number;
			next: {
				datetime: string;
				cinemaName: string;
				format: string | null;
			} | null;
			isLastChance: boolean;
		};
	}

	interface PreviewResponse {
		matched: EnrichedFilm[];
		pendingLookup: number;
		total: number;
		username: string;
		capped: boolean;
	}

	type PageState = 'idle' | 'loading' | 'results' | 'error';

	let state = $state<PageState>('idle');
	let username = $state('');
	let results = $state<PreviewResponse | null>(null);
	let errorMessage = $state('');
	let addedIds = $state<Set<string>>(new Set());

	async function handleSubmit() {
		const trimmed = username.trim();
		if (!trimmed) return;

		state = 'loading';
		errorMessage = '';

		try {
			const res = await apiPost<PreviewResponse>('/api/letterboxd/preview', { username: trimmed });
			results = res;
			state = 'results';
		} catch (e) {
			if (e instanceof Error && e.message.includes('{')) {
				try {
					const body = JSON.parse(e.message.replace(/^API error \d+: /, ''));
					errorMessage = body.error ?? e.message;
				} catch {
					errorMessage = e.message;
				}
			} else {
				errorMessage = e instanceof Error ? e.message : 'Something went wrong. Try again.';
			}
			state = 'error';
		}
	}

	function addToWatchlist(filmId: string) {
		filmStatuses.setStatus(filmId, 'want_to_see');
		addedIds = new Set([...addedIds, filmId]);
	}

	function addAllToWatchlist() {
		if (!results) return;
		for (const film of results.matched) {
			filmStatuses.setStatus(film.filmId, 'want_to_see');
		}
		addedIds = new Set(results.matched.map((f) => f.filmId));
	}

	function reset() {
		state = 'idle';
		results = null;
		username = '';
		addedIds = new Set();
	}

	const matchedWithScreenings = $derived(
		results?.matched.filter((f) => f.screenings.count > 0) ?? []
	);
	const matchedNoScreenings = $derived(
		results?.matched.filter((f) => f.screenings.count === 0) ?? []
	);
</script>

<svelte:head>
	<title>Letterboxd Import — pictures · london</title>
	<meta
		name="description"
		content="Import your Letterboxd watchlist to see which films are showing in London cinemas"
	/>
</svelte:head>

<section class="py-6">
	<div class="max-w-[1400px] mx-auto px-4 md:px-8">
		<h1
			class="font-display text-sm font-bold tracking-wide-swiss uppercase mb-6 pb-1.5 border-b-2 border-[var(--color-border)]"
		>
			LETTERBOXD IMPORT
		</h1>

		{#if state === 'idle' || state === 'loading'}
			<div class="max-w-lg">
				<p class="text-sm text-[var(--color-muted)] mb-4">
					Enter your Letterboxd username to find which films on your watchlist are showing in London
					cinemas.
				</p>

				<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="flex gap-3">
					<input
						type="text"
						bind:value={username}
						placeholder="your-username"
						disabled={state === 'loading'}
						class="flex-1 px-3 py-2 text-sm font-mono bg-[var(--color-surface)] border-2 border-[var(--color-border)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-foreground)] transition-colors"
					/>
					<button
						type="submit"
						disabled={state === 'loading' || !username.trim()}
						class="px-5 py-2 text-xs font-bold tracking-wide-swiss uppercase bg-[var(--color-foreground)] text-[var(--color-background)] border-2 border-[var(--color-foreground)] hover:bg-transparent hover:text-[var(--color-foreground)] transition-colors disabled:opacity-40 disabled:pointer-events-none"
					>
						{state === 'loading' ? 'SCANNING...' : 'IMPORT'}
					</button>
				</form>

				{#if state === 'loading'}
					<div class="mt-6 flex items-center gap-3 text-sm text-[var(--color-muted)]">
						<div class="w-4 h-4 border-2 border-[var(--color-muted)] border-t-transparent animate-spin"></div>
						Scraping your Letterboxd watchlist...
					</div>
				{/if}
			</div>
		{:else if state === 'error'}
			<div class="max-w-lg">
				<div class="p-4 border-2 border-red-400 bg-red-50 dark:bg-red-950/20 mb-4">
					<p class="text-sm font-mono">{errorMessage}</p>
				</div>
				<button
					onclick={reset}
					class="px-4 py-2 text-xs font-bold tracking-wide-swiss uppercase border-2 border-[var(--color-border)] hover:border-[var(--color-foreground)] transition-colors"
				>
					TRY AGAIN
				</button>
			</div>
		{:else if state === 'results' && results}
			<div class="mb-6 flex items-baseline justify-between flex-wrap gap-4">
				<div class="text-sm text-[var(--color-muted)]">
					<span class="font-bold text-[var(--color-foreground)]">{results.matched.length}</span>
					matched of {results.total} watchlist films
					{#if results.pendingLookup > 0}
						· {results.pendingLookup} pending lookup
					{/if}
					{#if results.capped}
						· <span class="text-amber-600">watchlist capped at 500</span>
					{/if}
				</div>

				<div class="flex gap-3">
					{#if matchedWithScreenings.length > 0}
						<button
							onclick={addAllToWatchlist}
							disabled={addedIds.size === results.matched.length}
							class="px-4 py-2 text-xs font-bold tracking-wide-swiss uppercase bg-[var(--color-foreground)] text-[var(--color-background)] border-2 border-[var(--color-foreground)] hover:bg-transparent hover:text-[var(--color-foreground)] transition-colors disabled:opacity-40"
						>
							{addedIds.size === results.matched.length ? 'ALL ADDED' : 'ADD ALL TO WATCHLIST'}
						</button>
					{/if}
					<button
						onclick={reset}
						class="px-4 py-2 text-xs font-bold tracking-wide-swiss uppercase border-2 border-[var(--color-border)] hover:border-[var(--color-foreground)] transition-colors"
					>
						NEW IMPORT
					</button>
				</div>
			</div>

			{#if matchedWithScreenings.length > 0}
				<h2 class="text-xs font-bold tracking-wide-swiss uppercase text-[var(--color-muted)] mb-3">
					SHOWING IN LONDON ({matchedWithScreenings.length})
				</h2>
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
					{#each matchedWithScreenings as film (film.filmId)}
						<div
							class="border-2 border-[var(--color-border)] p-4 flex gap-4 hover:border-[var(--color-foreground)] transition-colors"
						>
							{#if film.posterUrl}
								<img
									src={film.posterUrl}
									alt={film.title}
									class="w-16 h-24 object-cover flex-shrink-0"
								/>
							{:else}
								<div
									class="w-16 h-24 bg-[var(--color-surface)] flex items-center justify-center flex-shrink-0"
								>
									<span class="text-[8px] font-mono text-[var(--color-muted)] text-center px-1"
										>{film.title}</span
									>
								</div>
							{/if}

							<div class="flex-1 min-w-0">
								<a
									href="/film/{film.filmId}"
									class="text-sm font-bold uppercase tracking-wide-swiss hover:underline line-clamp-2"
								>
									{film.title}
								</a>
								<p class="text-xs text-[var(--color-muted)] mt-0.5">
									{film.year ?? ''}{film.directors.length > 0
										? ` · ${film.directors[0]}`
										: ''}
								</p>
								<div class="mt-2 flex items-center gap-2">
									<Badge>
										{film.screenings.count} screening{film.screenings.count !== 1 ? 's' : ''}
									</Badge>
									{#if film.screenings.isLastChance}
										<Badge>LAST CHANCE</Badge>
									{/if}
								</div>
								{#if film.screenings.next}
									<p class="text-[10px] font-mono text-[var(--color-muted)] mt-1">
										NEXT: {new Date(film.screenings.next.datetime).toLocaleDateString('en-GB', {
											weekday: 'short',
											day: 'numeric',
											month: 'short'
										})}
										@ {film.screenings.next.cinemaName}
									</p>
								{/if}
								<button
									onclick={() => addToWatchlist(film.filmId)}
									disabled={addedIds.has(film.filmId)}
									class="mt-2 text-[10px] font-bold tracking-wide-swiss uppercase px-2 py-1 border border-[var(--color-border)] hover:border-[var(--color-foreground)] transition-colors disabled:opacity-40"
								>
									{addedIds.has(film.filmId) ? 'ADDED' : 'ADD TO WATCHLIST'}
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			{#if matchedNoScreenings.length > 0}
				<h2 class="text-xs font-bold tracking-wide-swiss uppercase text-[var(--color-muted)] mb-3">
					NOT CURRENTLY SHOWING ({matchedNoScreenings.length})
				</h2>
				<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
					{#each matchedNoScreenings as film (film.filmId)}
						<a
							href="/film/{film.filmId}"
							class="text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
						>
							<span class="font-bold uppercase">{film.title}</span>
							{#if film.year}
								<span class="opacity-60">({film.year})</span>
							{/if}
						</a>
					{/each}
				</div>
			{/if}

			{#if results.matched.length === 0}
				<EmptyState
					title="No matches found"
					description="None of the films on your watchlist are in our database. Try a different username."
				/>
			{/if}
		{/if}
	</div>
</section>
