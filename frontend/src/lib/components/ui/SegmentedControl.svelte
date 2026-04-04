<script lang="ts">
	let {
		options,
		selected,
		onSelect
	}: {
		options: { value: string; label: string }[];
		selected: string;
		onSelect: (value: string) => void;
	} = $props();

	function handleKeydown(e: KeyboardEvent, index: number) {
		let nextIndex = index;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			nextIndex = (index + 1) % options.length;
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			nextIndex = (index - 1 + options.length) % options.length;
		} else if (e.key === 'Home') {
			e.preventDefault();
			nextIndex = 0;
		} else if (e.key === 'End') {
			e.preventDefault();
			nextIndex = options.length - 1;
		} else {
			return;
		}
		onSelect(options[nextIndex].value);
		// Focus the newly selected tab
		const tablist = (e.target as HTMLElement).parentElement;
		const nextTab = tablist?.children[nextIndex] as HTMLElement;
		nextTab?.focus();
	}
</script>

<div class="segmented" role="tablist">
	{#each options as option, i}
		<button
			role="tab"
			aria-selected={selected === option.value}
			tabindex={selected === option.value ? 0 : -1}
			class="segment"
			class:active={selected === option.value}
			onclick={() => onSelect(option.value)}
			onkeydown={(e) => handleKeydown(e, i)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.segmented {
		display: inline-flex;
		border: 1px solid var(--color-border);
	}

	.segment {
		padding: 0.375rem 0.75rem;
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-secondary);
		background: transparent;
		border: none;
		border-right: 1px solid var(--color-border);
		cursor: pointer;
		transition: color var(--duration-fast) var(--ease-sharp),
			background-color var(--duration-fast) var(--ease-sharp);
	}

	.segment:last-child {
		border-right: none;
	}

	.segment:hover {
		color: var(--color-text);
	}

	.segment.active {
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
	}
</style>
