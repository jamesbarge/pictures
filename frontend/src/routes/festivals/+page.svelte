<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Festivals — pictures · london</title>
	<meta name="description" content="London film festivals — upcoming and ongoing festivals with screening schedules" />
</svelte:head>

<section class="py-6">
	<div class="max-w-[1400px] mx-auto px-4 md:px-8">
		<h1 class="font-display text-sm font-bold tracking-wide-swiss uppercase mb-6 pb-1.5 border-b-2 border-[var(--color-border)]">
			FESTIVALS
		</h1>

		{#if data.festivals.length === 0}
			<EmptyState title="No festivals" description="Check back soon for upcoming London film festivals." />
		{:else}
			<div class="festival-grid">
				{#each data.festivals as festival (festival.id ?? festival.slug)}
					<a href="/festivals/{festival.slug}" class="festival-card">
						<h2 class="festival-name">{festival.name}</h2>
						{#if festival.startDate}
							<p class="festival-dates">
								{new Date(festival.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}
								{#if festival.endDate}
									– {new Date(festival.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}
								{/if}
							</p>
						{/if}
						{#if festival.venue}
							<p class="festival-venue">{festival.venue}</p>
						{/if}
					</a>
				{/each}
			</div>
		{/if}
	</div>
</section>

<style>
	.festival-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0;
	}

	@media (min-width: 768px) { .festival-grid { grid-template-columns: repeat(3, 1fr); } }

	.festival-card {
		padding: 1rem 1rem 1rem 0;
		border-bottom: 1px solid var(--color-border-subtle);
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	.festival-card:hover {
		background: var(--color-bg-subtle);
		padding-left: 1rem;
		margin-left: -1rem;
	}

	.festival-name {
		font-size: var(--font-size-base);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: -0.01em;
	}

	.festival-dates {
		font-size: var(--font-size-xs);
		font-family: var(--font-mono);
		color: var(--color-text-secondary);
		margin-top: 0.25rem;
	}

	.festival-venue {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		margin-top: 0.125rem;
	}
</style>
