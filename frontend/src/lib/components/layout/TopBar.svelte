<script lang="ts">
	/**
	 * What stays on the page when the sidebar is closed: the burger, the small
	 * logo (phones), ALL / NEW / REP and search on the homepage, and a search
	 * button that opens ⌘K everywhere else. Hidden at 1024px and up unless the
	 * sidebar is collapsed.
	 */
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import ProgrammeToggle from '$lib/components/filters/ProgrammeToggle.svelte';
	import SearchBox from '$lib/components/filters/SearchBox.svelte';
	import PaletteButton from './PaletteButton.svelte';
	import { activeChoices, type NamedCinema } from '$lib/components/filters/active-choices';
	import { filters } from '$lib/stores/filters.svelte';
	import { shell } from '$lib/stores/shell.svelte';
	import { today as todayStore } from '$lib/stores/today.svelte';

	let { cinemas = [] }: { cinemas?: NamedCinema[] } = $props();

	const isHome = $derived(page.url.pathname === '/');
	const choices = $derived(isHome ? activeChoices(filters, cinemas, todayStore.value).length : 0);
	const burgerLabel = $derived(
		'Open menu' + (choices ? `, ${choices} ${choices === 1 ? 'filter' : 'filters'} on` : '')
	);

	// On desktop this bar disappears as the sidebar opens, so hand focus to
	// the sidebar's own Hide button. (The drawer's trap does this on phones.)
	async function openMenu() {
		const onDesktop = shell.desktop;
		shell.openMenu();
		if (!onDesktop) return;
		await tick();
		document.getElementById('sidebar-hide')?.focus();
	}
</script>

<div class="topbar" class:home={isHome}>
	<div class="unit">
		<button
			type="button"
			id="topbar-burger"
			class="burger"
			aria-label={burgerLabel}
			aria-controls="site-sidebar"
			aria-expanded={shell.drawerOpen}
			onclick={openMenu}
		>
			<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="square" />
			</svg>
			{#if choices}
				<span class="badge" aria-hidden="true">{choices}</span>
			{/if}
		</button>
		<a href="/" class="logo-cell" aria-label="pictures london, what’s on">
			<img src="/pictures-mark.png" alt="" width="33" height="44" />
		</a>
		{#if isHome}
			<ProgrammeToggle />
		{/if}
	</div>

	<div class="search">
		{#if isHome}
			<SearchBox id="topbar-search" />
		{:else}
			<PaletteButton />
		{/if}
	</div>
</div>

<style>
	.topbar {
		--ink: #1f1f1f;
		--cream: #eae5c2;
		position: sticky;
		top: 0;
		z-index: 30;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 14px 20px;
		padding: 16px 16px 18px;
		background: var(--color-bg);
	}

	/* Beside the open sidebar the bar has nothing to do. */
	@media (min-width: 1024px) {
		.topbar { padding: 24px 24px 20px; }
		:global(html:not([data-sidebar-collapsed])) .topbar { display: none; }
		.logo-cell { display: none !important; }
	}

	.unit {
		display: flex;
		height: 48px;
		background: #ffffff;
		color: var(--ink);
		border: 1px solid var(--ink);
		border-radius: 4px;
		box-shadow: 4px 4px 0 0 var(--ink);
		overflow: hidden;
	}

	/* Homepage: the bar fills the row on phones, the search goes underneath.
	   Elsewhere the search button sits beside the short burger + logo unit. */
	.search { flex: 1 1 180px; min-width: 0; }
	.home .unit { flex: 1 1 100%; }
	.home .search { flex-basis: 100%; }
	@media (min-width: 1024px) {
		.home .unit { flex: 0 1 560px; min-width: 0; }
		.search,
		.home .search { flex: 1 1 300px; max-width: 460px; }
	}

	.burger {
		position: relative;
		flex: 0 0 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #ffffff;
		color: var(--ink);
		border: 0;
		border-right: 1px solid var(--ink);
		cursor: pointer;
	}
	.burger:hover { background: var(--cream); }

	.badge {
		position: absolute;
		top: 4px;
		right: 3px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: 4px;
		background: var(--ink);
		color: var(--cream);
		font-size: 10px;
		font-weight: 700;
		line-height: 16px;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.logo-cell {
		flex: 0 0 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #efe9dc;
		border-right: 1px solid var(--ink);
	}
	.logo-cell img {
		display: block;
		width: 33px;
		height: 44px;
		mix-blend-mode: multiply;
	}
	/* The joined unit ends at the logo when there is no programme toggle. */
	.topbar:not(.home) .logo-cell { border-right: 0; }

	.burger:focus-visible,
	.logo-cell:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: -4px;
	}
</style>
