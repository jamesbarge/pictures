import { describe, expect, it } from 'vitest';

import { buildPostHogConfig } from './posthog-config';

// Regression cover for the two config faults that made every PostHog number
// untrustworthy for months (see changelogs/2026-07-27-posthog-identity-and-pageview.md).
// PostHog is key-disabled in CI (`PUBLIC_POSTHOG_KEY: ''`), so an E2E test would
// be vacuous there — these assertions are the real gate.
describe('buildPostHogConfig', () => {
	describe('persistence is chosen at init, never patched afterwards', () => {
		it('gives a RETURNING consented visitor localStorage+cookie, so their distinct_id survives', () => {
			// The bug: initialising under 'memory' left get_distinct_id() empty on
			// every page load, so posthog-js minted a new id each visit, and the
			// later set_config({persistence}) copied that fresh id over the stored
			// one. Retention read as 348-people-with-1-session while device
			// fingerprints proved the same phones returning across six days.
			expect(buildPostHogConfig(true).persistence).toBe('localStorage+cookie');
		});

		it('keeps a FIRST-TIME visitor on memory, so nothing is written pre-consent', () => {
			// GDPR posture: no storage before a decision. The provider promotes this
			// to localStorage+cookie once they accept, which is correct for them.
			expect(buildPostHogConfig(false).persistence).toBe('memory');
		});
	});

	it("sets person_profiles to 'always' so anonymous visitors get real person rows", () => {
		// Without this the posthog-js default 'identified_only' applies: every event
		// carries $process_person_profile:false and person_id is only a hash of the
		// distinct_id, so retention/stickiness/lifecycle cannot work even once
		// persistence is fixed. Was observed as 5,347/5,347 events suppressed.
		for (const consented of [true, false]) {
			expect(buildPostHogConfig(consented).person_profiles).toBe('always');
		}
	});

	it('never auto-captures pageviews — the provider fires them after opt-in', () => {
		// capture_pageview must stay false. The landing pageview is fired from the
		// consent effect, because a capture() before opt_in_capturing() is silently
		// discarded and the path-change effect only fires on a CHANGE (which is how
		// 407 opt-ins produced only 134 pageview persons).
		for (const consented of [true, false]) {
			expect(buildPostHogConfig(consented).capture_pageview).toBe(false);
		}
	});

	it('still waits for consent before capturing anything', () => {
		for (const consented of [true, false]) {
			const config = buildPostHogConfig(consented);
			expect(config.opt_out_capturing_by_default).toBe(true);
			expect(config.disable_session_recording).toBe(true);
		}
	});

	it('keeps consent the ONLY thing that varies between the two states', () => {
		// Guards against a future edit accidentally branching more behaviour on
		// consent than intended. Only `persistence` may differ.
		const consented = buildPostHogConfig(true) as Record<string, unknown>;
		const fresh = buildPostHogConfig(false) as Record<string, unknown>;
		const differing = Object.keys({ ...consented, ...fresh }).filter(
			(k) => JSON.stringify(consented[k]) !== JSON.stringify(fresh[k])
		);
		expect(differing).toEqual(['persistence']);
	});
});
