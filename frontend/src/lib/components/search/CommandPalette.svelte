<script lang="ts">
	/**
	 * Global cmd+k command palette — refined brutalist shell.
	 *
	 * Step 7: server-fetch wiring + row activation. Each keystroke calls
	 * `palette.setQuery`, which (in the palette store) debounces 80ms,
	 * aborts any in-flight request, fires `/api/films/search`, and maps
	 * the response into the `PaletteResults` shape ResultsList renders.
	 *
	 * Activation:
	 *   - Enter         → open default (close palette, navigate)
	 *   - Cmd/Ctrl+Enter → open in new tab (palette stays open)
	 *   - Alt+Enter     → apply as filter (step 8 — currently no-ops for
	 *                     filter rows, falls through to open for entities)
	 *   - Click on row  → same as Enter
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
	import { palette, type ActivationMode } from '$lib/stores/palette.svelte';
	import { media } from '$lib/stores/media.svelte';
	import CommandPaletteInput from './CommandPaletteInput.svelte';
	import ActiveFiltersRow from './ActiveFiltersRow.svelte';
	import ResultsList from './ResultsList.svelte';

	const LISTBOX_ID = 'cmdk-listbox';
	const ROW_ID_PREFIX = 'cmdk-opt';
	const ROW_ID_RE = /^cmdk-opt-(\d+)$/;

	let inputRef = $state<HTMLInputElement | null>(null);
	let navMode = $state<'keyboard' | 'mouse'>('keyboard');

	const chips = $derived(palette.parsed.chipDescriptors);
	const isDesktop = $derived(media.isDesktop);
	const rowCount = $derived(palette.flatRows.length);
	const activeDescendant = $derived<string | undefined>(
		rowCount > 0 ? `${ROW_ID_PREFIX}-${palette.selectedIndex}` : undefined
	);
	const hasQuery = $derived(palette.query.length > 0);
	const isLoading = $derived(palette.isLoading);

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

	function rowIndexFromTarget(target: EventTarget | null): number | null {
		if (!(target instanceof Element)) return null;
		const button = target.closest('[role="option"]');
		if (!(button instanceof HTMLElement) || !button.id) return null;
		const match = button.id.match(ROW_ID_RE);
		if (!match) return null;
		const idx = Number(match[1]);
		return Number.isFinite(idx) ? idx : null;
	}

	function handleListboxClick(e: MouseEvent) {
		const idx = rowIndexFromTarget(e.target);
		if (idx === null) return;
		const row = palette.flatRows[idx];
		if (!row) return;
		// Sync selectedIndex before activation so analytics/UI agree.
		palette.setSelectedIndex(idx);
		// Cmd/Ctrl-click opens in a new tab without closing the palette,
		// matching the keyboard Cmd+Enter behaviour. Alt-click maps to
		// the (step-8) filter mode. Default click opens.
		let mode: ActivationMode = 'open';
		if (e.metaKey || e.ctrlKey) mode = 'newTab';
		else if (e.altKey) mode = 'filter';
		// Prevent default so any wrapping <a> doesn't double-navigate.
		e.preventDefault();
		void palette.activate(row, mode);
	}

	function handleListboxPointerMove(e: PointerEvent) {
		// Mouse hover should drive selection so keyboard Enter operates on
		// the same row the user sees highlighted under the cursor.
		const idx = rowIndexFromTarget(e.target);
		if (idx === null) return;
		if (idx !== palette.selectedIndex) palette.setSelectedIndex(idx);
	}

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
		if (e.key === 'Enter') {
			// Only activate when a row is actually available; otherwise
			// let Enter behave naturally (no submit form is present).
			if (palette.flatRows.length === 0) return;
			e.preventDefault();
			let mode: ActivationMode = 'open';
			if (e.metaKey || e.ctrlKey) mode = 'newTab';
			else if (e.altKey) mode = 'filter';
			void palette.activateSelected(mode);
			return;
		}
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

			<!--
				The listbox handles clicks as event delegation for its
				button children. Keyboard activation lives on the
				document-level handler (handlePaletteKeydown) which
				dispatches based on `palette.selectedRow`, so a separate
				listbox keydown handler would be redundant. Tabindex -1
				keeps the listbox focusable-but-not-tabbable per ARIA.
			-->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				id={LISTBOX_ID}
				role="listbox"
				aria-label="Search results"
				class="cmdk-listbox"
				tabindex={-1}
				onclick={handleListboxClick}
				onpointermove={handleListboxPointerMove}
			>
				{#if rowCount === 0 && !hasQuery}
					<div class="empty">
						<span>Start typing — try <em>tonight</em>, <em>70mm</em>, or <em>curzon</em></span>
					</div>
				{:else if rowCount === 0 && hasQuery && !isLoading}
					<div class="empty">
						<span>No results for "<em>{palette.query}</em>"</span>
					</div>
				{:else if rowCount === 0 && hasQuery && isLoading}
					<div class="empty" aria-busy="true">
						<span>Searching…</span>
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
