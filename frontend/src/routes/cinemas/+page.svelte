<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import { groupBy } from '$lib/utils';

	let { data } = $props();
	let search = $state('');

	const filtered = $derived(
		search
			? data.cinemas.filter((c) =>
				c.name.toLowerCase().includes(search.toLowerCase()) ||
				(c.address?.area.toLowerCase().includes(search.toLowerCase()) ?? false)
			)
			: data.cinemas
	);

	const grouped = $derived.by(() => {
		const groups: Record<string, typeof data.cinemas> = {};
		for (const cinema of filtered) {
			const key = cinema.chain ?? 'Independent';
			(groups[key] ??= []).push(cinema);
		}
		return Object.entries(groups).sort(([a], [b]) => {
			if (a === 'Independent') return 1;
			if (b === 'Independent') return -1;
			return a.localeCompare(b);
		});
	});
</script>

<svelte:head>
	<title>Cinemas — pictures · london</title>
	<meta name="description" content="All {data.cinemas.length} cinemas in London" />
</svelte:head>

<section class="py-6">
	<div class="max-w-[1400px] mx-auto px-4 md:px-8">
		<div class="flex items-baseline justify-between mb-6 pb-1.5 border-b-2 border-[var(--color-border)]">
			<div class="flex items-baseline gap-3">
				<h1 class="font-display text-sm font-bold tracking-wide-swiss uppercase">CINEMAS</h1>
				<span class="text-xs text-[var(--color-text-tertiary)] font-mono">{data.cinemas.length}</span>
			</div>
			<input
				bind:value={search}
				type="search" autocapitalize="off"
				placeholder="Search cinemas..."
				class="search-input"
				aria-label="Search cinemas"
			/>
		</div>

		{#each grouped as [chain, cinemas] (chain)}
			<div class="chain-group">
				<h2 class="chain-label">{chain.toUpperCase()}</h2>
				<div class="cinema-grid">
					{#each cinemas as cinema (cinema.id)}
						<a href="/cinemas/{cinema.id}" class="cinema-card">
							<h3 class="cinema-name">{cinema.name}</h3>
							{#if cinema.address}
								<p class="cinema-area">{cinema.address.area}</p>
							{/if}
							{#if cinema.features?.length}
								<div class="cinema-features">
									{#each cinema.features.slice(0, 3) as feature}
										<Badge variant="muted">{feature.replace(/_/g, ' ')}</Badge>
									{/each}
								</div>
							{/if}
						</a>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</section>

<style>
	.search-input {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--color-border-subtle);
		padding: 0.25rem 0;
		outline: none;
		width: 200px;
	}

	.search-input:focus {
		border-color: var(--color-border);
	}

	.search-input:focus-visible {
		outline: 2px solid var(--color-text);
		outline-offset: 2px;
	}

	.search-input::placeholder {
		color: var(--color-text-tertiary);
	}

	.chain-group {
		margin-bottom: 2rem;
	}

	.chain-label {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-text-tertiary);
		margin-bottom: 0.75rem;
	}

	.cinema-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0;
	}

	@media (min-width: 768px) {
		.cinema-grid { grid-template-columns: repeat(3, 1fr); }
	}

	@media (min-width: 1024px) {
		.cinema-grid { grid-template-columns: repeat(4, 1fr); }
	}

	.cinema-card {
		padding: 0.75rem 0.75rem 0.75rem 0;
		border-bottom: 1px solid var(--color-border-subtle);
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	.cinema-card:hover {
		background: var(--color-bg-subtle);
		padding-left: 0.75rem;
		margin-left: -0.75rem;
	}

	.cinema-name {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text);
	}

	.cinema-area {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		margin-top: 0.125rem;
	}

	.cinema-features {
		display: flex;
		gap: 0.25rem;
		margin-top: 0.375rem;
	}
</style>
