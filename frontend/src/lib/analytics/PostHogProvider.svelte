<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import posthog from 'posthog-js';
	import { initPostHog, trackPageview } from './posthog';
	import { cookieConsent } from '$lib/stores/cookie-consent.svelte';
	import CookieConsentBanner from '$lib/components/ui/CookieConsentBanner.svelte';

	if (browser) {
		initPostHog();
	}

	// ── Consent Management ──────────────────────────────────────────
	type TrackingDecision = 'enable' | 'disable' | 'wait';
	let lastAppliedDecision = $state<TrackingDecision | null>(null);

	$effect(() => {
		if (!browser) return;

		const consent = cookieConsent.status;
		let decision: TrackingDecision;

		if (consent === 'pending') {
			decision = 'wait';
		} else if (consent === 'rejected') {
			decision = 'disable';
		} else {
			decision = 'enable';
		}

		if (decision === 'wait' || decision === lastAppliedDecision) return;

		if (decision === 'enable') {
			// Don't re-enable if admin was opted out by identifyUser()
			if (posthog.has_opted_out_capturing()) return;
			posthog.opt_in_capturing();
			posthog.set_config({ persistence: 'localStorage+cookie' });
			posthog.startSessionRecording();
			lastAppliedDecision = 'enable';
		} else {
			posthog.opt_out_capturing();
			posthog.stopSessionRecording();
			posthog.reset();
			lastAppliedDecision = 'disable';
		}
	});

	// ── Pageview Tracking ───────────────────────────────────────────
	let lastPath = $state('');

	$effect(() => {
		const currentPath = page.url.pathname;
		if (browser && currentPath !== lastPath && lastAppliedDecision === 'enable') {
			trackPageview(page.url.href);
			lastPath = currentPath;
		}
	});
</script>

<CookieConsentBanner />
