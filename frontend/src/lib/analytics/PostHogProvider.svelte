<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let trackPageviewFn: ((url: string) => void) | null = $state(null);
	let lastPath = $state('');

	onMount(() => {
		if (!browser) return;

		const loadPostHog = () => {
			import('./posthog').then((mod) => {
				mod.initPostHog();
				trackPageviewFn = mod.trackPageview;
				// Track initial pageview that we deferred
				mod.trackPageview(page.url.href);
				lastPath = page.url.pathname;
			});
		};

		// Defer PostHog until after first paint + idle time
		if ('requestIdleCallback' in window) {
			requestIdleCallback(loadPostHog);
		} else {
			setTimeout(loadPostHog, 2000);
		}
	});

	// Track subsequent pageviews after PostHog loads
	$effect(() => {
		const currentPath = page.url.pathname;
		if (browser && currentPath !== lastPath && trackPageviewFn) {
			trackPageviewFn(page.url.href);
			lastPath = currentPath;
		}
	});
</script>
