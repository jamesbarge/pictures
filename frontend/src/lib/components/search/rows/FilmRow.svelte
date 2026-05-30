<script lang="ts">
	/** A single film row in the palette result list. */
	import type { FilmResult } from '$lib/search/result-types';
	import { getPosterImageAttributes } from '$lib/utils';

	interface Props {
		film: FilmResult;
		selected: boolean;
		id: string;
	}

	let { film, selected, id }: Props = $props();

	const rating = $derived(film.tmdbRating != null ? film.tmdbRating.toFixed(1) : null);
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
	{#if film.posterUrl}
		{@const posterImage = getPosterImageAttributes(film.posterUrl, {
			baseSize: 'w92',
			srcSetSizes: ['w92', 'w154'],
			sizes: '36px'
		})}
		<img
			src={posterImage?.src ?? film.posterUrl}
			srcset={posterImage?.srcset}
			sizes={posterImage?.sizes}
			alt=""
			class="poster"
			width="36"
			height="54"
			loading="lazy"
			decoding="async"
		/>
	{:else}
		<div class="poster poster-empty" aria-hidden="true"></div>
	{/if}
	<div class="meta">
		<span class="title">{film.title}</span>
		<span class="sub">
			{#if film.year}{film.year}{/if}
			{#if film.year && film.directors.length}<span class="sep">·</span>{/if}
			{#if film.directors.length}{film.directors[0]}{/if}
		</span>
	</div>
	{#if rating != null && film.tmdbRating != null && film.tmdbRating >= 7}
		<span class="rating" aria-label="TMDB rating {rating}">
			★ {rating}
		</span>
	{/if}
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
		width: 36px;
		height: 54px;
		object-fit: cover;
		flex-shrink: 0;
	}
	.poster-empty {
		background: var(--color-bg-subtle);
		width: 36px;
		height: 54px;
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
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sep {
		margin: 0 4px;
	}
	.rating {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 11px;
		color: var(--color-text);
		flex-shrink: 0;
	}
</style>
