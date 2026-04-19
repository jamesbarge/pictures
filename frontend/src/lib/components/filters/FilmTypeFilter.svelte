<script lang="ts">
	import { filters } from '$lib/stores/filters.svelte';
	import { trackFilterChange } from '$lib/analytics/posthog';

	const options = [
		{ value: 'all', label: 'All' },
		{ value: 'new', label: 'New' },
		{ value: 'repertory', label: 'Repertory' }
	];

	const selected = $derived.by(() => {
		if (filters.programmingTypes.length === 0) return 'all';
		if (filters.programmingTypes.includes('new_release')) return 'new';
		if (filters.programmingTypes.includes('repertory')) return 'repertory';
		return 'all';
	});

	function handleSelect(value: string) {
		trackFilterChange('programming_type', value, 'set');
		if (value === 'all') {
			filters.programmingTypes = [];
		} else if (value === 'new') {
			filters.programmingTypes = ['new_release'];
		} else if (value === 'repertory') {
			filters.programmingTypes = ['repertory'];
		}
	}
</script>

<div class="type-filter" role="tablist" aria-label="Film type">
	{#each options as option}
		<button
			role="tab"
			aria-selected={selected === option.value}
			class="type-tab"
			class:active={selected === option.value}
			onclick={() => handleSelect(option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.type-filter {
		display: inline-flex;
		gap: 0;
	}

	.type-tab {
		padding: 7px 16px;
		font-family: var(--font-serif);
		font-size: 13.5px;
		font-weight: 400;
		letter-spacing: -0.005em;
		color: var(--color-text-secondary);
		background: transparent;
		border: 1px solid var(--color-border);
		cursor: pointer;
		font-variation-settings: '"SOFT" 100', '"opsz" 24';
		transition: background-color var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp);
	}

	.type-tab:not(:last-child) {
		border-right: none;
	}

	.type-tab:hover:not(.active) {
		background: var(--color-bg-subtle);
		color: var(--color-text);
	}

	.type-tab.active {
		background: var(--color-text);
		color: var(--color-bg);
		font-weight: 500;
	}
</style>
