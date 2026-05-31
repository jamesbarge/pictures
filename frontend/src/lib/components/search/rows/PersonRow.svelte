<script lang="ts">
	import type { PersonResult } from '$lib/search/result-types';

	interface Props {
		person: PersonResult;
		selected: boolean;
		id: string;
	}

	let { person, selected, id }: Props = $props();

	const countLabel = $derived(
		`${person.filmCount} ${person.filmCount === 1 ? 'film' : 'films'} showing`
	);
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
		class="person"
		width="16"
		height="16"
		viewBox="0 0 16 16"
		fill="none"
	>
		<circle cx="8" cy="5" r="3" fill="currentColor" opacity="0.5" />
		<path
			d="M2 15c0-3.3 2.7-6 6-6s6 2.7 6 6"
			stroke="currentColor"
			stroke-width="1.5"
			opacity="0.5"
		/>
	</svg>
	<div class="meta">
		<span class="name">{person.name}</span>
		<span class="sub">
			{person.role === 'director' ? 'Director' : 'Actor'}<span class="sep">·</span>{countLabel}
		</span>
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
	.person {
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
