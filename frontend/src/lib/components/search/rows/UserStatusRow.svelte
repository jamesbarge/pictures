<script lang="ts">
	import type { UserStatusResult } from '$lib/search/result-types';
	import { getPosterImageAttributes } from '$lib/utils';

	interface Props {
		status: UserStatusResult;
		selected: boolean;
		id: string;
	}

	let { status, selected, id }: Props = $props();

	const label = $derived(
		status.status === 'want_to_see'
			? 'WATCHLIST'
			: status.status === 'seen'
				? 'SEEN'
				: 'NOT INTERESTED'
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
	{#if status.filmPosterUrl}
		{@const posterImage = getPosterImageAttributes(status.filmPosterUrl, {
			baseSize: 'w92',
			srcSetSizes: ['w92', 'w154'],
			sizes: '32px'
		})}
		<img
			src={posterImage?.src ?? status.filmPosterUrl}
			srcset={posterImage?.srcset}
			sizes={posterImage?.sizes}
			alt=""
			class="poster"
			width="32"
			height="48"
			loading="lazy"
			decoding="async"
		/>
	{:else}
		<div class="poster poster-empty" aria-hidden="true"></div>
	{/if}
	<div class="meta">
		<span class="title">{status.filmTitle}</span>
		{#if status.filmYear}<span class="sub">{status.filmYear}</span>{/if}
	</div>
	<span class="pill">{label}</span>
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
	.poster {
		width: 32px;
		height: 48px;
		object-fit: cover;
		flex-shrink: 0;
	}
	.poster-empty {
		background: var(--color-bg-subtle);
		width: 32px;
		height: 48px;
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	.title {
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
	}
	.pill {
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.06em;
		padding: 2px 4px;
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
		flex-shrink: 0;
	}
</style>
