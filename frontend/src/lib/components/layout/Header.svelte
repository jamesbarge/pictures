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

	let mobileMenuOpen = $state(false);
	let headerEl = $state<HTMLElement>();

	// Close mobile menu on route change
	$effect(() => {
		page.url.pathname;
		mobileMenuOpen = false;
	});

	// Measure header height and expose as CSS custom property for dropdown positioning.
	$effect(() => {
		// Track dependencies that change header height
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
			<div class="brand-side brand-side-left"></div>

			<a href="/" class="brand-link" aria-label="pictures london — home">
				<img src="/pictures-logo.png" alt="pictures" class="brand-logo" width="80" height="42" />
			</a>

			<div class="brand-side brand-side-right">
				<nav class="nav-links" aria-label="Main">
					<a href="/watchlist" class="nav-link" aria-current={page.url.pathname === '/watchlist' ? 'page' : undefined}>watchlist</a>
					<a href="/about" class="nav-link" aria-current={page.url.pathname === '/about' ? 'page' : undefined}>about</a>
					<a href="/map" class="nav-link" aria-current={page.url.pathname === '/map' ? 'page' : undefined}>map</a>
					<a href="/reachable" class="nav-link" aria-current={page.url.pathname.startsWith('/reachable') ? 'page' : undefined}>reachable</a>
					<a href="/sign-in" class="nav-link sign-in-link">sign in</a>
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
		max-width: none;
		margin: 0;
		padding: 24px 1rem 0;
	}

	@media (min-width: 768px) {
		.header-inner {
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
		   the hand-drawn marks read. */
		mix-blend-mode: multiply;
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

	.nav-link.sign-in-link {
		color: var(--color-text);
	}

	.sign-in-link {
		display: none;
	}

	@media (min-width: 768px) {
		.sign-in-link {
			display: inline-flex;
			align-items: center;
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

	.header-border {
		height: 1px;
		background: var(--color-border);
	}
</style>
