<script lang="ts">
	import type { RecentResult } from '$lib/search/result-types';

	interface Props {
		recent: RecentResult;
		selected: boolean;
		id: string;
	}

	let { recent, selected, id }: Props = $props();
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
	<svg
		aria-hidden="true"
		class="clock"
		width="12"
		height="12"
		viewBox="0 0 12 12"
		fill="none"
	>
		<circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1" opacity="0.5" />
		<path
			d="M6 3V6L8 7.5"
			stroke="currentColor"
			stroke-width="1"
			stroke-linecap="square"
			opacity="0.7"
		/>
	</svg>
	<span class="query">{recent.query}</span>
</button>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 6px 12px 6px 16px;
		background: transparent;
		border: none;
		border-left: 2px solid transparent;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: var(--color-text);
		min-height: 32px;
	}
	.row.selected,
	.row:hover {
		background: var(--color-bg-subtle);
		border-left-color: var(--color-accent);
	}
	.clock {
		color: var(--color-text-tertiary);
		flex-shrink: 0;
	}
	.query {
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
