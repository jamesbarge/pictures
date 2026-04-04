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
</script>

<div class="filter-bar">
	<div class="filter-grid">
		<div class="filter-zone">
			<FilmTypeFilter />
		</div>
		<div class="filter-zone filter-zone-noborder">
			<DateTimePicker />
		</div>
		<div class="filter-zone filter-zone-noborder">
			<CinemaPicker {cinemas} />
		</div>
		<div class="filter-zone filter-zone-noborder">
			<FormatPicker />
		</div>
		<div class="filter-zone filter-zone-search">
			<SearchInput />
		</div>
		<div class="filter-zone filter-zone-actions">
			<ViewToggle />
			<ClearFiltersButton />
		</div>
	</div>

	<ActiveFilterChips />
</div>

<style>
	.filter-bar {
		padding: 0.5rem 0;
	}

	.filter-grid {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.25rem 0;
		min-height: 40px;
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

	/* On mobile: hide search + view toggle to fit core filters in one row */
	@media (max-width: 767px) {
		.filter-zone-search,
		.filter-zone-actions {
			display: none;
		}
	}
</style>
