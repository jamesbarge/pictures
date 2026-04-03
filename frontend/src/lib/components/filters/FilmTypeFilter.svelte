<script lang="ts">
	import { filters } from '$lib/stores/filters.svelte';

	const options = [
		{ value: 'all', label: 'ALL' },
		{ value: 'new', label: 'NEW' },
		{ value: 'repertory', label: 'REPERTORY' }
	];

	const selected = $derived.by(() => {
		if (filters.programmingTypes.length === 0) return 'all';
		if (filters.programmingTypes.includes('new_release')) return 'new';
		if (filters.programmingTypes.includes('repertory')) return 'repertory';
		return 'all';
	});

	function handleSelect(value: string) {
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
		display: flex;
		gap: 0;
	}

	.type-tab:first-child {
		padding-left: 0;
	}

	.type-tab {
		padding: 0.375rem 0.625rem;
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-tertiary);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition: color var(--duration-fast) var(--ease-sharp),
			border-color var(--duration-fast) var(--ease-sharp);
	}

	.type-tab:hover {
		color: var(--color-text);
	}

	.type-tab.active {
		color: var(--color-text);
		border-bottom-color: var(--color-accent);
	}
</style>
