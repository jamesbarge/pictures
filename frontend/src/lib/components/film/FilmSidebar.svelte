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
		<h3 class="credits-title">Status</h3>
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
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.credits-section, .status-section, .tagline-section {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: var(--color-surface);
	}

	.credits-title {
		margin: 0;
		padding: 8px 14px;
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #eae5c2;
		background: #1f1f1f;
	}

	.credit-row {
		padding: 8px 14px;
		display: flex;
		gap: 12px;
		align-items: baseline;
		border-top: 1px solid var(--color-border);
	}

	.credit-row:first-of-type { border-top: none; }

	.credit-key {
		font-family: var(--font-sans);
		font-size: 10px;
		font-weight: 700;
		color: var(--color-text-tertiary);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		min-width: 80px;
		padding-top: 2px;
	}

	.credit-val {
		flex: 1;
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 500;
		color: var(--color-text);
		line-height: 1.35;
		letter-spacing: -0.005em;
	}

	.tagline-section {
		padding: 14px;
	}

	.tagline {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 14px;
		font-weight: 500;
		color: var(--color-text);
		line-height: 1.4;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.status-row {
		display: flex;
		border-top: 1px solid var(--color-border);
	}

	.status-btn {
		flex: 1;
		padding: 12px 10px;
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text);
		background: var(--color-surface);
		border: none;
		border-right: 1px solid var(--color-border);
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp);
	}

	.status-btn:last-child { border-right: none; }

	.status-btn:hover { background: var(--color-cream); }

	.status-btn.active {
		background: var(--color-text);
		color: var(--color-cream);
	}
</style>
