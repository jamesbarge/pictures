<script lang="ts">
	import BreathingGrid from '$lib/components/pretext/BreathingGrid.svelte';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import DimmerDial from '$lib/components/ui/DimmerDial.svelte';
	import type { Cinema } from '$lib/types';
	import { page } from '$app/state';

	let { cinemas = [], showFilters = true }: { cinemas?: Cinema[]; showFilters?: boolean } = $props();

	const isHome = $derived(page.url.pathname === '/');
</script>

<header class="header" style="background-color: var(--color-bg);">
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
				</nav>

				<div class="nav-divider"></div>

					<a href="/sign-in" class="nav-link">SIGN IN</a>

				<DimmerDial />
			</div>
		</div>

		<!-- ROW B: Filter bar (homepage only) -->
		{#if showFilters && isHome}
			<div class="filter-bar-row">
				<FilterBar {cinemas} />
			</div>
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

	.filter-bar-row {
		border-top: 1px solid var(--color-border-subtle);
	}

	.header-border {
		height: 1px;
		background: var(--color-border);
	}
</style>
