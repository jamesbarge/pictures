<script lang="ts">
	import '../app.css';
	import Header from '$lib/components/layout/Header.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import PostHogProvider from '$lib/analytics/PostHogProvider.svelte';
	import SyncProvider from '$lib/stores/SyncProvider.svelte';
	import { ClerkProvider } from 'svelte-clerk/client';
	import { PUBLIC_CLERK_PUBLISHABLE_KEY } from '$env/static/public';
	import { page } from '$app/state';

	let { data, children } = $props();

	const canonicalUrl = $derived(`https://pictures.london${page.url.pathname}`);
	const clerkEnabled = !!PUBLIC_CLERK_PUBLISHABLE_KEY && !PUBLIC_CLERK_PUBLISHABLE_KEY.includes('your_');
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

{#if clerkEnabled}
	<ClerkProvider publishableKey={PUBLIC_CLERK_PUBLISHABLE_KEY}>
		<PostHogProvider />
		<SyncProvider />
		<a href="#main-content" class="skip-link">Skip to content</a>

		<div class="min-h-dvh flex flex-col">
			<Header cinemas={data?.cinemas ?? []} />
			<main id="main-content" class="flex-1" tabindex="-1">
				{@render children()}
			</main>
			<Footer />
		</div>
	</ClerkProvider>
{:else}
	<PostHogProvider />
	<a href="#main-content" class="skip-link">Skip to content</a>

	<div class="min-h-dvh flex flex-col">
		<Header cinemas={data?.cinemas ?? []} />
		<main id="main-content" class="flex-1" tabindex="-1">
			{@render children()}
		</main>
		<Footer />
	</div>
{/if}

<style>
	.skip-link {
		position: absolute;
		top: -100%;
		left: 0;
		z-index: 100;
		padding: 0.5rem 1rem;
		font-size: var(--font-size-xs);
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
