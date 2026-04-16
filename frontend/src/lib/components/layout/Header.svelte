<script lang="ts">
	import BreathingGrid from '$lib/components/pretext/BreathingGrid.svelte';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import DimmerDial from '$lib/components/ui/DimmerDial.svelte';
	import { page } from '$app/state';

	interface HeaderCinema {
		id: string;
		name: string;
		shortName: string | null;
		address: { area: string } | null;
	}

	let { cinemas = [], showFilters = true }: { cinemas?: HeaderCinema[]; showFilters?: boolean } = $props();

	const isHome = $derived(page.url.pathname === '/');

	let mobileMenuOpen = $state(false);
	let headerEl = $state<HTMLElement>();

	// Close mobile menu on route change
	$effect(() => {
		page.url.pathname;
		mobileMenuOpen = false;
	});

	// Measure header height and expose as CSS custom property for dropdown positioning.
	// Re-runs when the filter bar appears/disappears (isHome, showFilters) or menu toggles.
	$effect(() => {
		// Track dependencies that change header height
		void isHome;
		void showFilters;
		void mobileMenuOpen;
		if (headerEl) {
			// Read after a tick so the DOM has updated
			requestAnimationFrame(() => {
				if (headerEl) {
					document.documentElement.style.setProperty('--header-height', `${headerEl.offsetHeight}px`);
				}
			});
		}
	});

	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}
</script>

<header bind:this={headerEl} class="header" style="background-color: var(--color-bg);">
	<div class="header-inner">
		<!-- ROW A: Brand bar -->
		<div class="brand-bar">
			<a href="/" class="brand-link" aria-label="pictures london — home">
				<BreathingGrid />
			</a>

			<div class="brand-right">
				<nav class="nav-links" aria-label="Main">
					<a href="/about" class="nav-link" aria-current={page.url.pathname === '/about' ? 'page' : undefined}>ABOUT</a>
					<a href="/map" class="nav-link" aria-current={page.url.pathname === '/map' ? 'page' : undefined}>MAP</a>
					<a href="/reachable" class="nav-link" aria-current={page.url.pathname.startsWith('/reachable') ? 'page' : undefined}>REACHABLE</a>
				</nav>

				<div class="nav-divider"></div>

					<a href="/sign-in" class="nav-link sign-in-link">SIGN IN</a>

				<DimmerDial />

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
						<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
							<path d="M2 5H16M2 9H16M2 13H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>
						</svg>
					{/if}
				</button>
			</div>
		</div>

		<!-- ROW B: Filter bar (homepage only) -->
		{#if showFilters && isHome}
			<div class="filter-bar-row">
				<FilterBar {cinemas} />
			</div>
		{/if}

		<!-- Mobile nav menu -->
		{#if mobileMenuOpen}
			<nav class="mobile-nav" aria-label="Mobile navigation">
				<a href="/about" class="mobile-nav-link" aria-current={page.url.pathname === '/about' ? 'page' : undefined}>ABOUT</a>
				<a href="/map" class="mobile-nav-link" aria-current={page.url.pathname === '/map' ? 'page' : undefined}>MAP</a>
				<a href="/reachable" class="mobile-nav-link" aria-current={page.url.pathname.startsWith('/reachable') ? 'page' : undefined}>REACHABLE</a>
				<a href="/cinemas" class="mobile-nav-link" aria-current={page.url.pathname === '/cinemas' ? 'page' : undefined}>CINEMAS</a>
				<a href="/tonight" class="mobile-nav-link" aria-current={page.url.pathname === '/tonight' ? 'page' : undefined}>TONIGHT</a>
				<a href="/directors" class="mobile-nav-link" aria-current={page.url.pathname === '/directors' ? 'page' : undefined}>DIRECTORS</a>
				<a href="/sign-in" class="mobile-nav-link">SIGN IN</a>
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
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 1rem;
	}

	@media (min-width: 768px) {
		.header-inner {
			padding: 0 2rem;
		}
	}

	.brand-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 48px;
		gap: 0.5rem;
	}

	@media (max-width: 320px) {
		.brand-bar {
			height: auto;
			min-height: 40px;
			flex-wrap: wrap;
		}
	}

	.brand-link {
		display: block;
		flex-shrink: 1;
		min-width: 0;
		overflow: hidden;
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
			align-items: center;
			gap: 0;
		}
	}

	.nav-link {
		padding: 0.25rem 0.75rem;
		font-size: 11px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-tertiary);
		transition: color var(--duration-fast) var(--ease-sharp);
		white-space: nowrap;
	}

	.nav-link:hover {
		color: var(--color-text);
	}

	.sign-in-link {
		display: none;
	}

	@media (min-width: 768px) {
		.sign-in-link {
			display: inline;
		}
	}

	.nav-divider {
		display: none;
		width: 1px;
		height: 16px;
		background: var(--color-border-subtle);
	}

	@media (min-width: 768px) {
		.nav-divider {
			display: block;
		}
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

	.filter-bar-row {
		border-top: 1px solid var(--color-border-subtle);
	}

	.header-border {
		height: 1px;
		background: var(--color-border);
	}
</style>
