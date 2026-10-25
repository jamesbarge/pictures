<script lang="ts">
	import '../app.css';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import TopBar from '$lib/components/layout/TopBar.svelte';
	import PostHogProvider from '$lib/analytics/PostHogProvider.svelte';
	import JsonLd from '$lib/seo/JsonLd.svelte';
	import { organizationSchema } from '$lib/seo/json-ld';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { palette } from '$lib/stores/palette.svelte';
	import GlobalCmdkBinding from '$lib/components/search/GlobalCmdkBinding.svelte';

	let { children } = $props();

	const canonicalUrl = $derived(`https://pictures.london${page.url.pathname}`);
	// Loaded by +layout.server.ts on every route; the sidebar's WHERE filter needs it.
	const cinemas = $derived(page.data.cinemas ?? []);

	// Lazy-mount the command palette: its UI (bits-ui Dialog + ~1500 lines of
	// row components) never renders on first paint (palette.open starts false),
	// so keep it out of the shared layout chunk and dynamically import it the
	// first time the palette opens. GlobalCmdkBinding stays eager so cmd+k still
	// flips palette.open synchronously; the effect mounts within a microtask
	// before the Dialog paints. Mirrors the FilmSimilarRail lazy pattern.
	let CommandPalette = $state<typeof import('$lib/components/search/CommandPalette.svelte').default | null>(null);

	$effect(() => {
		if (browser && palette.open && !CommandPalette) {
			import('$lib/components/search/CommandPalette.svelte').then((m) => {
				CommandPalette = m.default;
			});
		}
	});
</script>

<svelte:head>
	<title>pictures · london</title>
	<meta name="description" content="Every film showing in London, in one calendar." />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:site_name" content="pictures · london" />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="pictures · london" />
	<meta property="og:description" content="Every film showing in London, in one calendar. Independent cinemas, chains, repertory and new releases." />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="pictures · london" />
	<meta name="twitter:description" content="Every film showing in London, in one calendar." />
</svelte:head>

<JsonLd data={organizationSchema()} />

<PostHogProvider />
<GlobalCmdkBinding />
{#if CommandPalette}
	<CommandPalette />
{/if}

<a href="#main-content" class="skip-link">Skip to content</a>

<div class="shell">
	<Sidebar {cinemas} />
	<div class="shell-main">
		<TopBar {cinemas} />
		<main id="main-content" tabindex="-1">
			{@render children()}
		</main>
	</div>
</div>

<style>
	/* The sidebar is a drawer below 1024px (fixed, out of flow) and a column
	   beside the page from 1024px up. */
	.shell {
		display: flex;
		align-items: flex-start;
		min-height: 100dvh;
	}

	.shell-main {
		flex: 1 1 auto;
		min-width: 0;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	main {
		flex: 1 1 auto;
		background-color: var(--color-bg);
	}

	.skip-link {
		position: absolute;
		top: -100%;
		left: 0;
		z-index: 100;
		padding: 0.75rem 1.5rem;
		font-size: var(--font-size-sm);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		background: var(--color-screening-bg);
		color: var(--color-screening-text);
	}

	.skip-link:focus {
		top: 0;
	}
</style>
