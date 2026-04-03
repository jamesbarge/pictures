<script lang="ts">
	let {
		open = false,
		children
	}: {
		open: boolean;
		children: import('svelte').Snippet;
	} = $props();
</script>

<div
	class="mobile-panel"
	class:open
	aria-hidden={!open}
>
	{#if open}
		{@render children()}
	{/if}
</div>

<style>
	.mobile-panel {
		overflow: hidden;
		max-height: 0;
		border-bottom: 0 solid var(--color-border);
		background: var(--color-bg);
		transition: max-height var(--duration-slow) var(--ease-sharp),
			border-bottom-width var(--duration-fast) var(--ease-sharp);
	}

	.mobile-panel.open {
		max-height: 80vh;
		border-bottom-width: 1px;
		overflow-y: auto;
	}
</style>
