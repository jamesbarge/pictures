<script lang="ts">
	import type { CinemaResult } from '$lib/search/result-types';

	interface Props {
		cinema: CinemaResult;
		selected: boolean;
		id: string;
	}

	let { cinema, selected, id }: Props = $props();
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
		class="pin"
		width="14"
		height="18"
		viewBox="0 0 12 16"
		fill="none"
	>
		<path
			d="M6 0C2.7 0 0 2.7 0 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.3-2.7-6-6-6z"
			fill="currentColor"
			opacity="0.5"
		/>
	</svg>
	<div class="meta">
		<span class="name">{cinema.name}</span>
		{#if cinema.address || cinema.chain}
			<span class="sub">
				{#if cinema.chain}{cinema.chain}{/if}
				{#if cinema.chain && cinema.address}<span class="sep">·</span>{/if}
				{#if cinema.address}{cinema.address}{/if}
			</span>
		{/if}
	</div>
</button>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 8px 12px;
		background: transparent;
		border: none;
		border-left: 2px solid transparent;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: var(--color-text);
	}
	.row.selected,
	.row:hover {
		background: var(--color-bg-subtle);
		border-left-color: var(--color-accent);
	}
	.pin {
		color: var(--color-text-tertiary);
		flex-shrink: 0;
		margin-left: 4px;
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	.name {
		font-size: 14px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sub {
		font-size: 11px;
		color: var(--color-text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sep {
		margin: 0 4px;
	}
</style>
