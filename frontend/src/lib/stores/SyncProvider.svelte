<script lang="ts">
	import { useClerkContext } from 'svelte-clerk/client';
	import { browser } from '$app/environment';
	import { initSync, stopSync } from './sync.svelte';
	import { identifyUser, resetUser } from '$lib/analytics/posthog';

	const ctx = useClerkContext();

	let lastUserId = $state<string | null>(null);

	$effect(() => {
		if (!browser) return;

		const userId = ctx.auth.userId;

		if (userId && userId !== lastUserId) {
			// User signed in — start sync and identify for analytics
			initSync(() => ctx.session.getToken());
			identifyUser(userId);
			lastUserId = userId;
		} else if (!userId && lastUserId) {
			// User signed out
			stopSync();
			resetUser();
			lastUserId = null;
		}
	});
</script>
