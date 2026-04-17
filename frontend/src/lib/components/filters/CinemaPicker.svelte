<script lang="ts">
	import Dropdown from '$lib/components/ui/Dropdown.svelte';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';
	import { filters } from '$lib/stores/filters.svelte';
	import { trackFilterChange } from '$lib/analytics/posthog';

	interface PickerCinema {
		id: string;
		name: string;
		shortName: string | null;
		address: { area: string } | null;
	}

	let { cinemas = [] }: { cinemas: PickerCinema[] } = $props();

	let open = $state(false);
	let search = $state('');

	const label = $derived(
		filters.cinemaIds.length === 0
			? 'ALL CINEMAS'
			: filters.cinemaIds.length === 1
				? (cinemas.find((c) => c.id === filters.cinemaIds[0])?.shortName ??
					cinemas.find((c) => c.id === filters.cinemaIds[0])?.name ??
					'1 CINEMA').toUpperCase()
				: `${filters.cinemaIds.length} CINEMAS`
	);

	const filteredCinemas = $derived(
		search
			? cinemas.filter((c) =>
					c.name.toLowerCase().includes(search.toLowerCase()) ||
					(c.shortName?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
					(c.address?.area.toLowerCase().includes(search.toLowerCase()) ?? false)
				)
			: cinemas
	);

	const grouped = $derived.by(() => {
		const groups: Record<string, PickerCinema[]> = {};
		for (const cinema of filteredCinemas) {
			const area = cinema.address?.area ?? 'Other';
			(groups[area] ??= []).push(cinema);
		}
		return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
	});

	function clearSelection() {
		filters.cinemaIds = [];
	}
</script>

<div class="relative">
	<button
		class="picker-trigger"
		class:active={filters.cinemaIds.length > 0}
		onclick={() => (open = !open)}
		aria-label="Cinema filter"
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		{label}
		<svg aria-hidden="true" width="10" height="6" viewBox="0 0 10 6" fill="none" class="chevron" class:flip={open}>
			<path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>
		</svg>
	</button>

	<Dropdown {open} onClose={() => (open = false)} ariaLabel="Cinema filter options">
		<div class="cinema-dropdown">
			<div class="cinema-search-wrap">
				<input
					bind:value={search}
					type="search" autocapitalize="off"
					placeholder="Search cinemas..."
					class="cinema-search"
					autocomplete="off"
					aria-label="Filter cinemas"
				/>
			</div>

			{#if filters.cinemaIds.length > 0}
				<button class="cinema-clear" onclick={clearSelection}>
					CLEAR SELECTION
				</button>
			{/if}

			<div class="cinema-list">
				{#each grouped as [area, areaCinemas]}
					<div class="area-header">{area.toUpperCase()}</div>
					{#each areaCinemas as cinema}
						<Checkbox
							checked={filters.cinemaIds.includes(cinema.id)}
							label={cinema.shortName ?? cinema.name}
							onToggle={() => {
								const wasSelected = filters.cinemaIds.includes(cinema.id);
								filters.toggleCinema(cinema.id);
								trackFilterChange('cinema', cinema.name, wasSelected ? 'removed' : 'added');
							}}
						/>
					{/each}
				{/each}
			</div>
		</div>
	</Dropdown>
</div>

<style>
	.picker-trigger {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.625rem;
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-secondary);
		background: transparent;
		border: 1px solid var(--color-border-subtle);
		cursor: pointer;
		transition: border-color var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp);
	}

	.picker-trigger:hover {
		border-color: var(--color-border);
		color: var(--color-text);
	}

	.picker-trigger.active {
		border-color: var(--color-text);
		color: var(--color-text);
	}

	.chevron {
		transition: transform var(--duration-fast) var(--ease-sharp);
	}

	.chevron.flip {
		transform: rotate(180deg);
	}

	.cinema-dropdown {
		width: 100%;
		max-width: 280px;
	}

	.cinema-search-wrap {
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	/* 16px mobile base avoids iOS Safari's auto-zoom on focus (triggers below
	   16px). Desktop overrides to `--font-size-sm` for visual consistency with
	   the rest of the UI. */
	.cinema-search {
		width: 100%;
		border: none;
		background: transparent;
		font-size: 16px;
		color: var(--color-text);
		outline: none;
	}

	@media (min-width: 768px) {
		.cinema-search {
			font-size: var(--font-size-sm);
		}
	}

	.cinema-search::placeholder {
		color: var(--color-text-tertiary);
	}

	.cinema-clear {
		display: block;
		width: 100%;
		padding: 0.375rem 0.75rem;
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-accent);
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--color-border-subtle);
		cursor: pointer;
		text-align: left;
	}

	.cinema-list {
		max-height: 320px;
		overflow-y: auto;
	}

	.area-header {
		padding: 0.5rem 0.75rem 0.25rem;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: var(--color-text-tertiary);
	}
</style>
