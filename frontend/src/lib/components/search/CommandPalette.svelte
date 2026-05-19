<script lang="ts">
	/**
	 * Global cmd+k command palette — refined brutalist shell.
	 *
	 * Step 5: visible UI shell (modal + input + chip row + empty result
	 * region). Step 6 wires the result list; step 7 hooks the server
	 * fetch; step 8 adds filter-as-result rows.
	 *
	 * Presentation switches on `media.isDesktop`:
	 *  - Desktop (≥ 768px): centered modal at top: 12vh, 640px wide
	 *  - Mobile: full-screen sheet
	 *
	 * Backdrop is FLAT 0.45 opacity (not blurred) — intentional so the
	 * calendar behind the modal remains legible when step 8 lands the
	 * live filter-mutation feature.
	 */
	import { onMount, tick } from 'svelte';
	import { Dialog } from 'bits-ui';
	import { palette } from '$lib/stores/palette.svelte';
	import { media } from '$lib/stores/media.svelte';
	import CommandPaletteInput from './CommandPaletteInput.svelte';
	import ActiveFiltersRow from './ActiveFiltersRow.svelte';
	import ResultsList from './ResultsList.svelte';

	const LISTBOX_ID = 'cmdk-listbox';
	const ROW_ID_PREFIX = 'cmdk-opt';

	let inputRef = $state<HTMLInputElement | null>(null);
	let navMode = $state<'keyboard' | 'mouse'>('keyboard');

	const chips = $derived(palette.parsed.chipDescriptors);
	const isDesktop = $derived(media.isDesktop);
	const rowCount = $derived(palette.flatRows.length);
	const activeDescendant = $derived<string | undefined>(
		rowCount > 0 ? `${ROW_ID_PREFIX}-${palette.selectedIndex}` : undefined
	);
	const hasQuery = $derived(palette.query.length > 0);

	function handleOpenChange(next: boolean) {
		if (next) palette.openPalette('click');
		else palette.closePalette();
	}

	function removeChip(id: string) {
		// Step 8 will implement actual chip-peeling via filter mutations.
		// For now, removing a chip clears the whole query — this is a
		// stopgap that keeps the UI consistent until intent-to-actions
		// lands.
		palette.setQuery('');
		void id;
	}

	// Focus the input on every open
	$effect(() => {
		if (palette.open) {
			void tick().then(() => inputRef?.focus({ preventScroll: true }));
		}
	});

	function handlePaletteKeydown(e: KeyboardEvent) {
		if (!palette.open) return;

		// Track keyboard vs mouse mode so hover styles defer to keyboard
		// nav per the Raycast pattern (see refined-brutalist UI spec).
		navMode = 'keyboard';

		if (e.key === 'Escape') {
			e.preventDefault();
			palette.closePalette();
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			palette.selectNext();
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			palette.selectPrevious();
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') {
			e.preventDefault();
			palette.selectLast();
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') {
			e.preventDefault();
			palette.selectFirst();
			return;
		}
		// Enter / Cmd+Enter / Alt+Enter activation handled in step 7
		// once the actual result actions are wired.
	}

	function handlePointerMove() {
		if (navMode !== 'mouse') navMode = 'mouse';
	}

	onMount(() => {
		document.addEventListener('keydown', handlePaletteKeydown);
		document.addEventListener('pointermove', handlePointerMove, { passive: true });
		return () => {
			document.removeEventListener('keydown', handlePaletteKeydown);
			document.removeEventListener('pointermove', handlePointerMove);
		};
	});
</script>

<Dialog.Root open={palette.open} onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay class="cmdk-overlay" />
		<Dialog.Content
			class={isDesktop ? 'cmdk-content cmdk-desktop' : 'cmdk-content cmdk-mobile'}
			aria-describedby={undefined}
			data-nav-mode={navMode}
		>
			<Dialog.Title class="sr-only">Search pictures.london</Dialog.Title>

			<CommandPaletteInput
				listboxId={LISTBOX_ID}
				{activeDescendant}
				bind:inputRef
			/>

			<ActiveFiltersRow {chips} onRemove={removeChip} />

			<div id={LISTBOX_ID} role="listbox" aria-label="Search results" class="cmdk-listbox">
				{#if rowCount === 0 && !hasQuery}
					<div class="empty">
						<span>Start typing — try <em>tonight</em>, <em>70mm</em>, or <em>curzon</em></span>
					</div>
				{:else if rowCount === 0 && hasQuery}
					<div class="empty">
						<span>No results for "<em>{palette.query}</em>"</span>
					</div>
				{:else}
					<ResultsList idPrefix={ROW_ID_PREFIX} />
				{/if}
			</div>

			{#if isDesktop}
				<div class="footer" aria-hidden="true">
					<span>↑↓ navigate · ↵ open · ⌘↵ new tab · ⌥↵ filter · ESC close</span>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.cmdk-overlay) {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		z-index: 100;
	}

	:global(.cmdk-content) {
		position: fixed;
		z-index: 101;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		color: var(--color-text);
	}

	:global(.cmdk-desktop) {
		top: 12vh;
		left: 50%;
		transform: translateX(-50%);
		width: 640px;
		max-width: calc(100vw - 32px);
		max-height: min(560px, calc(100vh - 24vh));
	}

	:global(.cmdk-mobile) {
		inset: 0;
		max-height: 100dvh;
	}

	.cmdk-listbox {
		flex: 1;
		overflow-y: auto;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.empty {
		padding: 24px 16px;
		text-align: center;
		color: var(--color-text-tertiary);
		font-size: 13px;
	}

	.empty em {
		font-style: normal;
		font-weight: 600;
		color: var(--color-text);
		padding: 0 2px;
	}

	.footer {
		padding: 8px 12px;
		border-top: 1px solid var(--color-border-subtle);
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 10px;
		color: var(--color-text-tertiary);
		letter-spacing: 0.04em;
		background: var(--color-surface);
	}

	:global(.sr-only) {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
