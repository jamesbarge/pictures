<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { initPostHog, trackPageview } from './posthog';

	if (browser) {
		initPostHog();
	}

	// Track pageviews on route changes
	let lastPath = $state('');

	$effect(() => {
		const currentPath = page.url.pathname;
		if (browser && currentPath !== lastPath) {
			trackPageview(page.url.href);
			lastPath = currentPath;
		}
	});
</script>
