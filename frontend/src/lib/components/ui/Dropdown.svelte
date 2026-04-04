<script lang="ts">
	import { onMount } from 'svelte';

	let {
		open = false,
		onClose,
		align = 'left',
		children
	}: {
		open: boolean;
		onClose: () => void;
		align?: 'left' | 'right';
		children: import('svelte').Snippet;
	} = $props();

	let panelEl = $state<HTMLDivElement>();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			onClose();
		}
	}

	function handleClickOutside(e: MouseEvent) {
		if (open && panelEl && !panelEl.contains(e.target as Node)) {
			onClose();
		}
	}

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
		role="listbox"
		aria-label="Filter options"
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

	.dropdown-panel.align-right {
		left: auto;
		right: 0;
	}

	@media (max-width: 767px) {
		.dropdown-panel {
			position: fixed;
			left: 0.5rem;
			right: 0.5rem;
			top: auto;
			width: auto;
			max-width: none;
		}
	}
</style>
