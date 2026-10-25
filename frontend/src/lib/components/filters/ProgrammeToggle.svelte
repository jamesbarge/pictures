<script lang="ts">
	/**
	 * ALL / NEW / REP — the lead filter. A single-choice radiogroup with live
	 * film counts from the homepage. `framed` draws its own bordered box (the
	 * sidebar); unframed it fills a box its parent draws (the top bar).
	 */
	import { filters } from '$lib/stores/filters.svelte';
	import { shell } from '$lib/stores/shell.svelte';
	import { trackFilterChange } from '$lib/analytics/posthog';

	let { framed = false }: { framed?: boolean } = $props();

	type Prog = 'all' | 'new' | 'repertory';
	const OPTIONS = [
		{ value: 'all', label: 'All', key: 'all' },
		{ value: 'new', label: 'New', key: 'new' },
		{ value: 'repertory', label: 'Rep', key: 'rep' }
	] as const;

	const current = $derived.by<Prog>(() => {
		if (filters.programmingTypes.includes('new_release')) return 'new';
		if (filters.programmingTypes.includes('repertory')) return 'repertory';
		return 'all';
	});

	const options = $derived(
		OPTIONS.map((o) => {
			const count = shell.programmeCounts ? shell.programmeCounts[o.key] : null;
			const checked = current === o.value;
			return { ...o, count, checked, disabled: !checked && count === 0 };
		})
	);

	function pick(value: Prog) {
		if (value === current) return;
		trackFilterChange('programming_type', value, 'set');
		filters.programmingTypes =
			value === 'all' ? [] : value === 'new' ? ['new_release'] : ['repertory'];
	}

	// Radiogroup keys: arrows move and select, skipping options with no films.
	function onKeydown(e: KeyboardEvent) {
		const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
		if (!step) return;
		e.preventDefault();
		const live = options.filter((o) => !o.disabled);
		const i = live.findIndex((o) => o.value === current);
		const next = live[(i + step + live.length) % live.length];
		pick(next.value);
		const group = e.currentTarget as HTMLElement;
		queueMicrotask(() =>
			group.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus()
		);
	}
</script>

<div class="prog" class:framed role="radiogroup" aria-label="Programme" tabindex="-1" onkeydown={onKeydown}>
	{#each options as o (o.value)}
		<button
			type="button"
			role="radio"
			data-value={o.value}
			aria-checked={o.checked}
			aria-disabled={o.disabled || undefined}
			tabindex={o.checked ? 0 : -1}
			class:on={o.checked}
			onclick={() => !o.disabled && pick(o.value)}
		>
			{o.label}{#if o.count !== null}<span class="count">{o.count}</span>{/if}
		</button>
	{/each}
</div>

<style>
	.prog {
		/* Light palette in every theme, like the rest of the filter controls. */
		--ink: #1f1f1f;
		--cream: #eae5c2;
		display: flex;
		flex: 1 1 auto;
		min-width: 0;
		height: 100%;
		background: #ffffff;
	}

	.prog.framed {
		height: 48px;
		border: 1px solid var(--ink);
		border-radius: 4px;
		box-shadow: 4px 4px 0 0 var(--ink);
		overflow: hidden;
	}

	button {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 0 4px;
		border: 0;
		border-left: 1px solid var(--ink);
		background: #ffffff;
		color: var(--ink);
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	button:first-child { border-left: 0; }
	button:hover:not(.on):not([aria-disabled='true']) { background: var(--cream); }

	button.on {
		background: var(--ink);
		color: var(--cream);
	}

	button[aria-disabled='true'] {
		color: #5a5a5a;
		cursor: default;
	}

	/* Inset ring so the group's overflow never clips it. */
	button:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: -4px;
	}
	button.on:focus-visible { outline-color: var(--cream); }

	.count {
		font-weight: 400;
		font-variant-numeric: tabular-nums;
		color: #5a5a5a;
	}
	button.on .count { color: var(--cream); }
</style>
