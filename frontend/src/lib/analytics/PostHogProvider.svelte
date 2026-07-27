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
				// Pass the dynamically-loaded posthog instance into the module so
				// it can flush any track-call buffer accumulated during the idle
				// deferral. The module itself never statically imports posthog-js.
				// `canTrack` is read synchronously here so init can pick the right
				// persistence store; passing it in keeps posthog.ts free of any
				// dependency on the consent store.
				mod.initPostHog(ph.default, cookieConsent.canTrack);
				posthogModule = mod;
				posthogLib = ph.default;
				// NOTE: the landing pageview is deliberately NOT fired here. Capturing
				// before `opt_in_capturing()` runs is silently discarded, and the
				// path-change effect below only fires on a CHANGE — so a visit that
				// never navigated lost its pageview entirely (407 opt-ins, 134
				// pageview persons). It now fires from the consent effect instead.
				// Start web-vitals reporting once PostHog is alive. The reporter
				// is idempotent on subsequent calls.
				void webVitals.startWebVitals(ph.default);
			});
		};

		// Defer PostHog until after first paint + idle time
		if ('requestIdleCallback' in window) {
			// Idle-first on a quiet thread, but cap the deferral at 2000ms so the
			// browser forces the callback even on thread-starved sessions —
			// matching the setTimeout fallback ceiling below.
			requestIdleCallback(loadPostHog, { timeout: 2000 });
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
			posthogLib.opt_in_capturing();
			// No-op for a returning consented visitor (init already chose this
			// store, and posthog-js only rebuilds persistence when the value
			// actually changes). It matters for a first-time visitor who just
			// accepted: it promotes the memory-held id into localStorage+cookie,
			// which is the correct id to persist for them.
			posthogLib.set_config({ persistence: 'localStorage+cookie' });
			lastAppliedDecision = 'enable';

			// The landing pageview, fired only now that capturing is actually on.
			// `lastPath === ''` means none has been sent yet this page load; real
			// pathnames always begin with '/', so it can't collide. This also covers
			// reject-then-accept, and someone who navigates before consenting (the
			// pageview then correctly records the page they are actually on).
			if (posthogModule && lastPath === '') {
				posthogModule.trackPageview(page.url.href);
				lastPath = page.url.pathname;
			}

			// LAST, and guarded. Session recording is the least important thing this
			// effect does and the most likely to throw (it lazy-loads the rrweb
			// bundle over the network). It used to run before `lastAppliedDecision`
			// was set, so a throw here would abort the effect and silently disable
			// BOTH the landing pageview and every path-change pageview after it.
			try {
				posthogLib.startSessionRecording();
			} catch (e) {
				console.warn('[posthog] session recording failed to start:', e);
			}
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
