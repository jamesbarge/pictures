<script lang="ts">
	import type { SeasonResult } from '$lib/search/result-types';

	interface Props {
		season: SeasonResult;
		selected: boolean;
		id: string;
	}

	let { season, selected, id }: Props = $props();
</script>

<button
	type="button"
	role="option"
	aria-selected={selected}
	{id}
	class="row"
	class:selected
	data-result-row
>
	<span class="name">{season.name}</span>
	{#if season.directorName}
		<span class="sep">·</span>
		<span class="director">{season.directorName}</span>
	{/if}
</button>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
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
	.name {
		font-size: 13px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sep {
		color: var(--color-text-tertiary);
	}
	.director {
		font-size: 11px;
		color: var(--color-text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
</style>
