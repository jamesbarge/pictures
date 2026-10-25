<script lang="ts">
	/**
	 * The site's one navigation surface: logo, nav and, on the homepage, every
	 * filter. At 1024px and up it sits beside the page and collapses to the top
	 * bar's burger; below that it is a drawer from the left.
	 */
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import ProgrammeToggle from '$lib/components/filters/ProgrammeToggle.svelte';
	import SearchBox from '$lib/components/filters/SearchBox.svelte';
	import DayPills from '$lib/components/filters/DayPills.svelte';
	import FilterSections from '$lib/components/filters/FilterSections.svelte';
	import PaletteButton from './PaletteButton.svelte';
	import { filters } from '$lib/stores/filters.svelte';
	import { shell } from '$lib/stores/shell.svelte';
	import { palette } from '$lib/stores/palette.svelte';
	import { useModalKeyboardTrap } from '$lib/utils';

	interface SidebarCinema {
		id: string;
		name: string;
		shortName: string | null;
		address: { area: string } | null;
		coordinates?: { lat: number; lng: number } | null;
	}

	let { cinemas = [] }: { cinemas?: SidebarCinema[] } = $props();

	const path = $derived(page.url.pathname);
	const isHome = $derived(path === '/');
	const isCinemas = $derived(path === '/cinemas' || path.startsWith('/cinemas/') || path === '/map');

	const NAV = [
		{ href: '/', label: 'What’s on', match: (p: string) => p === '/' || p === '/tonight' || p === '/this-weekend' },
		{ href: '/cinemas', label: 'Cinemas', match: (p: string) => p.startsWith('/cinemas') || p === '/map' },
		{ href: '/reachable', label: 'Reachable', match: (p: string) => p.startsWith('/reachable') },
		{ href: '/watchlist', label: 'Watchlist', match: (p: string) => p === '/watchlist' }
	];

	const drawerOpen = $derived(shell.drawerOpen && !shell.desktop);
	const films = $derived(shell.filmCount);
	const filmsLabel = $derived(films === null ? '' : `${films} ${films === 1 ? 'film' : 'films'}`);

	let asideEl = $state<HTMLElement>();
	let scrollEl = $state<HTMLDivElement>();

	// Drawer: trap focus, Escape closes, focus returns to the burger. Yields
	// while a dialog opened from inside it (the date picker, ⌘K) is up.
	$effect(() => {
		if (!drawerOpen || !asideEl) return;
		if (scrollEl) scrollEl.scrollTop = 0;
		return useModalKeyboardTrap(asideEl, () => (shell.drawerOpen = false), {
			isActive: () => !palette.open && !document.querySelector('[data-nested-modal]')
		});
	});

	// On desktop the button that hid the sidebar disappears with it, so hand
	// focus to the burger that brings it back. (The drawer's trap does this on phones.)
	async function hideMenu() {
		const onDesktop = shell.desktop;
		shell.closeMenu();
		if (!onDesktop) return;
		await tick();
		document.getElementById('topbar-burger')?.focus();
	}

	// Following a link inside the drawer closes it.
	$effect(() => {
		void path;
		shell.drawerOpen = false;
	});
</script>

<aside
	bind:this={asideEl}
	id="site-sidebar"
	class="sidebar"
	class:open={shell.drawerOpen}
	aria-label="Menu and filters"
	role={drawerOpen ? 'dialog' : undefined}
	aria-modal={drawerOpen ? 'true' : undefined}
>
	<div class="scroll" bind:this={scrollEl}>
		<div class="head">
			<a href="/" class="logo-link" aria-label="pictures london, what’s on">
				<img src="/pictures-mark.png" alt="" class="logo" width="60" height="80" />
			</a>
			<button type="button" id="sidebar-hide" class="hide" onclick={hideMenu} aria-label="Hide menu" aria-controls="site-sidebar">
				<svg class="icon-close" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="square" />
				</svg>
				<svg class="icon-collapse" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<rect x="2" y="2.5" width="12" height="11" stroke="currentColor" stroke-width="1.3" />
					<path d="M6 2.5v11M11 6l-2 2 2 2" stroke="currentColor" stroke-width="1.3" />
				</svg>
			</button>
		</div>

		<div class="controls">
			{#if isHome}
				<div class="desktop-only"><ProgrammeToggle framed /></div>
				<SearchBox id="sidebar-search" height={46} />
				<DayPills />
			{:else}
				<PaletteButton />
			{/if}
		</div>

		<nav class="nav" aria-label="Main">
			{#each NAV as item (item.href)}
				{@const current = item.match(path)}
				<a href={item.href} class="nav-link" class:current aria-current={current ? 'page' : undefined}>
					<span class="marker" aria-hidden="true"></span>{item.label}
				</a>
			{/each}
		</nav>

		{#if isHome}
			<FilterSections {cinemas} />

			<div class="row tally desktop-only">
				<span class="count" aria-live="polite">{filmsLabel}</span>
				<button type="button" class="small-btn" onclick={() => filters.clearAll()}>Reset</button>
			</div>

			<div class="row">
				<h3 id="sidebar-view">View</h3>
				<div class="views" role="radiogroup" aria-labelledby="sidebar-view">
					<button
						type="button"
						role="radio"
						aria-checked={shell.displayMode === 'posters'}
						aria-label="Poster view"
						title="Poster view"
						class:on={shell.displayMode === 'posters'}
						onclick={() => (shell.displayMode = 'posters')}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<rect x="2.5" y="2.5" width="4.5" height="4.5" stroke="currentColor" stroke-width="1.3" />
							<rect x="9" y="2.5" width="4.5" height="4.5" stroke="currentColor" stroke-width="1.3" />
							<rect x="2.5" y="9" width="4.5" height="4.5" stroke="currentColor" stroke-width="1.3" />
							<rect x="9" y="9" width="4.5" height="4.5" stroke="currentColor" stroke-width="1.3" />
						</svg>
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={shell.displayMode === 'text'}
						aria-label="Text view"
						title="Text view"
						class:on={shell.displayMode === 'text'}
						onclick={() => (shell.displayMode = 'text')}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path d="M5.5 4h8M5.5 8h8M5.5 12h8M2 4h1.2M2 8h1.2M2 12h1.2" stroke="currentColor" stroke-width="1.3" />
						</svg>
					</button>
				</div>
			</div>
		{:else if isCinemas}
			<div class="row">
				<h3 id="sidebar-cview">View</h3>
				<div class="views views-text" role="group" aria-labelledby="sidebar-cview">
					<a href="/cinemas" class:on={path !== '/map'} aria-current={path !== '/map' ? 'page' : undefined}>List</a>
					<a href="/map" class:on={path === '/map'} aria-current={path === '/map' ? 'page' : undefined}>Map</a>
				</div>
			</div>
		{/if}

		<nav class="more" aria-label="More">
			<a href="/about">About</a>
			<a href="/privacy">Privacy</a>
			<a href="/terms">Terms</a>
		</nav>
	</div>

	{#if isHome}
		<div class="foot drawer-only">
			<button type="button" class="small-btn reset" onclick={() => filters.clearAll()}>Reset</button>
			<button type="button" class="done" onclick={() => (shell.drawerOpen = false)}>
				Done{filmsLabel ? ` · ${filmsLabel}` : ''}
			</button>
		</div>
	{/if}
</aside>

<!-- Pointer convenience only: keyboard users close the drawer with Escape. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class="scrim"
	class:open={shell.drawerOpen}
	aria-hidden="true"
	onclick={() => (shell.drawerOpen = false)}
></div>

<style>
	/* ── Drawer (below 1024px) ── */
	.sidebar {
		--ink: #1f1f1f;
		--cream: #eae5c2;
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		z-index: 80;
		width: min(320px, 88vw);
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
		color: var(--color-text);
		border-right: 1px solid var(--color-border);
		transform: translateX(-100%);
		visibility: hidden;
		transition: transform 280ms var(--ease-snap), visibility 0s linear 280ms;
	}

	.sidebar.open {
		transform: none;
		visibility: visible;
		transition: transform 280ms var(--ease-snap), visibility 0s;
	}

	.scrim {
		position: fixed;
		inset: 0;
		z-index: 79;
		background: rgba(31, 31, 31, 0.45);
		opacity: 0;
		pointer-events: none;
		transition: opacity 160ms var(--ease-sharp);
	}
	.scrim.open { opacity: 1; pointer-events: auto; }

	.icon-collapse { display: none; }

	/* Two classes so these beat the components' own display rules below. */
	@media (max-width: 1023px) {
		.sidebar .desktop-only { display: none; }
	}

	/* ── Beside the page (1024px and up) ── */
	@media (min-width: 1024px) {
		.sidebar {
			position: sticky;
			z-index: auto;
			flex: 0 0 320px;
			width: 320px;
			height: 100dvh;
			transform: none;
			visibility: visible;
			transition: none;
		}
		:global(html[data-sidebar-collapsed]) .sidebar { display: none; }
		.scrim,
		.sidebar .drawer-only { display: none; }
		.icon-close { display: none; }
		.icon-collapse { display: block; }
	}

	.scroll {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding-bottom: 16px;
		scrollbar-width: thin;
		scrollbar-color: var(--color-border) transparent;
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 20px 20px 8px;
	}

	.logo-link { display: block; }

	.logo {
		display: block;
		width: 48px;
		height: 64px;
		mix-blend-mode: multiply;
	}
	:global([data-theme='dark']) .logo { filter: invert(1); mix-blend-mode: screen; }

	@media (min-width: 1024px) {
		.logo { width: 60px; height: 80px; }
	}

	.hide {
		flex: 0 0 44px;
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #ffffff;
		color: var(--ink);
		border: 1px solid var(--ink);
		border-radius: 4px;
		box-shadow: 2px 2px 0 0 var(--ink);
		cursor: pointer;
	}
	.hide:hover { background: var(--cream); }

	.controls {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 10px 20px 22px;
	}

	.nav {
		display: flex;
		flex-direction: column;
		padding: 8px 0;
		border-top: 1px solid var(--color-border);
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		padding: 0 20px;
		font-family: var(--font-sans);
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-secondary);
		transition: background-color var(--duration-fast) var(--ease-sharp);
	}
	.nav-link:hover { background: var(--color-bg-subtle); color: var(--color-text); }
	.nav-link.current { font-weight: 700; color: var(--color-text); }

	.marker {
		flex: 0 0 6px;
		width: 6px;
		height: 6px;
		background: var(--color-text);
		opacity: 0;
	}
	.nav-link.current .marker { opacity: 1; }

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 20px 16px;
		border-top: 1px solid var(--color-border);
	}

	.row h3 {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.count {
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		font-variant-numeric: tabular-nums;
	}

	.views {
		display: flex;
		height: 46px;
		background: #ffffff;
		border: 1px solid var(--ink);
		border-radius: 4px;
		box-shadow: 4px 4px 0 0 var(--ink);
		overflow: hidden;
	}

	.views > button,
	.views > a {
		width: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #ffffff;
		color: var(--ink);
		border: 0;
		border-left: 1px solid var(--ink);
		cursor: pointer;
	}
	.views > :first-child { border-left: 0; }
	.views-text > a {
		width: 72px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.views > .on { background: var(--ink); color: var(--cream); }
	.views > :not(.on):hover { background: var(--cream); }
	.views > :focus-visible { outline: 2px solid var(--ink); outline-offset: -4px; }
	.views > .on:focus-visible { outline-color: var(--cream); }

	.small-btn {
		height: 36px;
		padding: 0 14px;
		background: #ffffff;
		color: var(--ink);
		border: 1px solid var(--ink);
		border-radius: 4px;
		box-shadow: 2px 2px 0 0 var(--ink);
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.small-btn:hover { background: var(--cream); }

	.more {
		display: flex;
		flex-wrap: wrap;
		gap: 0 20px;
		padding: 8px 20px 0;
		border-top: 1px solid var(--color-border);
	}
	.more a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-size: 13px;
		color: var(--color-text-tertiary);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.more a:hover { color: var(--color-text); }

	.foot {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px));
		border-top: 1px solid var(--color-border);
		background: var(--color-bg);
	}
	.foot .reset { height: 48px; padding: 0 18px; box-shadow: 4px 4px 0 0 var(--ink); }

	.done {
		flex: 1 1 auto;
		height: 48px;
		background: var(--ink);
		color: var(--cream);
		border: 1px solid var(--ink);
		border-radius: 4px;
		box-shadow: 4px 4px 0 0 var(--ink);
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}
	.done:hover { background: #2f2f2f; }

	@media (prefers-reduced-motion: reduce) {
		.sidebar, .sidebar.open, .scrim { transition: none; }
	}
</style>
