<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { getPosterImageAttributes } from '$lib/utils';

	let { data } = $props();

	const results = $derived(data.results);
	const cinemas = $derived(data.cinemas);
	const query = $derived(data.query);
</script>

<svelte:head>
	<title>{query ? `"${query}" — ` : ''}Search — pictures · london</title>
	<meta name="description" content="Search films showing in London cinemas" />
</svelte:head>

<section class="py-6">
	<div class="max-w-[1400px] mx-auto px-4 md:px-8">
		<h1 class="font-display text-sm font-bold tracking-wide-swiss uppercase mb-1 pb-1.5 border-b-2 border-[var(--color-border)]">
			{#if query}
				RESULTS FOR "{query}"
			{:else}
				SEARCH
			{/if}
		</h1>

		{#if query && results.length === 0 && cinemas.length === 0}
			<EmptyState
				title="No results"
				description={`No films or cinemas match "${query}". Try a different search.`}
			/>
		{:else if !query}
			<EmptyState
				title="Search for films"
				description="Use the search bar above to find films showing in London."
			/>
		{:else}
			{#if results.length > 0}
				<p class="text-xs text-[var(--color-muted)] uppercase tracking-wide-swiss mt-4 mb-3">
					{results.length} film{results.length !== 1 ? 's' : ''}
				</p>
				<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
					{#each results as film (film.id)}
						<a href="/film/{film.id}" class="group">
							<div class="aspect-[2/3] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] overflow-hidden mb-2">
								{#if film.posterUrl}
									{@const posterImage = getPosterImageAttributes(film.posterUrl, {
										baseSize: 'w342',
										srcSetSizes: ['w185', 'w342', 'w500'],
										sizes: '(min-width: 1280px) 200px, (min-width: 1024px) 20vw, (min-width: 768px) 24vw, 46vw'
									})}
									<img
										src={posterImage?.src ?? film.posterUrl}
										srcset={posterImage?.srcset}
										sizes={posterImage?.sizes}
										alt={film.title}
										class="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
										loading="lazy"
										decoding="async"
									/>
								{:else}
									<div class="w-full h-full flex items-center justify-center p-2">
										<span class="text-xs font-mono text-[var(--color-muted)] text-center uppercase">{film.title}</span>
									</div>
								{/if}
							</div>
							<p class="text-xs font-bold uppercase tracking-wide-swiss group-hover:underline line-clamp-2">{film.title}</p>
							<p class="text-[10px] text-[var(--color-muted)] mt-0.5">
								{film.year ?? ''}{film.directors?.length ? ` · ${film.directors[0]}` : ''}
							</p>
						</a>
					{/each}
				</div>
			{/if}

			{#if cinemas.length > 0}
				<p class="text-xs text-[var(--color-muted)] uppercase tracking-wide-swiss mt-6 mb-3">
					{cinemas.length} cinema{cinemas.length !== 1 ? 's' : ''}
				</p>
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{#each cinemas as cinema (cinema.id)}
						<a
							href="/cinemas/{cinema.id}"
							class="p-3 border border-[var(--color-border-subtle)] hover:border-[var(--color-foreground)] transition-colors"
						>
							<p class="text-sm font-bold uppercase">{cinema.name}</p>
							{#if cinema.area}
								<p class="text-xs text-[var(--color-muted)]">{cinema.area}</p>
							{/if}
						</a>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</section>
