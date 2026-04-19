<script lang="ts">
	import { filters } from '$lib/stores/filters.svelte';
	import { toLondonDateStr } from '$lib/utils';
	import CalendarPopover from '$lib/components/filters/CalendarPopover.svelte';

	// Effective date — filter if set, else today (London).
	const today = $derived(toLondonDateStr(new Date()));
	const activeDate = $derived(filters.dateFrom ?? today);

	// Anchor to UTC noon so the London Intl formatter resolves to the intended
	// civil date regardless of the user's local timezone.
	const activeDateObj = $derived(new Date(activeDate + 'T12:00:00Z'));

	// Ordinal e.g. "nineteenth". Cover 1..31.
	const ORDINALS: Record<number, string> = {
		1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh',
		8: 'eighth', 9: 'ninth', 10: 'tenth', 11: 'eleventh', 12: 'twelfth', 13: 'thirteenth',
		14: 'fourteenth', 15: 'fifteenth', 16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth',
		19: 'nineteenth', 20: 'twentieth', 21: 'twenty-first', 22: 'twenty-second',
		23: 'twenty-third', 24: 'twenty-fourth', 25: 'twenty-fifth', 26: 'twenty-sixth',
		27: 'twenty-seventh', 28: 'twenty-eighth', 29: 'twenty-ninth', 30: 'thirtieth',
		31: 'thirty-first'
	};

	const weekday = $derived(
		new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Europe/London' }).format(activeDateObj)
	);
	const dayNum = $derived(Number(
		new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'Europe/London' }).format(activeDateObj)
	));
	const ordinal = $derived(ORDINALS[dayNum] ?? `${dayNum}th`);

	// Compose the day strip: prev arrow, Today, and next 4 days of the week.
	interface StripItem { key: string; label: string; date: string; isActive: boolean; }

	function addDays(iso: string, n: number) {
		const d = new Date(iso + 'T12:00:00Z');
		d.setUTCDate(d.getUTCDate() + n);
		return d.toISOString().split('T')[0];
	}

	const stripItems = $derived.by<StripItem[]>(() => {
		const items: StripItem[] = [];
		const todayISO = today;
		items.push({ key: 'today', label: 'Today', date: todayISO, isActive: activeDate === todayISO });
		for (let i = 1; i <= 4; i++) {
			const iso = addDays(todayISO, i);
			const d = new Date(iso + 'T12:00:00Z');
			const label = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/London' }).format(d);
			items.push({ key: iso, label, date: iso, isActive: activeDate === iso });
		}
		return items;
	});

	function selectDate(iso: string | null) {
		if (iso === null || iso === today) {
			filters.dateFrom = null;
			filters.dateTo = null;
		} else {
			filters.dateFrom = iso;
			filters.dateTo = iso;
		}
	}

	function stepDay(delta: number) {
		const base = activeDate;
		const next = addDays(base, delta);
		if (next < today) return;
		selectDate(next);
	}

	let pickerOpen = $state(false);
</script>

<section class="masthead">
	<h1 class="masthead-title" aria-label="{weekday}, the {ordinal}">
		<span class="italic-cap">{weekday.charAt(0)}</span><span>{weekday.slice(1)}</span><span class="italic-comma">,</span> <span class="masthead-muted">the {ordinal}</span>
	</h1>

	<div class="day-strip">
		<button type="button" class="strip-btn strip-arrow" onclick={() => stepDay(-1)} aria-label="Previous day">‹</button>
		{#each stripItems as item (item.key)}
			<button
				type="button"
				class="strip-btn"
				class:active={item.isActive}
				onclick={() => selectDate(item.key === 'today' ? null : item.date)}
				aria-pressed={item.isActive}
			>
				{item.label}
			</button>
		{/each}
		<button type="button" class="strip-btn strip-arrow" onclick={() => stepDay(1)} aria-label="Next day">›</button>

		<div class="picker-wrap">
			<button
				type="button"
				class="pick-date-btn"
				onclick={() => (pickerOpen = !pickerOpen)}
				aria-expanded={pickerOpen}
				aria-haspopup="dialog"
			>
				<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
					<rect x="1.5" y="3" width="13" height="11" stroke="currentColor" stroke-width="1.1" fill="none"/>
					<line x1="1.5" y1="6.5" x2="14.5" y2="6.5" stroke="currentColor" stroke-width="1.1"/>
					<line x1="5" y1="1.5" x2="5" y2="4.5" stroke="currentColor" stroke-width="1.1"/>
					<line x1="11" y1="1.5" x2="11" y2="4.5" stroke="currentColor" stroke-width="1.1"/>
				</svg>
				Pick date
				<span class="chevron">▾</span>
			</button>
			{#if pickerOpen}
				<div class="popover" role="dialog" aria-label="Pick a date">
					<CalendarPopover
						selected={activeDate}
						today={today}
						onSelect={(iso) => { selectDate(iso); pickerOpen = false; }}
						onClose={() => (pickerOpen = false)}
					/>
				</div>
			{/if}
		</div>
	</div>
</section>

<style>
	.masthead {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 2rem;
		padding: 1.5rem 0 1.125rem;
		border-bottom: 1px solid var(--color-border);
		position: relative;
		flex-wrap: wrap;
	}

	.masthead-title {
		margin: 0;
		font-family: var(--font-serif);
		font-weight: 300;
		font-size: 4rem; /* 64px */
		line-height: 0.9;
		letter-spacing: -0.03em;
		color: var(--color-text);
		font-variation-settings: '"SOFT" 100', '"opsz" 144';
	}

	.masthead-title .italic-cap {
		font-weight: 400;
		font-style: italic;
	}

	.masthead-title .italic-comma {
		font-weight: 400;
		font-style: italic;
		color: var(--color-text-tertiary);
	}

	.masthead-title .masthead-muted {
		color: var(--color-text);
	}

	.day-strip {
		display: flex;
		gap: 4px;
		align-items: stretch;
		position: relative;
	}

	.strip-btn {
		min-width: 58px;
		padding: 7px 10px;
		text-align: center;
		background: transparent;
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		cursor: pointer;
		font-family: var(--font-serif);
		font-size: 13px;
		letter-spacing: -0.005em;
		font-weight: 400;
		transition: background-color var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp);
	}

	.strip-btn.active {
		background: var(--color-text);
		color: var(--color-bg);
		font-weight: 500;
	}

	.strip-btn.strip-arrow {
		min-width: 30px;
		padding: 7px 8px;
	}

	.strip-btn:hover:not(.active) {
		background: var(--color-bg-subtle);
		color: var(--color-text);
	}

	.picker-wrap {
		position: relative;
		margin-left: 8px;
	}

	.pick-date-btn {
		padding: 7px 12px;
		background: var(--color-bg);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		cursor: pointer;
		font-family: var(--font-serif);
		font-size: 13px;
		font-weight: 500;
		letter-spacing: -0.005em;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.pick-date-btn .chevron {
		color: var(--color-text-tertiary);
		margin-left: 2px;
	}

	.popover {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 20;
	}

	@media (max-width: 1023px) {
		.masthead {
			padding: 1rem 0;
		}
		.masthead-title {
			font-size: 2.5rem;
			font-variation-settings: '"SOFT" 100', '"opsz" 72';
		}
		.day-strip {
			flex-wrap: wrap;
		}
	}
</style>
