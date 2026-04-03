<script lang="ts">
	import { filters } from '$lib/stores/filters.svelte';
	import { FORMAT_OPTIONS, formatHour } from '$lib/constants/filters';

	interface Chip {
		key: string;
		label: string;
		onRemove: () => void;
	}

	const chips = $derived((): Chip[] => {
		const c: Chip[] = [];

		if (filters.dateFrom || filters.dateTo) {
			const label = filters.dateFrom === filters.dateTo
				? filters.dateFrom ?? ''
				: `${filters.dateFrom ?? '…'} – ${filters.dateTo ?? '…'}`;
			c.push({ key: 'date', label, onRemove: () => { filters.dateFrom = null; filters.dateTo = null; } });
		}

		if (filters.timeFrom !== null && filters.timeTo !== null) {
			c.push({
				key: 'time',
				label: `${formatHour(filters.timeFrom)}–${formatHour(filters.timeTo)}`,
				onRemove: () => filters.clearTimeRange()
			});
		}

		for (const fmt of filters.formats) {
			const label = FORMAT_OPTIONS.find((f) => f.value === fmt)?.label ?? fmt;
			c.push({ key: `fmt-${fmt}`, label, onRemove: () => filters.toggleFormat(fmt) });
		}

		return c;
	});
</script>

{#if chips().length > 0}
	<div class="chip-row">
		{#each chips() as chip (chip.key)}
			<button class="chip" onclick={chip.onRemove}>
				{chip.label}
				<svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" fill="none">
					<path d="M1 1L7 7M7 1L1 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"/>
				</svg>
			</button>
		{/each}
	</div>
{/if}

<style>
	.chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text);
		background: var(--color-bg-subtle);
		border: 1px solid var(--color-border-subtle);
		cursor: pointer;
		transition: border-color var(--duration-fast) var(--ease-sharp);
	}

	.chip:hover {
		border-color: var(--color-accent);
	}
</style>
