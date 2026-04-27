<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { cookieConsent } from '$lib/stores/cookie-consent.svelte';
	import CookieConsentBanner from '$lib/components/ui/CookieConsentBanner.svelte';

	let posthogModule: typeof import('./posthog') | null = $state(null);
	let posthogLib: typeof import('posthog-js').default | null = $state(null);
	let lastPath = $state('');

	// ── Deferred Loading ────────────────────────────────────────────
	onMount(() => {
		if (!browser) return;

		const loadPostHog = () => {
			Promise.all([
				import('./posthog'),
				import('posthog-js'),
				import('./web-vitals')
			]).then(([mod, ph, webVitals]) => {
				mod.initPostHog();
				posthogModule = mod;
				posthogLib = ph.default;
				// Track initial pageview (deferred)
				mod.trackPageview(page.url.href);
				lastPath = page.url.pathname;
				// Start web-vitals reporting once PostHog is alive. The reporter
				// is idempotent on subsequent calls.
				void webVitals.startWebVitals(ph.default);
			});
		};

		// Defer PostHog until after first paint + idle time
		if ('requestIdleCallback' in window) {
			requestIdleCallback(loadPostHog);
		} else {
			setTimeout(loadPostHog, 2000);
		}
	});

	// ── Consent Management ──────────────────────────────────────────
	type TrackingDecision = 'enable' | 'disable' | 'wait';
	let lastAppliedDecision = $state<TrackingDecision | null>(null);

	$effect(() => {
		if (!browser || !posthogLib) return;

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
			if (posthogModule?.isAdminOptedOut()) return;
			posthogLib.opt_in_capturing();
			posthogLib.set_config({ persistence: 'localStorage+cookie' });
			posthogLib.startSessionRecording();
			lastAppliedDecision = 'enable';
		} else {
			posthogLib.opt_out_capturing();
			posthogLib.stopSessionRecording();
			posthogLib.reset();
			lastAppliedDecision = 'disable';
		}
	});

	// ── Pageview Tracking ───────────────────────────────────────────
	$effect(() => {
		const currentPath = page.url.pathname;
		if (browser && currentPath !== lastPath && posthogModule && lastAppliedDecision === 'enable') {
			posthogModule.trackPageview(page.url.href);
			lastPath = currentPath;
		}
	});
</script>

<CookieConsentBanner />
