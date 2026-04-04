<script lang="ts">
	import CinemaMap from '$lib/components/map/CinemaMap.svelte';
	import { page } from '$app/state';

	// Cinemas are loaded in the root layout and available via parent data
	let { data } = $props();
	const cinemas = $derived(data?.cinemas ?? []);
</script>

<svelte:head>
	<title>Map — pictures · london</title>
	<meta name="description" content="Interactive map of all London cinemas — find your nearest venue" />
</svelte:head>

<section class="map-page" aria-labelledby="map-heading">
	<div class="map-header">
		<h1 id="map-heading" class="font-display text-sm font-bold tracking-wide-swiss uppercase">
			CINEMA MAP
		</h1>
		<span class="text-xs text-[var(--color-muted)] font-mono">{cinemas.filter((c: any) => c.coordinates).length} VENUES</span>
	</div>
	<div class="map-body">
		<CinemaMap {cinemas} />
	</div>
</section>

<style>
	.map-page {
		display: flex;
		flex-direction: column;
		height: calc(100dvh - 49px); /* subtract header height */
	}

	.map-header {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		padding: 0.75rem 2rem;
		border-bottom: 2px solid var(--color-border);
	}

	.map-body {
		flex: 1;
		min-height: 0;
	}
</style>
