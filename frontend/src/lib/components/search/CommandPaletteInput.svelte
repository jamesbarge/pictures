<script lang="ts">
	/**
	 * The palette's search input row.
	 *
	 * Wraps a native <input role="combobox"> with the ARIA combobox
	 * attributes the WAI-ARIA APG calls for. The actual listbox lives
	 * in the parent CommandPalette so we can sit it below the chip row.
	 */
	import { palette } from '$lib/stores/palette.svelte';

	interface Props {
		listboxId: string;
		activeDescendant: string | undefined;
		placeholder?: string;
		inputRef?: HTMLInputElement | null;
	}

	let {
		listboxId,
		activeDescendant,
		placeholder = 'Search films · cinemas · tonight · 70mm…',
		inputRef = $bindable<HTMLInputElement | null>(null)
	}: Props = $props();

	function clear() {
		palette.setQuery('');
		inputRef?.focus();
	}
</script>

<div class="row">
	<svg
		class="icon"
		aria-hidden="true"
		width="14"
		height="14"
		viewBox="0 0 14 14"
		fill="none"
	>
		<circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2" />
		<line
			x1="9.5"
			y1="9.5"
			x2="13"
			y2="13"
			stroke="currentColor"
			stroke-width="1.2"
			stroke-linecap="square"
		/>
	</svg>

	<input
		bind:this={inputRef}
		bind:value={
			() => palette.query,
			(v) => palette.setQuery(v)
		}
		type="search"
		role="combobox"
		inputmode="search"
		enterkeyhint="search"
		autocapitalize="off"
		autocomplete="off"
		spellcheck="false"
		{placeholder}
		class="input"
		aria-label="Search films, cinemas, directors, screenings, festivals"
		aria-expanded="true"
		aria-controls={listboxId}
		aria-autocomplete="list"
		aria-activedescendant={activeDescendant}
	/>

	{#if palette.query}
		<button
			type="button"
			class="clear"
			onclick={clear}
			aria-label="Clear search"
		>
			<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none">
				<path
					d="M1 1L9 9M9 1L1 9"
					stroke="currentColor"
					stroke-width="1.2"
					stroke-linecap="square"
				/>
			</svg>
		</button>
	{:else}
		<kbd class="kbd" aria-hidden="true">ESC</kbd>
	{/if}
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 12px 10px;
		min-height: 48px;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.icon {
		flex-shrink: 0;
		color: var(--color-text-tertiary);
	}

	.input {
		flex: 1;
		min-width: 0;
		border: none;
		background: transparent;
		color: var(--color-text);
		font-size: 16px;
		font-family: var(--font-display, 'Space Grotesk', sans-serif);
		outline: none;
	}

	@media (min-width: 768px) {
		.input {
			font-size: 15px;
		}
	}

	.input::placeholder {
		color: var(--color-text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 11px;
	}

	.input::-webkit-search-cancel-button,
	.input::-webkit-search-decoration {
		-webkit-appearance: none;
		appearance: none;
	}

	.clear {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 28px;
		min-height: 28px;
		padding: 4px;
		color: var(--color-text-tertiary);
		background: transparent;
		border: none;
		cursor: pointer;
	}

	.clear:hover,
	.clear:focus-visible {
		color: var(--color-text);
	}

	.kbd {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		color: var(--color-text-tertiary);
		border: 1px solid var(--color-border-subtle);
		padding: 2px 5px;
		letter-spacing: 0.05em;
	}
</style>
