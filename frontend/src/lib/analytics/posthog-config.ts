/**
 * Pure posthog-js init config, split out of `posthog.ts` so it is unit-testable.
 *
 * `posthog.ts` imports `$app/environment` and `$env/static/public`, neither of
 * which resolves in the node test environment — same reason `catalog-index-core`
 * is separate from `catalog-index.svelte.ts`. Keep this module free of `$app`,
 * `$env` and any value import of `posthog-js` (the type import below is erased).
 */
import type { PostHogConfig } from 'posthog-js';

/**
 * @param alreadyConsented the visitor's PERSISTED consent decision, read
 * synchronously before init. This picks the persistence backend; getting it
 * wrong silently destroys returning-visitor identity (see `persistence` below).
 */
export function buildPostHogConfig(alreadyConsented: boolean): Partial<PostHogConfig> {
	return {
		api_host: '/ingest',
		ui_host: 'https://eu.posthog.com',
		capture_pageview: false, // we track manually on route change
		capture_pageleave: true,
		// Choose the store AT INIT, never patch it afterwards. posthog-js mints a
		// fresh distinct_id whenever `get_distinct_id()` is empty, and a `memory`
		// store is empty on every page load — so initialising under `memory` and
		// upgrading later via `set_config` created a NEW person on every single
		// visit. Worse, `PostHogPersistence.update_config` copies the current
		// (memory) props into the new store and saves, overwriting the id the
		// returning visitor already had. That is why retention read as
		// 348-people-with-1-session while device fingerprints proved the same
		// phones returning across six separate days.
		// A first-time visitor still gets `memory` (nothing is written before
		// consent, so the GDPR posture is unchanged); the provider's post-consent
		// `set_config` then promotes that brand-new id, which is correct for them.
		persistence: alreadyConsented ? 'localStorage+cookie' : 'memory',
		// Required for retention/stickiness/lifecycle to work at all. Without it
		// the posthog-js default `identified_only` applies, every event carries
		// `$process_person_profile: false`, and `person_id` is only a hash of the
		// churning distinct_id — so no merging is possible even once the
		// persistence bug above is fixed. Cost is per tracked person (~900/60d
		// here, immaterial).
		person_profiles: 'always',
		cross_subdomain_cookie: false,
		opt_out_capturing_by_default: true, // GDPR: wait for consent
		disable_session_recording: true, // enabled after consent
		session_recording: {
			maskAllInputs: true,
			maskTextSelector: '[data-ph-mask]'
		},
		autocapture: {
			dom_event_allowlist: ['click', 'submit', 'change'],
			element_allowlist: ['button', 'a', 'input', 'select', 'textarea']
		},
		// Disabled in favour of the web-vitals reporter at $lib/analytics/web-vitals,
		// which captures LCP/INP/CLS/TTFB/FCP with route + viewport + connection
		// dimensions PostHog's built-in flag doesn't expose.
		capture_performance: false,
		capture_exceptions: true
	};
}
