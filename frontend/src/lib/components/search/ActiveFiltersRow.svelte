<script lang="ts">
	/**
	 * Renders parsed-intent chips beneath the palette input.
	 *
	 * Chips live OUTSIDE the `<input>` (per WAI-ARIA 1.2 — inputs are
	 * leaf elements with no interactive descendants). The visual
	 * impression of "chips inside the input" comes from the absence of
	 * a separator between this row and the input above it.
	 */
	import Chip from './Chip.svelte';
	import type { ChipDescriptor } from '$lib/search/parse-query';

	interface Props {
		chips: ChipDescriptor[];
		onRemove: (id: string) => void;
	}

	let { chips, onRemove }: Props = $props();
</script>

{#if chips.length > 0}
	<div class="row" role="list" aria-label="Active filters">
		{#each chips as chip (chip.id)}
			<div role="listitem">
				<Chip label={chip.label} onRemove={() => onRemove(chip.id)} />
			</div>
		{/each}
	</div>
{/if}

<style>
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 6px 10px 8px;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}
</style>
