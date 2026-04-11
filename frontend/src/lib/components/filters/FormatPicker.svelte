<script lang="ts">
	import Dropdown from '$lib/components/ui/Dropdown.svelte';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';
	import { filters } from '$lib/stores/filters.svelte';
	import { FORMAT_OPTIONS } from '$lib/constants/filters';
	import { trackFilterChange } from '$lib/analytics/posthog';

	let open = $state(false);

	const label = $derived(
		filters.formats.length === 0
			? 'FORMAT'
			: filters.formats.length === 1
				? FORMAT_OPTIONS.find((f) => f.value === filters.formats[0])?.label ?? 'FORMAT'
				: `${filters.formats.length} FORMATS`
	);
</script>

<div class="relative">
	<button
		class="picker-trigger"
		class:active={filters.formats.length > 0}
		onclick={() => (open = !open)}
		aria-label="Format filter"
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		{label}
		<svg aria-hidden="true" width="10" height="6" viewBox="0 0 10 6" fill="none" class="chevron" class:flip={open}>
			<path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>
		</svg>
	</button>

	<Dropdown {open} onClose={() => (open = false)}>
		<div class="py-1">
			{#each FORMAT_OPTIONS as fmt}
				<Checkbox
					checked={filters.formats.includes(fmt.value)}
					label={fmt.label}
					onToggle={() => {
						const wasSelected = filters.formats.includes(fmt.value);
						filters.toggleFormat(fmt.value);
						trackFilterChange('format', fmt.label, wasSelected ? 'removed' : 'added');
					}}
				/>
			{/each}
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
</style>
