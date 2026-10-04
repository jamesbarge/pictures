<script lang="ts">
	/**
	 * Sectioned result list for the command palette.
	 *
	 * Structure follows the existing inline SearchInput pattern: a flat
	 * `<div role="listbox">` (not `<ul>`) with direct `<button
	 * role="option">` children. Section headers are `<div
	 * role="presentation">` between groups of options. This avoids the
	 * `<li>` invalid-nesting and `<div onclick>` a11y warnings that
	 * arise from a stricter `<ul role="listbox"><li role="group">`
	 * structure.
	 *
	 * Each row component handles its own click. We pass `onActivate`
	 * which is invoked when the row's button is clicked OR when Enter
	 * fires on the active row (handled at the CommandPalette level via
	 * the input's keydown).
	 */
	import { palette } from '$lib/stores/palette.svelte';
	import {
		SECTION_LABELS,
		SECTION_ORDER,
		type PaletteResults
	} from '$lib/search/result-types';
	import FilmRow from './rows/FilmRow.svelte';
	import PersonRow from './rows/PersonRow.svelte';
	import CinemaRow from './rows/CinemaRow.svelte';
	import FestivalRow from './rows/FestivalRow.svelte';
	import SeasonRow from './rows/SeasonRow.svelte';
	import FilterActionRow from './rows/FilterActionRow.svelte';

	interface Props {
		idPrefix?: string;
	}

	let { idPrefix = 'cmdk-opt' }: Props = $props();

	const results = $derived<PaletteResults>(palette.results);
	const selectedIndex = $derived(palette.selectedIndex);

	const sections = $derived.by(() => {
		const out: Array<{
			section: keyof PaletteResults;
			items: Array<{ row: unknown; flatIndex: number; id: string }>;
		}> = [];
		let i = 0;
		for (const section of SECTION_ORDER) {
			const rows = results[section];
			if (!rows || rows.length === 0) continue;
			const items = [];
			for (const row of rows) {
				items.push({ row, flatIndex: i, id: `${idPrefix}-${i}` });
				i += 1;
			}
			out.push({ section, items });
		}
		return out;
	});
</script>

{#each sections as group (group.section)}
	<div
		role="presentation"
		class="header"
		id="cmdk-grp-{group.section}"
	>
		{SECTION_LABELS[group.section]}
	</div>
	{#each group.items as item (item.id)}
		{#if group.section === 'films'}
			<FilmRow
				film={item.row as never}
				selected={item.flatIndex === selectedIndex}
				id={item.id}
			/>
		{:else if group.section === 'people'}
			<PersonRow
				person={item.row as never}
				selected={item.flatIndex === selectedIndex}
				id={item.id}
			/>
		{:else if group.section === 'cinemas'}
			<CinemaRow
				cinema={item.row as never}
				selected={item.flatIndex === selectedIndex}
				id={item.id}
			/>
		{:else if group.section === 'festivals'}
			<FestivalRow
				festival={item.row as never}
				selected={item.flatIndex === selectedIndex}
				id={item.id}
			/>
		{:else if group.section === 'seasons'}
			<SeasonRow
				season={item.row as never}
				selected={item.flatIndex === selectedIndex}
				id={item.id}
			/>
		{:else if group.section === 'actions'}
			<FilterActionRow
				action={item.row as never}
				selected={item.flatIndex === selectedIndex}
				id={item.id}
			/>
		{/if}
	{/each}
{/each}

<style>
	.header {
		padding: 8px 12px 4px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-text-tertiary);
	}
</style>
