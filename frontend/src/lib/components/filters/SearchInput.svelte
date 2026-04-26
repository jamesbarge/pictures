<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { getPosterImageAttributes } from '$lib/utils';
	import { apiGet } from '$lib/api/client';
	import {
		trackSearch,
		trackSearchNoResults,
		trackSearchResultClick,
		trackSearchCinemaClick
	} from '$lib/analytics/posthog';
	import { recentSearches } from '$lib/stores/recent-searches.svelte';

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

	const DEBOUNCE_MS = 120;
	const MIN_QUERY_LEN = 2;

	let query = $state('');
	let films = $state<SearchResult[]>([]);
	let cinemas = $state<CinemaResult[]>([]);
	let open = $state(false);
	let selectedIndex = $state(-1);
	let inputEl = $state<HTMLInputElement>();
	let loading = $state(false);
	let liveStatus = $state('');

	const recents = $derived(recentSearches.entries);
	const showRecents = $derived(query.length === 0 && recents.length > 0);
	const totalResults = $derived(films.length + cinemas.length);
	const totalNavigable = $derived(showRecents ? recents.length : totalResults);

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let inFlight: AbortController | null = null;
	let queuedAnnouncement: ReturnType<typeof setTimeout> | null = null;

	function scheduleSearch(q: string) {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => doSearch(q), DEBOUNCE_MS);
	}

	async function doSearch(q: string) {
		if (q.length < MIN_QUERY_LEN) {
			films = [];
			cinemas = [];
			loading = false;
			return;
		}

		// Abort any in-flight request — we only care about the latest query.
		if (inFlight) inFlight.abort();
		const controller = new AbortController();
		inFlight = controller;

		loading = true;
		const startedAt = performance.now();
		try {
			const res = await apiGet<{ results: SearchResult[]; cinemas: CinemaResult[] }>(
				`/api/films/search?q=${encodeURIComponent(q)}`,
				{ signal: controller.signal }
			);
			if (controller.signal.aborted) return;
			films = res.results;
			cinemas = res.cinemas;
			const total = films.length + cinemas.length;
			const latencyMs = Math.round(performance.now() - startedAt);
			trackSearch(q, total, {
				latencyMs,
				filmsCount: films.length,
				cinemasCount: cinemas.length
			});
			if (total === 0) trackSearchNoResults(q);
			announceResults(total);
		} catch (e) {
			if (controller.signal.aborted) return;
			console.error('[search] Failed to search:', e instanceof Error ? e.message : e);
			films = [];
			cinemas = [];
		} finally {
			if (inFlight === controller) {
				inFlight = null;
				loading = false;
			}
		}
	}

	function announceResults(total: number) {
		if (queuedAnnouncement) clearTimeout(queuedAnnouncement);
		// Delay slightly so the announcement reflects the settled state, not
		// every keystroke. Avoids screen-reader spam.
		queuedAnnouncement = setTimeout(() => {
			liveStatus =
				total === 0
					? `No results for ${query}`
					: `${total} result${total === 1 ? '' : 's'} for ${query}`;
		}, 250);
	}

	function handleInput() {
		selectedIndex = -1;
		// Only open the dropdown when we'll show *something*: live results
		// (≥ MIN_QUERY_LEN) or the recents drawer (when query is empty).
		// Closing for sub-min queries avoids an empty panel flash on the
		// 1-char transition between recents and live results.
		open = query.length >= MIN_QUERY_LEN || (query.length === 0 && recents.length > 0);
		if (query.length === 0) {
			if (inFlight) inFlight.abort();
			films = [];
			cinemas = [];
			loading = false;
			return;
		}
		scheduleSearch(query);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, totalNavigable - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, -1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (showRecents && selectedIndex >= 0) {
				applyRecent(recents[selectedIndex]);
			} else if (!showRecents && selectedIndex >= 0) {
				navigateToResult(selectedIndex);
			} else if (query.trim().length >= MIN_QUERY_LEN) {
				submitFullSearch();
			}
		} else if (e.key === 'Escape') {
			open = false;
			inputEl?.blur();
		}
	}

	function submitFullSearch() {
		const q = query.trim();
		if (q.length < MIN_QUERY_LEN) return;
		recentSearches.add(q);
		open = false;
		goto(`/search?q=${encodeURIComponent(q)}`);
		query = '';
	}

	function navigateToResult(index: number) {
		const q = query.trim();
		if (index < films.length) {
			const film = films[index];
			trackSearchResultClick(
				q,
				{ filmId: film.id, filmTitle: film.title, filmYear: film.year },
				index,
				'film'
			);
			if (q.length >= MIN_QUERY_LEN) recentSearches.add(q);
			goto(`/film/${film.id}`);
		} else {
			const cinemaIndex = index - films.length;
			const cinema = cinemas[cinemaIndex];
			trackSearchCinemaClick(q, cinema.id, cinema.name, index);
			goto(`/cinemas/${cinema.id}`);
		}
		open = false;
		query = '';
		films = [];
		cinemas = [];
	}

	function applyRecent(q: string) {
		query = q;
		open = true;
		selectedIndex = -1;
		// Jump straight to typeahead results for that query.
		scheduleSearch(q);
	}

	async function handleFocus() {
		if (query.length >= MIN_QUERY_LEN) {
			open = true;
		} else if (recents.length > 0) {
			open = true;
		}
		// Ensure dropdown geometry is settled before keyboard nav.
		await tick();
	}

	function handleBlur() {
		// Defer so click handlers on results fire first.
		setTimeout(() => (open = false), 200);
	}

	function clearSearch() {
		query = '';
		films = [];
		cinemas = [];
		if (inFlight) inFlight.abort();
		open = recents.length > 0;
		inputEl?.focus();
	}

	function clearOneRecent(q: string, e: MouseEvent) {
		e.stopPropagation();
		recentSearches.remove(q);
	}

	// Visual match highlighting: split a string around the case-insensitive
	// occurrence(s) of the query. Returns alternating non-match / match parts.
	function highlightParts(text: string, q: string): Array<{ text: string; match: boolean }> {
		if (!q || q.length < MIN_QUERY_LEN) return [{ text, match: false }];
		const parts: Array<{ text: string; match: boolean }> = [];
		const lowerText = text.toLowerCase();
		const lowerQ = q.toLowerCase();
		let i = 0;
		let idx = lowerText.indexOf(lowerQ, i);
		while (idx !== -1) {
			if (idx > i) parts.push({ text: text.slice(i, idx), match: false });
			parts.push({ text: text.slice(idx, idx + q.length), match: true });
			i = idx + q.length;
			idx = lowerText.indexOf(lowerQ, i);
		}
		if (i < text.length) parts.push({ text: text.slice(i), match: false });
		return parts;
	}

	const activeDescendant = $derived.by(() => {
		if (!open || selectedIndex < 0) return undefined;
		if (showRecents) return `search-opt-recent-${selectedIndex}`;
		return `search-opt-${selectedIndex}`;
	});

	onMount(() => {
		function globalKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				inputEl?.focus();
			}
		}
		document.addEventListener('keydown', globalKeydown);
		return () => {
			document.removeEventListener('keydown', globalKeydown);
			if (debounceTimer) clearTimeout(debounceTimer);
			if (queuedAnnouncement) clearTimeout(queuedAnnouncement);
			if (inFlight) inFlight.abort();
		};
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
			type="search"
			role="combobox"
			inputmode="search"
			enterkeyhint="search"
			autocapitalize="off"
			autocomplete="off"
			spellcheck="false"
			placeholder="Search films, cinemas, directors..."
			class="search-input"
			aria-label="Search films, cinemas, directors"
			aria-expanded={open}
			aria-controls={open ? 'search-results' : undefined}
			aria-autocomplete="list"
			aria-activedescendant={activeDescendant}
		/>
		{#if query}
			<button class="clear-btn" type="button" onclick={clearSearch} aria-label="Clear search">
				<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none">
					<path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"/>
				</svg>
			</button>
		{:else}
			<kbd class="kbd-hint" aria-hidden="true">⌘K</kbd>
		{/if}
	</div>

	<!-- visually-hidden polite live region for screen-reader result counts -->
	<div class="sr-only" aria-live="polite" aria-atomic="true">{liveStatus}</div>

	{#if open}
		<div class="results-dropdown" id="search-results" role="listbox" aria-label="Search results">
			{#if showRecents}
				<div class="results-section-header">
					<span>RECENT</span>
					<button
						class="recents-clear"
						type="button"
						onclick={() => recentSearches.clear()}
						aria-label="Clear all recent searches"
					>CLEAR</button>
				</div>
				{#each recents as recent, i (recent)}
					<!-- Recent row uses div+role=option (not <button>) so the inline
					     remove button can nest without invalid HTML. Listbox
					     keyboard nav happens on the input via aria-activedescendant. -->
					<div
						class="result-row recent-row"
						class:selected={selectedIndex === i}
						id="search-opt-recent-{i}"
						role="option"
						aria-selected={selectedIndex === i}
						tabindex="-1"
						onmouseenter={() => (selectedIndex = i)}
						onclick={() => applyRecent(recent)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								applyRecent(recent);
							}
						}}
					>
						<svg aria-hidden="true" class="result-clock" width="12" height="12" viewBox="0 0 12 12" fill="none">
							<circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1" opacity="0.5"/>
							<path d="M6 3V6L8 7.5" stroke="currentColor" stroke-width="1" stroke-linecap="square" opacity="0.7"/>
						</svg>
						<div class="result-info">
							<span class="result-title">{recent}</span>
						</div>
						<button
							type="button"
							class="recent-remove"
							onclick={(e) => clearOneRecent(recent, e)}
							aria-label="Remove {recent} from recent searches"
						>
							<svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" fill="none">
								<path d="M1 1L7 7M7 1L1 7" stroke="currentColor" stroke-width="1" stroke-linecap="square"/>
							</svg>
						</button>
					</div>
				{/each}
			{:else if loading && totalResults === 0}
				<div class="results-loading">SEARCHING...</div>
			{:else if totalResults === 0 && query.length >= MIN_QUERY_LEN}
				<div class="results-empty">
					<span>NO RESULTS</span>
					<a href="/search?q={encodeURIComponent(query)}" class="search-all-link" onclick={() => { open = false; query = ''; }}>
						SEARCH ALL DATES →
					</a>
				</div>
			{:else}
				{#if films.length > 0}
					<div class="results-section-header"><span>FILMS</span></div>
					{#each films as film, i (film.id)}
						<button
							type="button"
							class="result-row"
							class:selected={selectedIndex === i}
							id="search-opt-{i}"
							role="option"
							aria-selected={selectedIndex === i}
							onmouseenter={() => (selectedIndex = i)}
							onclick={() => navigateToResult(i)}
						>
							{#if film.posterUrl}
								{@const posterImage = getPosterImageAttributes(film.posterUrl, {
									baseSize: 'w92',
									srcSetSizes: ['w92', 'w154'],
									sizes: '28px'
								})}
								<img
									src={posterImage?.src ?? film.posterUrl}
									srcset={posterImage?.srcset}
									sizes={posterImage?.sizes}
									alt=""
									class="result-poster"
									loading="lazy"
									decoding="async"
									width="28"
									height="42"
								/>
							{:else}
								<div class="result-poster-empty"></div>
							{/if}
							<div class="result-info">
								<span class="result-title">
									{#each highlightParts(film.title, query) as part, pi (pi)}{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
								</span>
								<span class="result-meta">
									{film.year ?? ''}{#if film.directors.length} ·
										{#each highlightParts(film.directors[0], query) as part, pi (pi)}{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
									{/if}
								</span>
							</div>
						</button>
					{/each}
				{/if}
				{#if cinemas.length > 0}
					<div class="results-section-header"><span>CINEMAS</span></div>
					{#each cinemas as cinema, i (cinema.id)}
						{@const idx = films.length + i}
						<button
							type="button"
							class="result-row"
							class:selected={selectedIndex === idx}
							id="search-opt-{idx}"
							role="option"
							aria-selected={selectedIndex === idx}
							onmouseenter={() => (selectedIndex = idx)}
							onclick={() => navigateToResult(idx)}
						>
							<svg aria-hidden="true" class="result-pin" width="12" height="16" viewBox="0 0 12 16" fill="none">
								<path d="M6 0C2.7 0 0 2.7 0 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.3-2.7-6-6-6z" fill="currentColor" opacity="0.4"/>
							</svg>
							<div class="result-info">
								<span class="result-title">
									{#each highlightParts(cinema.name, query) as part, pi (pi)}{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
								</span>
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
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

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

	/* 16px mobile base avoids iOS Safari's auto-zoom on focus (triggers below
	   16px). Desktop overrides to `--font-size-sm` for visual consistency.
	   `inputmode="search"` and `enterkeyhint="search"` on the element ensure
	   the iOS keyboard shows the right return key + search-tuned layout. */
	.search-input {
		flex: 1;
		border: none;
		background: transparent;
		font-size: 16px;
		color: var(--color-text);
		outline: none;
	}

	/* Strip the WebKit cancel button — we render our own clear button. */
	.search-input::-webkit-search-cancel-button,
	.search-input::-webkit-search-decoration {
		-webkit-appearance: none;
		appearance: none;
	}

	@media (min-width: 768px) {
		.search-input {
			font-size: var(--font-size-sm);
		}
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
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem 0.25rem;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-text-tertiary);
	}

	.recents-clear {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-text-tertiary);
		background: transparent;
		border: none;
		padding: 2px 4px;
		cursor: pointer;
	}

	.recents-clear:hover {
		color: var(--color-text);
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

	.result-row mark {
		background: transparent;
		color: var(--color-text);
		font-weight: 600;
	}

	.recent-row {
		padding-left: 0.875rem;
	}

	.result-clock {
		flex-shrink: 0;
		color: var(--color-text-tertiary);
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
		flex: 1;
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

	.recent-remove {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 28px;
		min-height: 28px;
		padding: 4px;
		color: var(--color-text-tertiary);
		background: transparent;
		border: none;
		cursor: pointer;
		opacity: 0;
		transition: opacity var(--duration-fast) var(--ease-sharp);
	}

	.result-row:hover .recent-remove,
	.result-row.selected .recent-remove,
	.recent-remove:focus {
		opacity: 1;
	}

	.recent-remove:hover {
		color: var(--color-text);
	}
</style>
