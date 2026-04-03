<script lang="ts">
	import { filters } from '$lib/stores/filters.svelte';
</script>

{#if filters.activeFilterCount > 0}
	<button class="clear-btn" onclick={() => filters.clearAll()}>
		CLEAR ({filters.activeFilterCount})
	</button>
{/if}

<style>
	.clear-btn {
		padding: 0.375rem 0.625rem;
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-accent);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: opacity var(--duration-fast) var(--ease-sharp);
	}

	.clear-btn:hover {
		opacity: 0.7;
	}
</style>
