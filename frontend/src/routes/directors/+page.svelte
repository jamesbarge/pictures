<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

	interface DirectorEntry {
		name: string;
		filmCount: number;
		films: string[];
	}

	let { data }: { data: { directors: DirectorEntry[] } } = $props();
	let search = $state('');

	const filtered = $derived(
		search
			? data.directors.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
			: data.directors
	);
</script>

<svelte:head>
	<title>Directors — pictures · london</title>
	<meta name="description" content="Browse directors with films currently showing across London cinemas" />
</svelte:head>

<section class="py-6">
	<div class="max-w-[1400px] mx-auto px-4 md:px-8">
		<div class="flex items-baseline justify-between mb-6 pb-1.5 border-b-2 border-[var(--color-border)]">
			<div class="flex items-baseline gap-3">
				<h1 class="font-display text-sm font-bold tracking-wide-swiss uppercase">DIRECTORS</h1>
				<span class="text-xs text-[var(--color-text-tertiary)] font-mono">{data.directors.length}</span>
			</div>
			<input
				bind:value={search}
				type="search" autocapitalize="off"
				placeholder="Search directors..."
				class="search-input"
				aria-label="Search directors"
			/>
		</div>

		{#if filtered.length === 0}
			<EmptyState title="No directors found" description={search ? 'Try a different search.' : 'No director data available.'} />
		{:else}
			<div class="director-grid">
				{#each filtered as director (director.name)}
					<div class="director-card">
						<h2 class="director-name">{director.name}</h2>
						<p class="director-films">
							{director.filmCount} {director.filmCount === 1 ? 'film' : 'films'} showing
						</p>
						<p class="director-titles">{director.films.slice(0, 3).join(', ')}{director.films.length > 3 ? '...' : ''}</p>
					</div>
				{/each}
			</div>
		{/if}
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

	.search-input:focus { border-color: var(--color-border); }
	.search-input:focus-visible { outline: 2px solid var(--color-text); outline-offset: 2px; }
	.search-input::placeholder { color: var(--color-text-tertiary); }

	.director-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0;
	}

	@media (min-width: 768px) { .director-grid { grid-template-columns: repeat(3, 1fr); } }
	@media (min-width: 1024px) { .director-grid { grid-template-columns: repeat(4, 1fr); } }

	.director-card {
		padding: 0.75rem 0.75rem 0.75rem 0;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.director-name {
		font-size: var(--font-size-sm);
		font-weight: 500;
	}

	.director-films {
		font-size: var(--font-size-xs);
		font-family: var(--font-mono);
		color: var(--color-text-secondary);
		margin-top: 0.125rem;
	}

	.director-titles {
		font-size: var(--font-size-xs);
		color: var(--color-text-tertiary);
		margin-top: 0.125rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
