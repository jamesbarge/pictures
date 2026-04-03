<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
</script>

<svelte:head>
	<title>Map — pictures · london</title>
	<meta name="description" content="Interactive map of all London cinemas — find your nearest venue" />
</svelte:head>

<section class="py-6">
	<div class="max-w-[1400px] mx-auto px-4 md:px-8">
		<h1 class="font-display text-sm font-bold tracking-wide-swiss uppercase mb-6 pb-1.5 border-b-2 border-[var(--color-border)]">
			CINEMA MAP
		</h1>
		<EmptyState
			title="Map coming soon"
			description="An interactive map of all London cinemas is in development."
		/>
	</div>
</section>
