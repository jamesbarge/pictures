<script lang="ts">
	import '../app.css';
	import Header from '$lib/components/layout/Header.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import PostHogProvider from '$lib/analytics/PostHogProvider.svelte';
	import SyncProvider from '$lib/stores/SyncProvider.svelte';
	import JsonLd from '$lib/seo/JsonLd.svelte';
	import { organizationSchema } from '$lib/seo/json-ld';
	import { ClerkProvider } from 'svelte-clerk/client';
	import { PUBLIC_CLERK_PUBLISHABLE_KEY } from '$env/static/public';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { palette } from '$lib/stores/palette.svelte';
	import GlobalCmdkBinding from '$lib/components/search/GlobalCmdkBinding.svelte';

	let { data, children } = $props();

	const canonicalUrl = $derived(`https://pictures.london${page.url.pathname}`);
	const clerkEnabled = !!PUBLIC_CLERK_PUBLISHABLE_KEY && !PUBLIC_CLERK_PUBLISHABLE_KEY.includes('your_');

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

{#snippet shell()}
	<a href="#main-content" class="skip-link">Skip to content</a>

	<div class="min-h-dvh flex flex-col">
		<Header cinemas={data?.cinemas ?? []} />
		<main id="main-content" class="flex-1" tabindex="-1">
			{@render children()}
		</main>
		<Footer />
	</div>
{/snippet}

{#if clerkEnabled}
	<ClerkProvider publishableKey={PUBLIC_CLERK_PUBLISHABLE_KEY}>
		<PostHogProvider />
		<SyncProvider />
		<GlobalCmdkBinding />
		{#if CommandPalette}
			<CommandPalette />
		{/if}
		{@render shell()}
	</ClerkProvider>
{:else}
	<PostHogProvider />
	<GlobalCmdkBinding />
	{@render shell()}
{/if}

<style>
	/* Main carries the dimmable background so the area below the header tracks
	   the house-lights value (header stays on the html bg). */
	main {
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
