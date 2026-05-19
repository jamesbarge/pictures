<script lang="ts">
	import type { ScreeningResult } from '$lib/search/result-types';

	interface Props {
		screening: ScreeningResult;
		selected: boolean;
		id: string;
	}

	let { screening, selected, id }: Props = $props();

	function formatRelativeTime(iso: string): string {
		const d = new Date(iso);
		const time = new Intl.DateTimeFormat('en-GB', {
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'Europe/London'
		}).format(d);
		const today = new Date();
		const sameDay =
			d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) ===
			today.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
		if (sameDay) return `TONIGHT ${time}`;
		const day = new Intl.DateTimeFormat('en-GB', {
			weekday: 'short',
			timeZone: 'Europe/London'
		}).format(d).toUpperCase();
		return `${day} ${time}`;
	}

	const timeLabel = $derived(formatRelativeTime(screening.datetime));
</script>

<button
	type="button"
	role="option"
	aria-selected={selected}
	{id}
	class="row"
	class:selected
	class:sold-out={screening.isSoldOut}
	data-result-row
>
	<div class="time-col">
		<span class="time">{timeLabel}</span>
	</div>
	<div class="meta">
		<span class="film">{screening.filmTitle}</span>
		<span class="sub">{screening.cinemaShortName ?? screening.cinemaName}</span>
	</div>
	<div class="tags">
		{#if screening.format}
			<span class="tag">{screening.format.replace(/_/g, ' ').toUpperCase()}</span>
		{/if}
		{#if screening.eventType}
			<span class="tag">{screening.eventType.toUpperCase()}</span>
		{/if}
		{#if screening.isSoldOut}
			<span class="sold-tag">SOLD OUT</span>
		{:else}
			<span class="arrow" aria-hidden="true">→</span>
		{/if}
	</div>
</button>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 8px 12px;
		background: transparent;
		border: none;
		border-left: 2px solid transparent;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: var(--color-text);
	}
	.row.selected,
	.row:hover {
		background: var(--color-bg-subtle);
		border-left-color: var(--color-accent);
	}
	.row.sold-out {
		opacity: 0.5;
	}
	.time-col {
		flex-shrink: 0;
		min-width: 80px;
	}
	.time {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 11px;
		letter-spacing: 0.04em;
		color: var(--color-text);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}
	.film {
		font-size: 14px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sub {
		font-size: 11px;
		color: var(--color-text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tags {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}
	.tag {
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.06em;
		padding: 2px 4px;
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
	}
	.sold-tag {
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.06em;
		color: var(--color-text-tertiary);
	}
	.arrow {
		color: var(--color-text-tertiary);
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
	}
</style>
