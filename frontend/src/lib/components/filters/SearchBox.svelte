<script lang="ts">
	/**
	 * The homepage film search, as one bordered box: input, clear button, cream
	 * search tile. Two copies (top bar and sidebar) share `filters.filmSearch`.
	 */
	import { filters } from '$lib/stores/filters.svelte';

	let { id, height = 48 }: { id: string; height?: number } = $props();

	let input = $state<HTMLInputElement>();
</script>

<div class="search" style:height="{height}px">
	<label for={id} class="sr-only">Search films, cinemas and directors</label>
	<input
		bind:this={input}
		{id}
		type="search"
		autocomplete="off"
		placeholder="Films, cinemas, directors"
		bind:value={filters.filmSearch}
	/>
	{#if filters.filmSearch}
		<button
			type="button"
			class="clear"
			aria-label="Clear search"
			onclick={() => {
				filters.filmSearch = '';
				input?.focus();
			}}
		>
			<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
				<path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" />
			</svg>
		</button>
	{/if}
	<span class="tile" aria-hidden="true">
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
			<circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.5" />
			<path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" />
		</svg>
	</span>
</div>

<style>
	.search {
		--ink: #1f1f1f;
		display: flex;
		width: 100%;
		background: #ffffff;
		color: var(--ink);
		border: 1px solid var(--ink);
		border-radius: 4px;
		box-shadow: 4px 4px 0 0 var(--ink);
		overflow: hidden;
	}

	input {
		flex: 1 1 auto;
		min-width: 0;
		height: 100%;
		padding: 0 12px;
		border: 0;
		background: transparent;
		color: var(--ink);
		font-family: var(--font-sans);
		/* 16px keeps iOS from zooming on focus. */
		font-size: 16px;
		letter-spacing: -0.01em;
		appearance: none;
		border-radius: 0;
	}

	input::placeholder {
		color: #5a5a5a;
		opacity: 1;
		text-transform: uppercase;
		font-size: 13px;
		letter-spacing: 0.04em;
	}

	input::-webkit-search-cancel-button,
	input::-webkit-search-decoration {
		-webkit-appearance: none;
		appearance: none;
	}

	/* Inset ring so the box's overflow never clips it. */
	input:focus-visible,
	.clear:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: -4px;
	}

	.clear {
		flex: 0 0 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0;
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}

	.tile {
		flex: 0 0 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #eae5c2;
		border-left: 1px solid var(--ink);
	}
</style>
