<script lang="ts">
	import { preferences } from '$lib/stores/preferences.svelte';
</script>

<div class="view-toggle" role="radiogroup" aria-label="View mode">
	<button
		class="toggle-btn"
		class:active={preferences.viewMode === 'poster'}
		onclick={() => (preferences.viewMode = 'poster')}
		aria-label="Poster view"
		title="Poster view"
	>
		<svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
			<rect x="1" y="1" width="5" height="5" stroke="currentColor" stroke-width="1.2"/>
			<rect x="8" y="1" width="5" height="5" stroke="currentColor" stroke-width="1.2"/>
			<rect x="1" y="8" width="5" height="5" stroke="currentColor" stroke-width="1.2"/>
			<rect x="8" y="8" width="5" height="5" stroke="currentColor" stroke-width="1.2"/>
		</svg>
	</button>
	<button
		class="toggle-btn"
		class:active={preferences.viewMode === 'text'}
		onclick={() => (preferences.viewMode = 'text')}
		aria-label="Text view"
		title="Text view"
	>
		<svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
			<line x1="1" y1="2" x2="13" y2="2" stroke="currentColor" stroke-width="1.2"/>
			<line x1="1" y1="5.5" x2="13" y2="5.5" stroke="currentColor" stroke-width="1.2"/>
			<line x1="1" y1="9" x2="13" y2="9" stroke="currentColor" stroke-width="1.2"/>
			<line x1="1" y1="12.5" x2="13" y2="12.5" stroke="currentColor" stroke-width="1.2"/>
		</svg>
	</button>
</div>

<style>
	.view-toggle {
		display: flex;
		border: 1px solid var(--color-border-subtle);
	}

	.toggle-btn {
		min-width: 2.75rem;
		min-height: 2.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-right: 1px solid var(--color-border-subtle);
		color: var(--color-text-tertiary);
		cursor: pointer;
		transition: color var(--duration-fast) var(--ease-sharp),
			background-color var(--duration-fast) var(--ease-sharp);
	}

	.toggle-btn:last-child {
		border-right: none;
	}

	.toggle-btn:hover {
		color: var(--color-text-secondary);
	}

	.toggle-btn.active {
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
	}
</style>
