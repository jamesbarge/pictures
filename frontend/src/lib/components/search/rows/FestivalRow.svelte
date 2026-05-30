<script lang="ts">
	import type { FestivalResult } from '$lib/search/result-types';

	interface Props {
		festival: FestivalResult;
		selected: boolean;
		id: string;
	}

	let { festival, selected, id }: Props = $props();

	const initials = $derived(
		(festival.shortName ?? festival.name)
			.split(/\s+/)
			.slice(0, 3)
			.map((w) => w[0])
			.join('')
			.toUpperCase()
	);

	const dateRange = $derived.by(() => {
		const fmt = new Intl.DateTimeFormat('en-GB', {
			month: 'short',
			day: 'numeric',
			timeZone: 'Europe/London'
		});
		return `${fmt.format(new Date(festival.startDate))} – ${fmt.format(new Date(festival.endDate))}`;
	});
</script>

<button
	type="button"
	role="option"
	aria-selected={selected}
	{id}
	class="row"
	class:selected
	data-result-row
>
	{#if festival.logoUrl}
		<img src={festival.logoUrl} alt="" class="logo" width="32" height="32" loading="lazy" decoding="async" />
	{:else}
		<div class="monogram" aria-hidden="true">{initials}</div>
	{/if}
	<div class="meta">
		<span class="name">{festival.name}</span>
		<span class="sub">{dateRange} · {festival.year}</span>
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
	.logo,
	.monogram {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
	}
	.monogram {
		background: var(--color-bg-subtle);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 700;
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
	.name {
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
</style>
