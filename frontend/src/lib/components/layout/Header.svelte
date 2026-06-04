<script lang="ts">
	import { page } from '$app/state';

	// `cinemas` and `showFilters` were previously used to feed the in-header
	// FilterBar. They're kept on the prop type for backwards compatibility with
	// call sites, but the header no longer renders filters itself — the
	// homepage owns them via its sidebar / bottom sheet.
	interface HeaderCinema {
		id: string;
		name: string;
		shortName: string | null;
		address: { area: string } | null;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let { cinemas: _cinemas = [], showFilters: _showFilters = true }: { cinemas?: HeaderCinema[]; showFilters?: boolean } = $props();

	// Single source of truth for nav links. Desktop nav uses items flagged
	// `desktop: true`; the burger menu uses `mobile: true`. The two surfaces
	// historically diverged (desktop omitted Cinemas/Tonight/Directors, mobile
	// omitted Watchlist) — keeping it explicit per-surface preserves that.
	interface NavItem {
		href: string;
		label: string;
		desktop: boolean;
		mobile: boolean;
		italic?: boolean;
		/** Match by `startsWith` rather than exact equality (for /reachable/[...]). */
		matchPrefix?: boolean;
	}
	const NAV_ITEMS: NavItem[] = [
		{ href: '/watchlist', label: 'Watchlist', desktop: true,  mobile: false, italic: true },
		{ href: '/about',     label: 'About',     desktop: true,  mobile: true },
		{ href: '/map',       label: 'Map',       desktop: true,  mobile: true },
		{ href: '/reachable', label: 'Reachable', desktop: true,  mobile: true,  matchPrefix: true },
		{ href: '/cinemas',   label: 'Cinemas',   desktop: false, mobile: true },
		{ href: '/tonight',   label: 'Tonight',   desktop: false, mobile: true },
		{ href: '/directors', label: 'Directors', desktop: false, mobile: true }
	];

	// NAV_ITEMS is static and never mutated, so the per-surface filters are
	// computed once here rather than re-run inline on every header re-render.
	const DESKTOP_NAV = NAV_ITEMS.filter((n) => n.desktop);
	const MOBILE_NAV = NAV_ITEMS.filter((n) => n.mobile);

	function isActive(href: string, matchPrefix?: boolean): boolean {
		return matchPrefix ? page.url.pathname.startsWith(href) : page.url.pathname === href;
	}

	let mobileMenuOpen = $state(false);
	let mastheadEl = $state<HTMLElement>();
	let barEl = $state<HTMLElement>();

	// SPLIT HEADER — compaction IS scrolling.
	//
	// The header is two pieces: an in-flow masthead (big logo + vertical nav)
	// that scrolls away like any other content, and a fixed compact bar that
	// is transparent and inert until the masthead has scrolled past it, then
	// fades in. Nothing animates layout: per scrolled frame the browser only
	// composites already-painted layers, exactly as it would for plain
	// scrolling — the smoothest a shrinking header can physically be.
	//
	// Because the masthead never resizes and the bar occupies no flow space,
	// the document height is constant; the scroll-anchoring oscillation that
	// previously forced wide hysteresis thresholds cannot occur, so `stuck`
	// is a single IntersectionObserver crossing — no scroll listener, no rAF.
	let stuck = $state(false);

	// Close mobile menu on route change
	$effect(() => {
		page.url.pathname;
		mobileMenuOpen = false;
	});

	// Broadcast compact state on <html> (same pattern as --header-height) so
	// fixed-position overlays that share the header's space — the homepage
	// DimmerDial anchor — can fade out instead of colliding with the bar.
	$effect(() => {
		document.documentElement.toggleAttribute('data-header-compact', stuck);
	});

	// stuck = the masthead has scrolled above the bar's bottom edge. The
	// observer fires once per crossing (and once on observe, which makes
	// mid-page hard loads and BFCache restores correct for free).
	$effect(() => {
		const mh = mastheadEl;
		const bar = barEl;
		if (!mh || !bar) return;
		const io = new IntersectionObserver(
			([entry]) => {
				stuck = !entry.isIntersecting;
			},
			{ rootMargin: `-${bar.offsetHeight}px 0px 0px 0px`, threshold: 0 }
		);
		io.observe(mh);
		return () => io.disconnect();
	});

	// --header-height drives fixed-position consumers (mobile Dropdown panels,
	// DimmerDial vignette, the burger menu panel below): the masthead's height
	// at rest, the bar's constant height once stuck.
	$effect(() => {
		const mh = mastheadEl;
		const bar = barEl;
		if (!mh || !bar) return;
		const isStuck = stuck;
		const set = () => {
			const h = isStuck ? bar.offsetHeight : mh.offsetHeight;
			document.documentElement.style.setProperty('--header-height', `${h}px`);
		};
		set();
		const ro = new ResizeObserver(set);
		ro.observe(mh);
		ro.observe(bar);
		return () => ro.disconnect();
	});

	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}
</script>

{#snippet burger()}
	<button
		class="mobile-menu-btn"
		onclick={toggleMobileMenu}
		aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
		aria-expanded={mobileMenuOpen}
	>
		{#if mobileMenuOpen}
			<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
				<path d="M4 4L14 14M14 4L4 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>
			</svg>
		{:else}
			<svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/>
				<line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/>
				<line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="square"/>
			</svg>
		{/if}
	</button>
{/snippet}

<header class="header" class:stuck>
	<!-- In-flow masthead: scrolls away naturally. Once stuck it goes inert and
		hands its accessible labels (Main nav, home link) to the bar, so every
		selector — role, attribute or class — resolves to exactly one element
		at any scroll position. -->
	<div class="masthead" bind:this={mastheadEl} inert={stuck} aria-hidden={stuck} style="background-color: var(--color-bg);">
		<div class="masthead-inner">
			<div class="brand-bar">
				<div class="brand-side brand-side-left"></div>

				<a href="/" class="brand-link" aria-label={stuck ? undefined : 'pictures london — home'}>
					<img src="/pictures-logo.png" alt="pictures" class="brand-logo" width="140" height="140" />
				</a>

				<div class="brand-side brand-side-right">
					<nav class="nav-links" aria-label={stuck ? undefined : 'Main'}>
						{#each DESKTOP_NAV as item (item.href)}
							<a
								href={item.href}
								class="nav-link"
								class:watchlist-link={item.italic}
								aria-current={isActive(item.href, item.matchPrefix) ? 'page' : undefined}
							>{item.label}</a>
						{/each}
					</nav>

					{#if !stuck}
						{@render burger()}
					{/if}
				</div>
			</div>
		</div>
		<div class="header-border"></div>
	</div>

	<!-- Fixed compact bar: occupies no flow space, transparent until the
		masthead scrolls past, then crossfades in (opacity only). Its contents
		only exist while stuck — the masthead's copies own the page until then. -->
	<div class="bar" bind:this={barEl}>
		{#if stuck}
			<div class="bar-grid">
				<div class="bar-side"></div>

				<a href="/" class="bar-brand-link" aria-label="pictures london — home">
					<img src="/pictures-logo.png" alt="pictures" class="bar-logo" width="40" height="40" />
				</a>

				<div class="bar-side bar-side-right">
					<nav class="bar-nav" aria-label="Main">
						{#each DESKTOP_NAV as item (item.href)}
							<a
								href={item.href}
								class="nav-link"
								class:watchlist-link={item.italic}
								aria-current={isActive(item.href, item.matchPrefix) ? 'page' : undefined}
							>{item.label}</a>
						{/each}
					</nav>

					{@render burger()}
				</div>
			</div>
		{/if}
	</div>

	<!-- Mobile nav menu: fixed panel anchored below whichever chrome is
		current (masthead at rest, bar when stuck) via --header-height. -->
	{#if mobileMenuOpen}
		<nav class="mobile-nav" aria-label="Mobile navigation">
			{#each MOBILE_NAV as item (item.href)}
				<a
					href={item.href}
					class="mobile-nav-link"
					aria-current={isActive(item.href, item.matchPrefix) ? 'page' : undefined}
				>{item.label.toUpperCase()}</a>
			{/each}
		</nav>
	{/if}
</header>

<style>
	/* ── Masthead (in-flow, scrolls away) ── */

	.masthead-inner {
		max-width: none;
		margin: 0;
		padding: 24px 1rem 0;
	}

	@media (min-width: 768px) {
		.masthead-inner {
			padding: 32px 2rem 0;
		}
	}

	.brand-bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		min-height: 180px;
		gap: 0.5rem;
	}

	.brand-side {
		display: flex;
		align-items: center;
	}

	.brand-side-left {
		justify-content: flex-start;
	}

	.brand-side-right {
		flex-direction: column;
		justify-content: flex-start;
		align-items: flex-end;
		gap: 6px;
	}

	@media (max-width: 320px) {
		.brand-bar {
			height: auto;
			min-height: 40px;
			flex-wrap: wrap;
		}
	}

	.brand-link {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.brand-logo {
		display: block;
		height: 140px;
		width: 140px;
		object-fit: cover;
		object-position: center 35%;
		/* Multiply blends the logo's grey background into the page beige so only
		   the hand-drawn marks read. Never transform-scale this image — both
		   header logos render at native size so the blend stays honest. */
		mix-blend-mode: multiply;
	}

	.nav-links {
		display: none;
	}

	@media (min-width: 768px) {
		.nav-links {
			display: flex;
			flex-direction: column;
			align-items: flex-end;
			gap: 4px;
		}
	}

	.nav-link {
		padding: 2px 0;
		font-family: var(--font-sans);
		font-size: 14px;
		font-weight: 400;
		letter-spacing: -0.01em;
		color: var(--color-text-secondary);
		transition: color var(--duration-fast) var(--ease-sharp);
		white-space: nowrap;
		text-align: right;
	}

	.nav-link:hover {
		color: var(--color-text);
	}

	.nav-link.watchlist-link {
		font-family: var(--font-serif-italic);
		font-style: italic;
		font-size: 13px;
	}

	.header-border {
		height: 1px;
		background: var(--color-border);
	}

	/* ── Compact bar (fixed, no flow space) ── */

	.bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 40;
		height: 56px;
		background-color: var(--color-bg);
		border-bottom: 1px solid var(--color-border);
		opacity: 0;
		/* inert blocks interaction while hidden; pointer-events is belt and
		   braces for the pre-hydration SSR frame. */
		pointer-events: none;
		transition: opacity var(--duration-normal) var(--ease-sharp);
	}

	.header.stuck .bar {
		opacity: 1;
		pointer-events: auto;
	}

	.bar-grid {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		height: 100%;
		padding: 0 1rem;
		gap: 0.5rem;
	}

	@media (min-width: 768px) {
		.bar-grid {
			padding: 0 2rem;
		}
	}

	.bar-side {
		display: flex;
		align-items: center;
	}

	.bar-side-right {
		justify-content: flex-end;
	}

	.bar-brand-link {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.bar-logo {
		display: block;
		height: 40px;
		width: 40px;
		object-fit: cover;
		object-position: center 35%;
		mix-blend-mode: multiply;
	}

	.bar-nav {
		display: none;
	}

	@media (min-width: 768px) {
		.bar-nav {
			display: flex;
			align-items: center;
			gap: 1rem;
		}
	}

	/* ── Burger (masthead copy at rest, bar copy when stuck) ── */

	.mobile-menu-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: transparent;
		border: 1px solid var(--color-border-subtle);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: border-color var(--duration-fast) var(--ease-sharp),
			color var(--duration-fast) var(--ease-sharp);
	}

	.mobile-menu-btn:hover {
		border-color: var(--color-border);
		color: var(--color-text);
	}

	@media (min-width: 768px) {
		.mobile-menu-btn {
			display: none;
		}
	}

	/* ── Mobile nav panel ── */

	.mobile-nav {
		position: fixed;
		top: var(--header-height, 56px);
		left: 0;
		right: 0;
		z-index: 40;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
		border-top: 1px solid var(--color-border-subtle);
		border-bottom: 1px solid var(--color-border);
		padding: 0.5rem 1rem;
	}

	@media (min-width: 768px) {
		.mobile-nav {
			display: none;
		}
	}

	.mobile-nav-link {
		display: flex;
		align-items: center;
		padding: 0.75rem 0;
		font-size: var(--font-size-xs);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-secondary);
		transition: color var(--duration-fast) var(--ease-sharp);
		min-height: 44px;
	}

	.mobile-nav-link:hover {
		color: var(--color-text);
	}

	.mobile-nav-link[aria-current='page'] {
		color: var(--color-text);
		font-weight: 600;
	}
</style>
