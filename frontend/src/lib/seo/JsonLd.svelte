<script lang="ts">
	let { data }: { data: Record<string, unknown> | Record<string, unknown>[] } = $props();

	// Escape < to prevent script tag breakout in JSON-LD
	const jsonString = $derived(JSON.stringify(data).replace(/</g, '\\u003c'));
</script>

<svelte:head>
	{@html `<script type="application/ld+json">${jsonString}</script>`}
</svelte:head>
