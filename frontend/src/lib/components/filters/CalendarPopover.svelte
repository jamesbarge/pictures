<script lang="ts">
	let {
		selected,
		today,
		onSelect,
		onClose,
		width = 360
	}: {
		selected: string;            // YYYY-MM-DD
		today: string;               // YYYY-MM-DD
		onSelect: (iso: string) => void;
		onClose?: () => void;
		width?: number;
	} = $props();

	// Escape closes the popover. Outside-click is handled by the host which
	// toggles the {#if open} wrapper around this component.
	$effect(() => {
		if (!onClose) return;
		const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	});

	const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

	// Parse initial selected month/year. Reading `selected` once at mount time
	// is fine here — users navigate months independently via prev/next after that.
	let viewMonth = $state(0);
	let viewYear = $state(2026);
	$effect(() => {
		// Initialise exactly once from the first render
		const d = new Date(selected + 'T12:00:00Z');
		viewMonth = d.getUTCMonth();
		viewYear = d.getUTCFullYear();
	});

	function prev() {
		if (viewMonth === 0) { viewMonth = 11; viewYear--; } else { viewMonth--; }
	}
	function next() {
		if (viewMonth === 11) { viewMonth = 0; viewYear++; } else { viewMonth++; }
	}

	function pad(n: number) { return n < 10 ? '0' + n : String(n); }
	function toISO(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

	interface Cell { date: string; day: number; isCurrent: boolean; isPast: boolean; isToday: boolean; isSelected: boolean; }

	const days = $derived.by<Cell[]>(() => {
		const first = new Date(Date.UTC(viewYear, viewMonth, 1));
		const last = new Date(Date.UTC(viewYear, viewMonth + 1, 0));
		let startDow = first.getUTCDay() - 1; // Mon = 0
		if (startDow < 0) startDow = 6;

		const out: Cell[] = [];
		// Pad previous month
		for (let i = startDow - 1; i >= 0; i--) {
			const d = new Date(Date.UTC(viewYear, viewMonth, -i));
			const iso = toISO(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
			out.push({ date: iso, day: d.getUTCDate(), isCurrent: false, isPast: iso < today, isToday: iso === today, isSelected: iso === selected });
		}
		for (let d = 1; d <= last.getUTCDate(); d++) {
			const iso = toISO(viewYear, viewMonth, d);
			out.push({ date: iso, day: d, isCurrent: true, isPast: iso < today, isToday: iso === today, isSelected: iso === selected });
		}
		// Pad next month up to a complete week row
		while (out.length % 7 !== 0) {
			const d = out.length - startDow - last.getUTCDate() + 1;
			const nd = new Date(Date.UTC(viewYear, viewMonth + 1, d));
			const iso = toISO(nd.getUTCFullYear(), nd.getUTCMonth(), nd.getUTCDate());
			out.push({ date: iso, day: nd.getUTCDate(), isCurrent: false, isPast: iso < today, isToday: iso === today, isSelected: iso === selected });
		}
		return out;
	});

	function click(c: Cell) {
		if (c.isPast) return;
		onSelect(c.date);
	}
</script>

<div class="calendar" style="width: {width}px">
	<div class="cal-head">
		<button class="cal-nav" onclick={prev} aria-label="Previous month" type="button">‹</button>
		<div class="cal-title">
			{MONTH_NAMES[viewMonth]}
			<span class="year">{viewYear}</span>
		</div>
		<button class="cal-nav" onclick={next} aria-label="Next month" type="button">›</button>
	</div>

	<div class="cal-weekdays">
		{#each ['Mo','Tu','We','Th','Fr','Sa','Su'] as d, i (d + i)}
			<div class="cal-weekday" class:is-weekend={i >= 5}>{d}</div>
		{/each}
	</div>

	<div class="cal-grid">
		{#each days as cell (cell.date)}
			<button
				class="cal-cell"
				class:is-current={cell.isCurrent}
				class:is-past={cell.isPast}
				class:is-today={cell.isToday}
				class:is-selected={cell.isSelected}
				onclick={() => click(cell)}
				disabled={cell.isPast}
				type="button"
				aria-label={cell.date}
				aria-current={cell.isToday ? 'date' : undefined}
			>
				<span class="cal-day">{cell.day}</span>
			</button>
		{/each}
	</div>

	<div class="cal-foot">
		<button class="cal-today" onclick={() => onSelect(today)} type="button">Today</button>
		{#if onClose}
			<button class="cal-close" onclick={onClose} type="button">Close</button>
		{/if}
	</div>
</div>

<style>
	.calendar {
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		font-family: var(--font-serif);
		color: var(--color-text);
	}

	.cal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px 8px;
	}

	.cal-nav {
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: var(--font-serif);
		font-size: 22px;
		color: var(--color-text-secondary);
		padding: 0 4px;
		line-height: 1;
	}

	.cal-title {
		font-family: var(--font-serif);
		font-size: 20px;
		font-weight: 300;
		letter-spacing: -0.02em;
		font-variation-settings: '"SOFT" 100', '"opsz" 72';
	}

	.cal-title .year {
		font-family: var(--font-serif-italic);
		font-style: italic;
		color: var(--color-text-tertiary);
		margin-left: 6px;
	}

	.cal-weekdays {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		padding: 0 14px 6px;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.cal-weekday {
		text-align: center;
		font-family: var(--font-mono-plex);
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-text-tertiary);
	}

	.cal-weekday.is-weekend {
		color: var(--color-accent);
	}

	.cal-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		padding: 6px 8px 6px;
	}

	.cal-cell {
		aspect-ratio: 1 / 1;
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: var(--font-serif);
		font-size: 14px;
		color: var(--color-text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.cal-cell:not(.is-current) .cal-day { color: var(--color-text-tertiary); opacity: 0.45; }
	.cal-cell.is-past:not(.is-today) { cursor: not-allowed; color: var(--color-text-tertiary); opacity: 0.35; }
	.cal-cell.is-today .cal-day { font-weight: 600; color: var(--color-text); }
	.cal-cell.is-selected {
		background: var(--color-text);
		color: var(--color-bg);
	}
	.cal-cell.is-selected .cal-day { color: var(--color-bg); font-weight: 500; }
	.cal-cell:not(:disabled):not(.is-selected):hover { background: var(--color-bg-subtle); }

	.cal-foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 14px 10px;
		border-top: 1px solid var(--color-border-subtle);
	}

	.cal-today, .cal-close {
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 13px;
		color: var(--color-text-secondary);
	}
	.cal-today:hover, .cal-close:hover { color: var(--color-text); }
</style>
