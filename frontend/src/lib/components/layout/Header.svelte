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
	let headerEl = $state<HTMLElement>();
	let compact = $state(false);

	// Compact the header once the user scrolls into the page; expand again only
	// near the very top. The thresholds are deliberately far apart (hysteresis):
	// compacting shrinks the document by ~150px, and browser scroll anchoring
	// can pull scrollY down by that amount — a single threshold would oscillate.
	const COMPACT_AT = 180;
	const EXPAND_AT = 4;

	// Close mobile menu on route change
	$effect(() => {
		page.url.pathname;
		mobileMenuOpen = false;
	});

	// Broadcast compact state on <html> (same pattern as --header-height) so
	// fixed-position overlays that share the header's space — the homepage
	// DimmerDial anchor — can fade out instead of colliding with the nav row.
	$effect(() => {
		document.documentElement.toggleAttribute('data-header-compact', compact);
	});

	$effect(() => {
		let raf = 0;
		const onScroll = () => {
			if (raf) return;
			raf = requestAnimationFrame(() => {
				// Keep the `compact` read inside this async callback — reading it
				// synchronously in the effect body would register it as a dependency
				// and re-add the scroll listener on every toggle.
				raf = 0;
				const y = window.scrollY;
				if (!compact && y > COMPACT_AT) compact = true;
				else if (compact && y < EXPAND_AT) compact = false;
			});
		};
		onScroll(); // pick up an already-scrolled position (e.g. bfcache restore)
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			window.removeEventListener('scroll', onScroll);
			if (raf) cancelAnimationFrame(raf);
		};
	});

	// Keep --header-height in sync with the rendered header so fixed-position
	// consumers (mobile Dropdown, DimmerDial) track it through the compact
	// transition, mobile menu toggling and viewport resizes.
	$effect(() => {
		const el = headerEl;
		if (!el) return;
		const ro = new ResizeObserver(() => {
			document.documentElement.style.setProperty('--header-height', `${el.offsetHeight}px`);
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}
</script>

<header bind:this={headerEl} class="header" class:compact style="background-color: var(--color-bg);">
	<div class="header-inner">
		<!-- ROW A: Brand bar -->
		<div class="brand-bar">
			<div class="brand-side brand-side-left"></div>

			<a href="/" class="brand-link" aria-label="pictures london — home">
				<img src="/pictures-logo.png" alt="pictures" class="brand-logo" width="80" height="42" />
			</a>

			<div class="brand-side brand-side-right">
				<nav class="nav-links" aria-label="Main">
					{#each DESKTOP_NAV as item (item.href)}
						<a
							href={item.href}
							class="nav-link"
							class:watchlist-link={item.italic}
							aria-current={isActive(item.href, item.matchPrefix) ? 'page' : undefined}
						>{item.label}</a>
					{/each}
				</nav>

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
			</div>
		</div>

		<!-- Filter bar is owned by the homepage (sidebar on desktop, bottom sheet
			on mobile) and not rendered in the header anymore. Other routes render
			their own filters when needed. -->


		<!-- Mobile nav menu -->
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
	</div>

	<div class="header-border"></div>
</header>

<style>
	.header {
		position: sticky;
		top: 0;
		z-index: 40;
	}

	.header-inner {
		max-width: none;
		margin: 0;
		padding: 24px 1rem 0;
		transition: padding var(--duration-slow) var(--ease-snap);
	}

	.header.compact .header-inner {
		padding: 6px 1rem 0;
	}

	@media (min-width: 768px) {
		.header-inner {
			padding: 32px 2rem 0;
		}

		.header.compact .header-inner {
			padding: 8px 2rem 0;
		}
	}

	.brand-bar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		min-height: 180px;
		gap: 0.5rem;
		transition: min-height var(--duration-slow) var(--ease-snap);
	}

	.header.compact .brand-bar {
		min-height: 56px;
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

	.header.compact .brand-side-right {
		flex-direction: row;
		justify-content: flex-end;
		align-items: center;
	}

	@media (max-width: 320px) {
		.brand-bar {
			height: auto;
			min-height: 40px;
			flex-wrap: wrap;
		}

		/* Compact must never be taller than the expanded 40px bar here. */
		.header.compact .brand-bar {
			min-height: 40px;
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
		   the hand-drawn marks read. */
		mix-blend-mode: multiply;
		transition:
			height var(--duration-slow) var(--ease-snap),
			width var(--duration-slow) var(--ease-snap);
	}

	.header.compact .brand-logo {
		height: 40px;
		width: 40px;
	}

	.brand-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	@media (min-width: 768px) {
		.brand-right {
			gap: 1rem;
		}
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

		.header.compact .nav-links {
			flex-direction: row;
			align-items: center;
			gap: 1rem;
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

	.mobile-nav {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--color-border-subtle);
		padding: 0.5rem 0;
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

	.header-border {
		height: 1px;
		background: var(--color-border);
	}
</style>
