<script lang="ts">
	import { filters } from '$lib/stores/filters.svelte';
	import { toLondonDateStr } from '$lib/utils';

	let { open, onClose }: { open: boolean; onClose: () => void } = $props();

	// Modal a11y — Escape closes + body scroll locks while the picker is up.
	$effect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
		document.addEventListener('keydown', handler);
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.removeEventListener('keydown', handler);
			document.body.style.overflow = prevOverflow;
		};
	});

	const today = toLondonDateStr(new Date());
	const initial = new Date((filters.dateFrom ?? today) + 'T12:00:00Z');
	let viewMonth = $state(initial.getUTCMonth());
	let viewYear = $state(initial.getUTCFullYear());

	const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

	function prev() { if (viewMonth === 0) { viewMonth = 11; viewYear--; } else viewMonth--; }
	function next() { if (viewMonth === 11) { viewMonth = 0; viewYear++; } else viewMonth++; }

	function pad(n: number) { return n < 10 ? '0' + n : String(n); }
	function toISO(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

	interface Cell { date: string; day: number; isCurrent: boolean; isPast: boolean; isToday: boolean; isSelected: boolean; dow: number; }

	const cells = $derived.by<Cell[]>(() => {
		const first = new Date(Date.UTC(viewYear, viewMonth, 1));
		const last = new Date(Date.UTC(viewYear, viewMonth + 1, 0));
		let startDow = first.getUTCDay() - 1;
		if (startDow < 0) startDow = 6;

		const out: Cell[] = [];
		for (let i = startDow - 1; i >= 0; i--) {
			const d = new Date(Date.UTC(viewYear, viewMonth, -i));
			const iso = toISO(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
			const dow = (d.getUTCDay() + 6) % 7;
			out.push({ date: iso, day: d.getUTCDate(), isCurrent: false, isPast: iso < today, isToday: iso === today, isSelected: iso === filters.dateFrom, dow });
		}
		for (let d = 1; d <= last.getUTCDate(); d++) {
			const dt = new Date(Date.UTC(viewYear, viewMonth, d));
			const iso = toISO(viewYear, viewMonth, d);
			const dow = (dt.getUTCDay() + 6) % 7;
			out.push({ date: iso, day: d, isCurrent: true, isPast: iso < today, isToday: iso === today, isSelected: iso === filters.dateFrom, dow });
		}
		while (out.length % 7 !== 0) {
			const d = out.length - startDow - last.getUTCDate() + 1;
			const dt = new Date(Date.UTC(viewYear, viewMonth + 1, d));
			const iso = toISO(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
			const dow = (dt.getUTCDay() + 6) % 7;
			out.push({ date: iso, day: dt.getUTCDate(), isCurrent: false, isPast: iso < today, isToday: iso === today, isSelected: iso === filters.dateFrom, dow });
		}
		return out;
	});

	function select(c: Cell) {
		if (c.isPast) return;
		filters.dateFrom = c.date;
		filters.dateTo = c.date;
		onClose();
	}

	function clearDate() {
		filters.dateFrom = null;
		filters.dateTo = null;
		onClose();
	}
</script>

{#if open}
	<div class="backdrop" onclick={onClose} role="presentation"></div>
	<div class="sheet" role="dialog" aria-label="Pick a date" aria-modal="true">
		<div class="grabber-wrap"><div class="grabber"></div></div>

		<div class="sheet-head">
			<h3 class="title"><span class="italic-cap">P</span>ick a date</h3>
			<button class="close-btn" type="button" onclick={onClose}>Close</button>
		</div>

		<div class="month-head">
			<button type="button" class="nav-btn" onclick={prev} aria-label="Previous month">‹</button>
			<div class="month-name">
				<span class="italic-cap">{MONTH_NAMES[viewMonth].charAt(0)}</span>{MONTH_NAMES[viewMonth].slice(1)}
				<span class="year">{viewYear}</span>
			</div>
			<button type="button" class="nav-btn" onclick={next} aria-label="Next month">›</button>
		</div>

		<div class="weekdays">
			{#each ['Mo','Tu','We','Th','Fr','Sa','Su'] as d, i (d + i)}
				<div class="wk" class:weekend={i >= 5}>{d}</div>
			{/each}
		</div>

		<div class="grid">
			{#each cells as c (c.date)}
				<button
					class="cell"
					class:current={c.isCurrent}
					class:past={c.isPast}
					class:today={c.isToday}
					class:selected={c.isSelected}
					class:weekend={c.dow >= 5}
					onclick={() => select(c)}
					disabled={c.isPast}
					type="button"
					aria-label={c.date}
				>
					<span class="day-num">{c.day}</span>
				</button>
			{/each}
		</div>

		<div class="foot">
			<button class="any-date" type="button" onclick={clearDate}>Any date</button>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(10, 6, 4, 0.55);
		z-index: 90;
	}

	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 91;
		background: var(--color-bg);
		border-top: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		max-height: 85%;
	}

	.grabber-wrap {
		display: flex;
		justify-content: center;
		padding: 10px 0 2px;
	}

	.grabber {
		width: 40px;
		height: 3px;
		background: var(--color-border-subtle);
	}

	.sheet-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 10px 18px 14px;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.title {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 22px;
		font-weight: 300;
		letter-spacing: -0.02em;
		color: var(--color-text);
		font-variation-settings: '"SOFT" 100', '"opsz" 48';
	}

	.title .italic-cap { font-style: italic; font-weight: 400; }

	.close-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 14px;
		color: var(--color-text-secondary);
		padding: 0;
	}

	.month-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 14px 18px 10px;
	}

	.nav-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: var(--font-serif);
		font-size: 22px;
		color: var(--color-text-secondary);
		padding: 0 6px;
		line-height: 1;
	}

	.month-name {
		font-family: var(--font-serif);
		font-size: 20px;
		font-weight: 300;
		letter-spacing: -0.02em;
		font-variation-settings: '"SOFT" 100', '"opsz" 72';
	}

	.month-name .italic-cap { font-style: italic; font-weight: 400; }
	.month-name .year {
		font-family: var(--font-serif-italic);
		font-style: italic;
		color: var(--color-text-tertiary);
		margin-left: 6px;
	}

	.weekdays {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		padding: 0 14px 6px;
		border-bottom: 1px solid var(--color-border-subtle);
	}

	.wk {
		text-align: center;
		font-family: var(--font-mono-plex);
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-text-tertiary);
	}

	.wk.weekend { color: var(--color-accent); }

	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		padding: 8px 8px;
	}

	.cell {
		aspect-ratio: 1 / 1;
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: var(--font-serif);
		font-size: 15px;
		color: var(--color-text);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.cell:not(.current) .day-num { color: var(--color-text-tertiary); opacity: 0.4; }
	.cell.past:not(.today) { opacity: 0.35; cursor: not-allowed; }
	.cell.today .day-num { font-weight: 600; }
	.cell.selected {
		background: var(--color-text);
	}
	.cell.selected .day-num { color: var(--color-bg); font-weight: 500; }
	.cell.weekend.current:not(.selected) .day-num { color: var(--color-accent); }

	.foot {
		border-top: 1px solid var(--color-border-subtle);
		padding: 12px 18px 22px;
		display: flex;
		justify-content: center;
	}

	.any-date {
		background: transparent;
		border: 1px solid var(--color-border);
		padding: 10px 14px;
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 14px;
		color: var(--color-text);
		cursor: pointer;
	}
</style>
