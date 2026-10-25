<script lang="ts">
	/**
	 * TODAY / TOMORROW / THIS WEEK / calendar. Toggles: tapping the active one
	 * returns to every upcoming day, which is the default.
	 */
	import CalendarPopover from './CalendarPopover.svelte';
	import { filters } from '$lib/stores/filters.svelte';
	import { today as todayStore } from '$lib/stores/today.svelte';
	import { addDaysToDateString } from '$lib/london-date';
	import { useModalKeyboardTrap } from '$lib/utils';
	import { trackFilterChange } from '$lib/analytics/posthog';

	type Range = 'today' | 'tomorrow' | 'this-week';

	const range = $derived.by<Range | 'all' | 'custom'>(() => {
		const t = todayStore.value;
		if (!filters.dateFrom && !filters.dateTo) return 'all';
		if (filters.dateFrom === t && filters.dateTo === t) return 'today';
		const tomorrow = addDaysToDateString(t, 1);
		if (filters.dateFrom === tomorrow && filters.dateTo === tomorrow) return 'tomorrow';
		if (filters.dateFrom === t && filters.dateTo === addDaysToDateString(t, 7)) return 'this-week';
		return 'custom';
	});

	const PILLS: { value: Range; label: string }[] = [
		{ value: 'today', label: 'Today' },
		{ value: 'tomorrow', label: 'Tomorrow' },
		{ value: 'this-week', label: 'This week' }
	];

	function setRange(value: Range) {
		if (range === value) {
			trackFilterChange('date_range', value, 'removed');
			filters.dateFrom = null;
			filters.dateTo = null;
			return;
		}
		trackFilterChange('date_range', value, 'set');
		if (value === 'today') filters.setDatePreset('today');
		else if (value === 'tomorrow') {
			const iso = addDaysToDateString(todayStore.value, 1);
			filters.dateFrom = iso;
			filters.dateTo = iso;
		} else filters.setDatePreset('7days');
	}

	let pickerOpen = $state(false);
	let pickerEl = $state<HTMLDivElement>();
	let triggerEl = $state<HTMLButtonElement>();

	$effect(() => {
		if (!pickerOpen || !pickerEl) return;
		return useModalKeyboardTrap(pickerEl, () => (pickerOpen = false), {
			lockBodyScroll: false,
			returnFocusTo: triggerEl
		});
	});

	// The sidebar drawer slides with a transform, which would make this fixed
	// overlay position against the drawer; render it on <body> instead.
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}
</script>

<div class="days" role="group" aria-label="Day">
	{#each PILLS as p (p.value)}
		<button type="button" aria-pressed={range === p.value} class:on={range === p.value} onclick={() => setRange(p.value)}>
			{p.label}
		</button>
	{/each}
	<button
		bind:this={triggerEl}
		type="button"
		class="cal"
		class:on={range === 'custom'}
		aria-haspopup="dialog"
		aria-label={range === 'custom' ? 'Pick a date (a custom date is set)' : 'Pick a date'}
		onclick={() => (pickerOpen = true)}
	>
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<rect x="2.5" y="3.5" width="11" height="10" stroke="currentColor" stroke-width="1.3" />
			<path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.3" />
		</svg>
	</button>
</div>

{#if pickerOpen}
	<div
		bind:this={pickerEl}
		use:portal
		data-nested-modal
		class="cal-overlay"
		role="dialog"
		aria-modal="true"
		aria-label="Pick a date"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) pickerOpen = false;
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				// Immediate: Svelte delegates this handler to `document`, where the
				// drawer's trap also listens. By the time that listener runs the
				// overlay is already gone, so it would close the drawer as well.
				e.stopImmediatePropagation();
				pickerOpen = false;
			}
		}}
	>
		<div class="cal-wrap">
			<CalendarPopover
				selected={filters.dateFrom ?? todayStore.value}
				today={todayStore.value}
				width={340}
				onSelect={(iso) => {
					trackFilterChange('date_preset', 'custom', 'set');
					filters.dateFrom = iso;
					filters.dateTo = iso;
					pickerOpen = false;
				}}
				onClose={() => (pickerOpen = false)}
			/>
		</div>
	</div>
{/if}

<style>
	.days {
		--ink: #1f1f1f;
		--cream: #eae5c2;
		display: flex;
		height: 44px;
		background: #ffffff;
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
		padding: 0 6px;
		border: 0;
		border-left: 1px solid var(--ink);
		background: #ffffff;
		color: var(--ink);
		font-family: var(--font-sans);
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		white-space: nowrap;
		cursor: pointer;
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}

	button:first-child { border-left: 0; }
	button:hover:not(.on) { background: var(--cream); }
	button.on { background: var(--ink); color: var(--cream); }
	button.cal { flex: 0 0 44px; padding: 0; }

	/* The desktop sidebar is 280px inside its padding: keep TOMORROW off the rules. */
	@media (min-width: 1024px) {
		button { padding: 0 2px; font-size: 11px; letter-spacing: 0; }
		button.cal { flex-basis: 40px; }
	}

	button:focus-visible { outline: 2px solid var(--ink); outline-offset: -4px; }
	button.on:focus-visible { outline-color: var(--cream); }

	.cal-overlay {
		position: fixed;
		inset: 0;
		z-index: 95;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		background: rgba(31, 31, 31, 0.55);
	}

	.cal-wrap {
		background: #ffffff;
		border: 1px solid #1f1f1f;
		border-radius: 4px;
		box-shadow: 4px 4px 0 0 #1f1f1f;
		overflow: hidden;
	}
</style>
