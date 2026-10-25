<script lang="ts">
	/**
	 * Search on pages without the homepage's live film filter: opens ⌘K, which
	 * searches films, cinemas and people across the site.
	 */
	import { palette } from '$lib/stores/palette.svelte';
</script>

<button
	type="button"
	class="palette-btn"
	aria-label="Search films, cinemas and directors"
	aria-haspopup="dialog"
	onclick={() => palette.openPalette()}
>
	<span class="label">Search films</span>
	<span class="tile" aria-hidden="true">
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
			<circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.5" />
			<path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" />
		</svg>
	</span>
</button>

<style>
	.palette-btn {
		--ink: #1f1f1f;
		display: flex;
		align-items: stretch;
		width: 100%;
		height: 48px;
		padding: 0;
		background: #ffffff;
		color: #5a5a5a;
		border: 1px solid var(--ink);
		border-radius: 4px;
		box-shadow: 4px 4px 0 0 var(--ink);
		overflow: hidden;
		cursor: pointer;
		font-family: var(--font-sans);
		font-size: 13px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		text-align: left;
	}

	.palette-btn:hover .label { color: var(--ink); }

	.palette-btn:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: -4px;
	}

	.label {
		flex: 1 1 auto;
		min-width: 0;
		padding: 0 12px;
		line-height: 46px;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.tile {
		flex: 0 0 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #eae5c2;
		color: var(--ink);
		border-left: 1px solid var(--ink);
	}
</style>
