<script lang="ts">
	import { onMount, tick } from 'svelte';

	let {
		open = false,
		onClose,
		align = 'left',
		role = 'group',
		ariaLabel = 'Filter options',
		triggerEl = undefined,
		children
	}: {
		open: boolean;
		onClose: () => void;
		align?: 'left' | 'right';
		role?: string;
		ariaLabel?: string;
		triggerEl?: HTMLElement | undefined;
		children: import('svelte').Snippet;
	} = $props();

	let panelEl = $state<HTMLDivElement>();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			onClose();
			triggerEl?.focus();
		}
	}

	function handleClickOutside(e: MouseEvent) {
		if (open && panelEl && !panelEl.contains(e.target as Node)) {
			onClose();
			triggerEl?.focus();
		}
	}

	$effect(() => {
		if (open && panelEl) {
			tick().then(() => {
				// Focus the panel itself, not the first focusable child.
				// Auto-focusing an <input> on mobile pops the soft keyboard,
				// covers the list, and prevents scrolling the options.
				// Keyboard users can still Tab into interactive children from here.
				panelEl?.focus({ preventScroll: true });
			});
		}
	});

	onMount(() => {
		document.addEventListener('click', handleClickOutside, true);
		return () => document.removeEventListener('click', handleClickOutside, true);
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		bind:this={panelEl}
		class="dropdown-panel"
		class:align-right={align === 'right'}
		tabindex="-1"
		{role}
		aria-label={ariaLabel}
	>
		{@render children()}
	</div>
{/if}

<style>
	.dropdown-panel {
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 50;
		margin-top: 4px;
		min-width: 200px;
		max-width: calc(100vw - 1rem);
		max-height: 520px;
		overflow-y: auto;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		box-shadow: none;
	}

	/* Panel is programmatically focused when opened so keyboard users land
	   inside it (and mobile users don't get an auto-focused input popping
	   the keyboard). The visible open panel is the focus indicator — we
	   don't need a second outline on the container itself. */
	.dropdown-panel:focus {
		outline: none;
	}

	.dropdown-panel.align-right {
		left: auto;
		right: 0;
	}

	@media (max-width: 767px) {
		.dropdown-panel {
			position: fixed;
			left: 0.5rem;
			right: 0.5rem;
			top: var(--header-height, 49px);
			width: auto;
			max-width: none;
			max-height: calc(100dvh - var(--header-height, 49px) - 1rem);
			overflow-y: auto;
		}
	}
</style>
