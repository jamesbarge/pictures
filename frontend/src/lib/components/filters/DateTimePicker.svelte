<script lang="ts">
	import Dropdown from '$lib/components/ui/Dropdown.svelte';
	import { filters } from '$lib/stores/filters.svelte';
	import { TIME_PRESETS, formatHour } from '$lib/constants/filters';
	import { toLondonDateStr } from '$lib/utils';
	import { trackFilterChange } from '$lib/analytics/posthog';

	let open = $state(false);
	let showCustomTime = $state(false);

	// Calendar state
	let calendarMonth = $state(new Date().getMonth());
	let calendarYear = $state(new Date().getFullYear());

	const label = $derived.by(() => {
		if (!filters.dateFrom && !filters.dateTo && filters.timeFrom === null) return 'WHEN';

		const parts: string[] = [];

		if (filters.dateFrom) {
			const d = new Date(filters.dateFrom + 'T00:00:00');
			const now = new Date();
			const today = now.toISOString().split('T')[0];
			if (filters.dateFrom === today && filters.dateTo === today) {
				parts.push('Today');
			} else if (filters.dateFrom === filters.dateTo) {
				parts.push(d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }));
			} else if (filters.dateTo) {
				const dTo = new Date(filters.dateTo + 'T00:00:00');
				parts.push(`${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${dTo.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`);
			}
		}

		if (filters.timeFrom !== null && filters.timeTo !== null) {
			parts.push(`${formatHour(filters.timeFrom)}–${formatHour(filters.timeTo)}`);
		}

		return parts.join(', ').toUpperCase() || 'WHEN';
	});

	const hasDateFilter = $derived(filters.dateFrom !== null || filters.dateTo !== null);
	const hasTimeFilter = $derived(filters.timeFrom !== null);

	// Calendar grid
	const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

	const calendarDays = $derived.by(() => {
		const firstDay = new Date(calendarYear, calendarMonth, 1);
		const lastDay = new Date(calendarYear, calendarMonth + 1, 0);

		// Monday = 0, Sunday = 6
		let startDow = firstDay.getDay() - 1;
		if (startDow < 0) startDow = 6;

		const days: Array<{ date: string; day: number; isCurrentMonth: boolean; isPast: boolean; isToday: boolean; isSelected: boolean; isInRange: boolean }> = [];

		// Fill previous month padding
		for (let i = startDow - 1; i >= 0; i--) {
			const d = new Date(calendarYear, calendarMonth, -i);
			const dateStr = toDateStr(d);
			days.push({ date: dateStr, day: d.getDate(), isCurrentMonth: false, isPast: true, isToday: false, isSelected: false, isInRange: false });
		}

		const todayStr = toDateStr(new Date());

		// Fill current month
		for (let day = 1; day <= lastDay.getDate(); day++) {
			const d = new Date(calendarYear, calendarMonth, day);
			const dateStr = toDateStr(d);
			const isPast = dateStr < todayStr;
			const isToday = dateStr === todayStr;
			const isSelected = dateStr === filters.dateFrom || dateStr === filters.dateTo;
			const isInRange = !!(filters.dateFrom && filters.dateTo && dateStr > filters.dateFrom && dateStr < filters.dateTo);
			days.push({ date: dateStr, day, isCurrentMonth: true, isPast, isToday, isSelected, isInRange });
		}

		// Fill next month padding to complete the grid
		const remaining = 42 - days.length;
		for (let i = 1; i <= remaining; i++) {
			const d = new Date(calendarYear, calendarMonth + 1, i);
			const dateStr = toDateStr(d);
			days.push({ date: dateStr, day: i, isCurrentMonth: false, isPast: false, isToday: false, isSelected: false, isInRange: false });
		}

		return days;
	});

	const monthLabel = $derived(
		new Date(calendarYear, calendarMonth).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase()
	);

	function toDateStr(d: Date): string {
		return toLondonDateStr(d);
	}

	function prevMonth() {
		if (calendarMonth === 0) { calendarMonth = 11; calendarYear--; }
		else calendarMonth--;
	}

	function nextMonth() {
		if (calendarMonth === 11) { calendarMonth = 0; calendarYear++; }
		else calendarMonth++;
	}

	function selectDate(dateStr: string) {
		if (!filters.dateFrom || (filters.dateFrom && filters.dateTo)) {
			// Start new selection
			filters.dateFrom = dateStr;
			filters.dateTo = dateStr;
		} else {
			// Complete range
			if (dateStr < filters.dateFrom) {
				filters.dateTo = filters.dateFrom;
				filters.dateFrom = dateStr;
			} else {
				filters.dateTo = dateStr;
			}
		}
	}

	function selectPreset(preset: 'today' | 'weekend' | '7days') {
		filters.setDatePreset(preset);
		trackFilterChange('date', preset, 'set');
	}

	function clearDate() {
		filters.setDatePreset(null);
		trackFilterChange('date', null, 'cleared');
	}

	function selectTimePreset(from: number, to: number) {
		if (filters.timeFrom === from && filters.timeTo === to) {
			filters.clearTimeRange();
			trackFilterChange('time', null, 'cleared');
		} else {
			filters.setTimePreset(from, to);
			trackFilterChange('time', `${formatHour(from)}-${formatHour(to)}`, 'set');
		}
	}

	function handleCustomTimeFrom(e: Event) {
		const val = parseInt((e.target as HTMLSelectElement).value);
		filters.timeFrom = val;
		if (filters.timeTo === null || filters.timeTo <= val) {
			filters.timeTo = Math.min(val + 3, 23);
		}
	}

	function handleCustomTimeTo(e: Event) {
		filters.timeTo = parseInt((e.target as HTMLSelectElement).value);
	}
</script>

<div class="relative">
	<button
		class="picker-trigger"
		class:active={hasDateFilter || hasTimeFilter}
		onclick={() => (open = !open)}
		aria-label="Date and time filter"
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		{label}
		<svg aria-hidden="true" width="10" height="6" viewBox="0 0 10 6" fill="none" class="chevron" class:flip={open}>
			<path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>
		</svg>
	</button>

	<Dropdown {open} onClose={() => (open = false)}>
		<div class="datetime-dropdown">
			<!-- Date presets -->
			<div class="section">
				<div class="section-label">DATE</div>
				<div class="preset-row">
					<button class="preset-btn" class:active={!hasDateFilter} onclick={clearDate}>ANY</button>
					<button class="preset-btn" class:active={filters.dateFrom === toDateStr(new Date()) && filters.dateFrom === filters.dateTo} onclick={() => selectPreset('today')}>TODAY</button>
					<button class="preset-btn" onclick={() => selectPreset('weekend')}>WEEKEND</button>
					<button class="preset-btn" onclick={() => selectPreset('7days')}>7 DAYS</button>
				</div>
			</div>

			<!-- Calendar grid -->
			<div class="calendar">
				<div class="cal-nav">
					<button class="cal-nav-btn" onclick={prevMonth} aria-label="Previous month">←</button>
					<span class="cal-month">{monthLabel}</span>
					<button class="cal-nav-btn" onclick={nextMonth} aria-label="Next month">→</button>
				</div>

				<div class="cal-grid">
					{#each DAYS as day}
						<span class="cal-day-header">{day}</span>
					{/each}

					{#each calendarDays as d}
						<button
							class="cal-day"
							class:other-month={!d.isCurrentMonth}
							class:past={d.isPast}
							class:today={d.isToday}
							class:selected={d.isSelected}
							class:in-range={d.isInRange}
							disabled={d.isPast && !d.isToday}
							onclick={() => selectDate(d.date)}
						>
							{d.day}
						</button>
					{/each}
				</div>
			</div>

			<div class="divider"></div>

			<!-- Time section -->
			<div class="section">
				<div class="section-label">TIME</div>
				<div class="preset-row">
					{#each TIME_PRESETS as preset}
						<button
							class="preset-btn"
							class:active={filters.timeFrom === preset.from && filters.timeTo === preset.to}
							onclick={() => selectTimePreset(preset.from, preset.to)}
							title={preset.description}
						>
							{preset.label}
						</button>
					{/each}
				</div>

				<button
					class="custom-toggle"
					onclick={() => (showCustomTime = !showCustomTime)}
				>
					{showCustomTime ? '− HIDE' : '+ CUSTOM RANGE'}
				</button>

				{#if showCustomTime}
					<div class="custom-time-row">
						<select class="time-select" value={filters.timeFrom ?? 0} onchange={handleCustomTimeFrom}>
							{#each Array.from({ length: 24 }, (_, i) => i) as hour}
								<option value={hour}>{formatHour(hour)}</option>
							{/each}
						</select>
						<span class="time-separator">–</span>
						<select class="time-select" value={filters.timeTo ?? 23} onchange={handleCustomTimeTo}>
							{#each Array.from({ length: 24 }, (_, i) => i) as hour}
								<option value={hour}>{formatHour(hour)}</option>
							{/each}
						</select>
					</div>
				{/if}
			</div>
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

	.datetime-dropdown {
		width: 320px;
		padding: 0.5rem 0;
	}

	@media (max-width: 767px) {
		.datetime-dropdown {
			width: 100%;
		}
	}

	.section {
		padding: 0.375rem 0.75rem;
	}

	.section-label {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--color-text-tertiary);
		margin-bottom: 0.5rem;
	}

	.preset-row {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.preset-btn {
		padding: 0.3rem 0.5rem;
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-secondary);
		background: transparent;
		border: 1px solid var(--color-border-subtle);
		cursor: pointer;
		transition: all var(--duration-fast) var(--ease-sharp);
	}

	.preset-btn:hover {
		border-color: var(--color-border);
		color: var(--color-text);
	}

	.preset-btn.active {
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
		border-color: var(--color-screening-bg);
	}

	/* Calendar */
	.calendar {
		padding: 0.5rem 0.75rem;
	}

	.cal-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.cal-nav-btn {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		background: transparent;
		border: 1px solid var(--color-border-subtle);
		cursor: pointer;
	}

	.cal-nav-btn:hover {
		border-color: var(--color-border);
		color: var(--color-text);
	}

	.cal-month {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text);
	}

	.cal-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 1px;
	}

	.cal-day-header {
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-tertiary);
		text-align: center;
		padding: 0.25rem 0;
		font-family: var(--font-mono);
	}

	.cal-day {
		width: 100%;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--font-size-xs);
		font-family: var(--font-mono);
		color: var(--color-text);
		background: transparent;
		border: 1px solid transparent;
		cursor: pointer;
		transition: all var(--duration-fast) var(--ease-sharp);
	}

	.cal-day:hover:not(:disabled) {
		border-color: var(--color-border);
	}

	.cal-day.other-month {
		color: var(--color-text-tertiary);
		opacity: 0.4;
	}

	.cal-day.past {
		color: var(--color-text-tertiary);
		opacity: 0.3;
	}

	.cal-day.today {
		border-color: var(--color-accent);
		font-weight: 600;
	}

	.cal-day.selected {
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
		border-color: var(--color-screening-bg);
	}

	.cal-day.in-range {
		background: var(--color-bg-subtle);
	}

	.cal-day:disabled {
		cursor: default;
	}

	.divider {
		height: 1px;
		background: var(--color-border-subtle);
		margin: 0.5rem 0;
	}

	.custom-toggle {
		margin-top: 0.5rem;
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-tertiary);
		background: transparent;
		border: none;
		cursor: pointer;
	}

	.custom-toggle:hover {
		color: var(--color-text);
	}

	.custom-time-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.time-select {
		flex: 1;
		padding: 0.3rem 0.375rem;
		font-size: var(--font-size-xs);
		font-family: var(--font-mono);
		color: var(--color-text);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		outline: none;
	}

	.time-separator {
		font-size: var(--font-size-sm);
		color: var(--color-text-tertiary);
	}
</style>
