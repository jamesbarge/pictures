<script lang="ts">
	import FilmTypeFilter from './FilmTypeFilter.svelte';
	import DateTimePicker from './DateTimePicker.svelte';
	import SearchInput from './SearchInput.svelte';
	import CinemaPicker from './CinemaPicker.svelte';
	import FormatPicker from './FormatPicker.svelte';
	import ViewToggle from './ViewToggle.svelte';
	import ActiveFilterChips from './ActiveFilterChips.svelte';
	import ClearFiltersButton from './ClearFiltersButton.svelte';
	import type { Cinema } from '$lib/types';

	let { cinemas = [] }: { cinemas: Cinema[] } = $props();

	let filtersOpen = $state(false);
</script>

<div class="filter-bar">
	<div class="filter-grid">
		<!-- Search: full-width top row on mobile, inline on desktop -->
		<div class="filter-zone filter-zone-search">
			<SearchInput />
		</div>

		<div class="filter-zone filter-zone-tabs">
			<FilmTypeFilter />
		</div>

		<!-- Desktop: show inline -->
		<div class="filter-zone filter-zone-noborder desktop-only">
			<DateTimePicker />
		</div>
		<div class="filter-zone filter-zone-noborder desktop-only">
			<CinemaPicker {cinemas} />
		</div>
		<div class="filter-zone filter-zone-noborder desktop-only">
			<FormatPicker />
		</div>
		<div class="filter-zone filter-zone-actions desktop-only">
			<ViewToggle />
			<ClearFiltersButton />
		</div>

		<!-- Mobile: FILTERS toggle button -->
		<div class="filter-zone filter-zone-noborder mobile-only">
			<button
				class="filters-toggle"
				class:active={filtersOpen}
				onclick={() => (filtersOpen = !filtersOpen)}
				aria-expanded={filtersOpen}
				aria-label="Toggle filters"
			>
				FILTERS
				<svg aria-hidden="true" width="10" height="6" viewBox="0 0 10 6" fill="none" class="chevron" class:flip={filtersOpen}>
					<path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>
				</svg>
			</button>
		</div>
	</div>

	<!-- Mobile: expanded filter panel -->
	{#if filtersOpen}
		<div class="mobile-filter-panel mobile-only">
			<div class="mobile-filter-row">
				<DateTimePicker />
			</div>
			<div class="mobile-filter-row">
				<CinemaPicker {cinemas} />
			</div>
			<div class="mobile-filter-row">
				<FormatPicker />
			</div>
		</div>
	{/if}

	<ActiveFilterChips />
</div>

<style>
	.filter-bar {
		padding: 0.5rem 0;
	}

	.filter-grid {
		display: flex;
		align-items: center;
		gap: 0;
		height: 40px;
	}

	.filter-zone {
		display: flex;
		align-items: center;
		height: 100%;
		padding-right: 0.5rem;
		margin-right: 0.5rem;
		border-right: 1px solid var(--color-border-subtle);
		flex-shrink: 0;
	}

	.filter-zone:last-child {
		border-right: none;
		padding-right: 0;
		margin-right: 0;
	}

	.filter-zone-noborder {
		border-right: none;
	}

	.filter-zone-search {
		flex: 1;
		min-width: 0;
	}

	.filter-zone-actions {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		border-right: none;
		padding-right: 0;
		margin-right: 0;
	}

	.filter-zone-search {
		flex: 1;
		min-width: 0;
		border-right: none;
	}

	.filter-zone-tabs {
		border-right: 1px solid var(--color-border-subtle);
	}

	/* FILTERS toggle button (mobile only) */
	.filters-toggle {
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
		transition: border-color var(--duration-fast) var(--ease-sharp);
	}

	.filters-toggle:hover {
		border-color: var(--color-border);
	}

	.filters-toggle.active {
		border-color: var(--color-text);
		color: var(--color-text);
	}

	.chevron {
		transition: transform var(--duration-fast) var(--ease-sharp);
	}

	.chevron.flip {
		transform: rotate(180deg);
	}

	/* Mobile filter panel — slides open below the tabs */
	.mobile-filter-panel {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.5rem 0;
		border-top: 1px solid var(--color-border-subtle);
	}

	.mobile-filter-row {
		position: relative;
	}

	/* Desktop-only / Mobile-only visibility */
	.mobile-only {
		display: none;
	}

	@media (max-width: 767px) {
		.desktop-only {
			display: none;
		}

		.mobile-only {
			display: flex;
		}

		.filter-grid {
			flex-wrap: wrap;
		}

		.filter-zone-search {
			order: -1;
			flex: none;
			width: 100%;
			margin-bottom: 0.25rem;
			padding-right: 0;
			margin-right: 0;
		}

		.filter-zone-tabs {
			border-right: none;
		}
	}
</style>
