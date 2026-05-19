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

	const LISTBOX_ID = 'cmdk-listbox';

	let inputRef = $state<HTMLInputElement | null>(null);
	let activeDescendant = $state<string | undefined>(undefined);

	const chips = $derived(palette.parsed.chipDescriptors);
	const isDesktop = $derived(media.isDesktop);

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

	onMount(() => {
		function handleKeydown(e: KeyboardEvent) {
			if (!palette.open) return;
			if (e.key === 'Escape') {
				e.preventDefault();
				palette.closePalette();
			}
		}
		document.addEventListener('keydown', handleKeydown);
		return () => document.removeEventListener('keydown', handleKeydown);
	});
</script>

<Dialog.Root open={palette.open} onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay class="cmdk-overlay" />
		<Dialog.Content
			class={isDesktop ? 'cmdk-content cmdk-desktop' : 'cmdk-content cmdk-mobile'}
			aria-describedby={undefined}
		>
			<Dialog.Title class="sr-only">Search pictures.london</Dialog.Title>

			<CommandPaletteInput
				listboxId={LISTBOX_ID}
				{activeDescendant}
				bind:inputRef
			/>

			<ActiveFiltersRow {chips} onRemove={removeChip} />

			<ul id={LISTBOX_ID} role="listbox" aria-label="Search results" class="cmdk-listbox">
				{#if palette.query.length === 0}
					<li class="empty">
						<span>Start typing — try <em>tonight</em>, <em>70mm</em>, or <em>curzon</em></span>
					</li>
				{:else}
					<li class="empty">
						<span>Results coming in the next step…</span>
					</li>
				{/if}
			</ul>

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
