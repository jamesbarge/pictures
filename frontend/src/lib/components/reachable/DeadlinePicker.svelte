<script module lang="ts">
	// Hoisted to module scope: built once per module load and shared across
	// every DeadlinePicker instead of reconstructed on each formatSelectedTime
	// call. The configs are constant so the formatted output is byte-identical
	// to the per-call builders they replace.
	const TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
		timeZone: 'Europe/London'
	});
	const DAY_MONTH_FORMATTER = new Intl.DateTimeFormat('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: 'Europe/London'
	});
</script>

<script lang="ts">
	import {
		addDaysToDateString,
		londonClock,
		londonDateString,
		nextLondonDateTime
	} from '$lib/london-date';

	let {
		value = null,
		onchange
	}: {
		value: Date | null;
		onchange: (time: Date | null) => void;
	} = $props();

	interface TimePreset {
		label: string;
		hour: number;
		minute: number;
		nextDay?: boolean;
	}

	const PRESETS: TimePreset[] = [
		{ label: '6 PM', hour: 18, minute: 0 },
		{ label: '8 PM', hour: 20, minute: 0 },
		{ label: '10 PM', hour: 22, minute: 0 },
		{ label: 'MIDNIGHT', hour: 0, minute: 0, nextDay: true }
	];

	// Check which preset is selected
	const selectedPresetLabel = $derived.by(() => {
		if (!value) return null;
		const { hour, minute } = londonClock(value);
		const found = PRESETS.find((p) => {
			const presetHour = p.nextDay ? 0 : p.hour;
			return presetHour === hour && p.minute === minute;
		});
		return found?.label ?? null;
	});

	// Calculate countdown
	const timeRemaining = $derived.by(() => {
		if (!value) return null;
		const now = new Date();
		const diffMs = value.getTime() - now.getTime();
		if (diffMs <= 0) return null;
		const mins = Math.round(diffMs / 60_000);
		const hours = Math.floor(mins / 60);
		const remainingMins = mins % 60;

		if (hours === 0) return `${remainingMins}m remaining`;
		if (remainingMins === 0) return `${hours}h remaining`;
		return `${hours}h ${remainingMins}m remaining`;
	});

	function handlePreset(preset: TimePreset) {
		onchange(nextLondonDateTime(preset.hour, preset.minute, new Date(), preset.nextDay));
	}

	function formatSelectedTime(date: Date): string {
		const now = new Date();
		const todayStr = londonDateString(now);
		const tomorrowStr = addDaysToDateString(todayStr, 1);
		const targetStr = londonDateString(date);

		const timeStr = TIME_FORMATTER.format(date);

		if (targetStr === todayStr) return `Today at ${timeStr}`;
		if (targetStr === tomorrowStr) return `Tomorrow at ${timeStr}`;
		return DAY_MONTH_FORMATTER.format(date) + ` at ${timeStr}`;
	}
</script>

<div class="deadline-picker">
	<span class="label">FINISHED BY</span>

	<div class="presets">
		{#each PRESETS as preset (preset.label)}
			{@const isSelected = selectedPresetLabel === preset.label}
			<button
				class="preset-btn"
				class:preset-selected={isSelected}
				onclick={() => handlePreset(preset)}
			>
				{preset.label}
			</button>
		{/each}
	</div>

	{#if value}
		<div class="selected-display">
			<span class="selected-time">{formatSelectedTime(value)}</span>
			{#if timeRemaining}
				<span class="countdown">{timeRemaining}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.deadline-picker {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.label {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-tertiary);
	}

	.presets {
		display: flex;
		gap: 0;
	}

	.preset-btn {
		flex: 1;
		padding: 0.625rem 0.5rem;
		font-size: var(--font-size-xs);
		font-weight: 600;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-surface);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp),
			border-color var(--duration-fast) var(--ease-sharp);
	}

	/* Collapse adjacent borders */
	.preset-btn + .preset-btn {
		margin-left: -1px;
	}

	.preset-btn:hover {
		color: var(--color-text);
		border-color: var(--color-text);
		z-index: 1;
	}

	.preset-selected {
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
		border-color: var(--color-screening-bg);
		z-index: 2;
	}

	.preset-selected:hover {
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
		border-color: var(--color-screening-bg);
	}

	.selected-display {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: var(--font-size-xs);
	}

	.selected-time {
		color: var(--color-text);
		font-family: var(--font-mono);
	}

	.countdown {
		color: var(--color-accent);
		font-weight: 600;
		font-family: var(--font-mono);
	}
</style>
