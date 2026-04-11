<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { debounce } from '$lib/utils';
	import { apiGet } from '$lib/api/client';
	import { trackSearch, trackSearchNoResults, trackSearchResultClick } from '$lib/analytics/posthog';

	interface SearchResult {
		id: string;
		title: string;
		year: number | null;
		directors: string[];
		posterUrl: string | null;
	}

	interface CinemaResult {
		id: string;
		name: string;
		shortName: string | null;
		address: string | null;
	}

	let query = $state('');
	let films = $state<SearchResult[]>([]);
	let cinemas = $state<CinemaResult[]>([]);
	let open = $state(false);
	let selectedIndex = $state(-1);
	let inputEl = $state<HTMLInputElement>();
	let loading = $state(false);

	const totalResults = $derived(films.length + cinemas.length);

	const doSearch = debounce(async (q: string) => {
		if (q.length < 2) {
			films = [];
			cinemas = [];
			return;
		}
		loading = true;
		try {
			const res = await apiGet<{ results: SearchResult[]; cinemas: CinemaResult[] }>(
				`/api/films/search?q=${encodeURIComponent(q)}`
			);
			films = res.results;
			cinemas = res.cinemas;
			const total = films.length + cinemas.length;
			trackSearch(q, total);
			if (total === 0) trackSearchNoResults(q);
		} catch (e) {
			console.error('[search] Failed to search:', e instanceof Error ? e.message : e);
			films = [];
			cinemas = [];
		}
		loading = false;
	}, 200);

	function handleInput() {
		selectedIndex = -1;
		open = query.length >= 2;
		doSearch(query);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, totalResults - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, -1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (selectedIndex >= 0) {
				navigateToResult(selectedIndex);
			} else if (query.trim().length >= 2) {
				open = false;
				goto(`/search?q=${encodeURIComponent(query.trim())}`);
				query = '';
			}
		} else if (e.key === 'Escape') {
			open = false;
			inputEl?.blur();
		}
	}

	function navigateToResult(index: number) {
		if (index < films.length) {
			const film = films[index];
			trackSearchResultClick(query, {
				filmId: film.id,
				filmTitle: film.title,
				filmYear: film.year
			}, index);
			goto(`/film/${film.id}`);
		} else {
			const cinemaIndex = index - films.length;
			goto(`/cinemas/${cinemas[cinemaIndex].id}`);
		}
		open = false;
		query = '';
	}

	function handleFocus() {
		if (query.length >= 2) open = true;
	}

	function handleBlur() {
		setTimeout(() => (open = false), 200);
	}

	function clearSearch() {
		query = '';
		films = [];
		cinemas = [];
		open = false;
		inputEl?.focus();
	}

	onMount(() => {
		function globalKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				inputEl?.focus();
			}
		}
		document.addEventListener('keydown', globalKeydown);
		return () => document.removeEventListener('keydown', globalKeydown);
	});
</script>

<div class="search-container relative">
	<div class="search-input-wrap">
		<svg aria-hidden="true" class="search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
			<circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2"/>
			<line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"/>
		</svg>
		<input
			bind:this={inputEl}
			bind:value={query}
			oninput={handleInput}
			onfocus={handleFocus}
			onblur={handleBlur}
			onkeydown={handleKeydown}
			type="text"
			role="combobox" autocapitalize="off"
			placeholder="Search films, cinemas, directors..."
			class="search-input"
			autocomplete="off"
			spellcheck="false"
			aria-label="Search films, cinemas, directors"
			aria-expanded={open}
			aria-controls={open ? 'search-results' : undefined}
			aria-autocomplete="list"
		/>
		{#if query}
			<button class="clear-btn" onclick={clearSearch} aria-label="Clear search">
				<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none">
					<path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"/>
				</svg>
			</button>
		{:else}
			<kbd class="kbd-hint" aria-hidden="true">⌘K</kbd>
		{/if}
	</div>

	{#if open}
		<div class="results-dropdown" id="search-results" role="listbox" aria-label="Search results">
			{#if loading}
				<div class="results-loading">SEARCHING...</div>
			{:else if totalResults === 0 && query.length >= 2}
				<div class="results-empty">
					<span>NO RESULTS</span>
					<a href="/search?q={encodeURIComponent(query)}" class="search-all-link" onclick={() => { open = false; query = ''; }}>
						SEARCH ALL DATES →
					</a>
				</div>
			{:else}
				{#if films.length > 0}
					<div class="results-section-header">FILMS</div>
					{#each films as film, i}
						<button
							class="result-row"
							class:selected={selectedIndex === i}
							role="option"
							aria-selected={selectedIndex === i}
							onmouseenter={() => (selectedIndex = i)}
							onclick={() => navigateToResult(i)}
						>
							{#if film.posterUrl}
								<img src={film.posterUrl} alt="" class="result-poster" loading="lazy" decoding="async" />
							{:else}
								<div class="result-poster-empty"></div>
							{/if}
							<div class="result-info">
								<span class="result-title">{film.title}</span>
								<span class="result-meta">
									{film.year ?? ''}{film.directors.length ? ` · ${film.directors[0]}` : ''}
								</span>
							</div>
						</button>
					{/each}
				{/if}
				{#if cinemas.length > 0}
					<div class="results-section-header">CINEMAS</div>
					{#each cinemas as cinema, i}
						{@const idx = films.length + i}
						<button
							class="result-row"
							class:selected={selectedIndex === idx}
							role="option"
							aria-selected={selectedIndex === idx}
							onmouseenter={() => (selectedIndex = idx)}
							onclick={() => navigateToResult(idx)}
						>
							<svg aria-hidden="true" class="result-pin" width="12" height="16" viewBox="0 0 12 16" fill="none">
								<path d="M6 0C2.7 0 0 2.7 0 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.3-2.7-6-6-6z" fill="currentColor" opacity="0.4"/>
							</svg>
							<div class="result-info">
								<span class="result-title">{cinema.name}</span>
								{#if cinema.address}
									<span class="result-meta">{cinema.address}</span>
								{/if}
							</div>
						</button>
					{/each}
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.search-container {
		flex: 1;
		min-width: 0;
	}

	.search-input-wrap {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.625rem;
		border: 1px solid var(--color-border-subtle);
		transition: border-color var(--duration-fast) var(--ease-sharp);
		min-height: 44px;
	}

	@media (min-width: 768px) {
		.search-input-wrap {
			min-height: auto;
		}
	}

	.search-input-wrap:focus-within {
		border-color: var(--color-border);
	}

	.search-icon {
		flex-shrink: 0;
		color: var(--color-text-tertiary);
	}

	.search-input {
		flex: 1;
		border: none;
		background: transparent;
		font-size: var(--font-size-sm);
		color: var(--color-text);
		outline: none;
	}

	.search-input::placeholder {
		color: var(--color-text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: var(--font-size-xs);
	}

	.clear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		margin: -0.375rem -0.625rem -0.375rem 0;
		padding: 2px;
		color: var(--color-text-tertiary);
		background: transparent;
		border: none;
		cursor: pointer;
	}

	@media (min-width: 768px) {
		.clear-btn {
			min-width: auto;
			min-height: auto;
			margin: 0;
		}
	}

	.clear-btn:hover {
		color: var(--color-text);
	}

	.kbd-hint {
		font-size: 10px;
		font-family: var(--font-mono);
		color: var(--color-text-tertiary);
		border: 1px solid var(--color-border-subtle);
		padding: 1px 4px;
	}

	.results-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 50;
		margin-top: 4px;
		max-height: 400px;
		overflow-y: auto;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
	}

	.results-section-header {
		padding: 0.5rem 0.75rem 0.25rem;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-text-tertiary);
	}

	.results-loading,
	.results-empty {
		padding: 1rem 0.75rem;
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-tertiary);
		text-align: center;
	}

	.results-empty {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.search-all-link {
		font-size: var(--font-size-xs);
		color: var(--color-text);
		text-decoration: none;
		font-weight: 500;
		letter-spacing: 0.06em;
	}

	.search-all-link:hover {
		text-decoration: underline;
	}

	.result-row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		border-left: 2px solid transparent;
		cursor: pointer;
		text-align: left;
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	.result-row:hover,
	.result-row.selected {
		background: var(--color-bg-subtle);
		border-left-color: var(--color-accent);
	}

	.result-poster {
		width: 28px;
		height: 42px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.result-poster-empty {
		width: 28px;
		height: 42px;
		background: var(--color-bg-subtle);
		flex-shrink: 0;
	}

	.result-pin {
		flex-shrink: 0;
		color: var(--color-text-tertiary);
		margin-left: 8px;
		margin-right: 4px;
	}

	.result-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.result-title {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-meta {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
