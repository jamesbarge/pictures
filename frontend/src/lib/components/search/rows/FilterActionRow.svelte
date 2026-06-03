<script lang="ts">
	import type { FilterActionResult } from '$lib/search/result-types';

	interface Props {
		action: FilterActionResult;
		selected: boolean;
		id: string;
	}

	let { action, selected, id }: Props = $props();
</script>

<button
	type="button"
	role="option"
	aria-selected={selected}
	{id}
	class="row"
	class:selected
	data-result-row
	aria-label="Apply filter: {action.label}. Press Alt Enter to apply."
>
	<span class="chip" aria-hidden="true">FILTER</span>
	<span class="label">{action.label}</span>
	{#if action.shortcut}
		<kbd class="kbd" aria-hidden="true">{action.shortcut}</kbd>
	{/if}
</button>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 6px 12px;
		background: transparent;
		border: none;
		border-left: 2px solid transparent;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: var(--color-text);
		min-height: 36px;
	}
	.row.selected,
	.row:hover {
		background: var(--color-bg-subtle);
		border-left-color: var(--color-accent);
	}
	.chip {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.08em;
		padding: 1px 4px;
		border: 1px solid var(--color-border-subtle);
		color: var(--color-text-tertiary);
		flex-shrink: 0;
	}
	.label {
		font-size: 13px;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.kbd {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		color: var(--color-text-tertiary);
		border: 1px solid var(--color-border-subtle);
		padding: 1px 4px;
		flex-shrink: 0;
	}
</style>
