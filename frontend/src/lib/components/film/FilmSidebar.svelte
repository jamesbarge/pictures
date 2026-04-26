<script lang="ts">
	import type { FilmStatus } from '$lib/types';

	interface Film {
		id: string;
		title: string;
		year: number | null;
		genres: string[];
		directors: string[];
		cast: Array<{ name: string; character?: string }> | null;
		countries: string[];
		languages?: string[];
		tagline: string | null;
	}

	let {
		film,
		currentStatus,
		onToggleStatus
	}: {
		film: Film;
		currentStatus: FilmStatus | null;
		onToggleStatus: (status: FilmStatus) => void;
	} = $props();
</script>

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
				onclick={() => onToggleStatus('want_to_see')}
				aria-pressed={currentStatus === 'want_to_see'}
			>
				Want to see
			</button>
			<button
				type="button"
				class="status-btn"
				class:active={currentStatus === 'not_interested'}
				onclick={() => onToggleStatus('not_interested')}
				aria-pressed={currentStatus === 'not_interested'}
			>
				Not interested
			</button>
		</div>
	</section>
</aside>

<style>
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
	.credits-title :global(.italic-cap) { font-style: italic; }

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
</style>
