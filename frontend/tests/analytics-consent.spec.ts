import { test, expect, type Page } from '@playwright/test';

import { BASE } from './base-url';

// Runtime cover for the identity half of the 2026-07-27 analytics fix: a
// returning visitor must keep their distinct_id across page loads. This is the
// fault that made retention unmeasurable — initialising posthog-js under
// `persistence: 'memory'` left `get_distinct_id()` empty on every load, so a new
// "person" was minted each visit (348 people with 1 session, 2 with more, while
// device fingerprints proved the same phones returning across six days).
//
// Deliberately asserts only on posthog's PERSISTED STATE, never on captured
// events. Event capture is not observable here: `/ingest/*` is not proxied by the
// preview server, and stubbing it well enough for posthog-js to drain its queue
// proved unreliable — not even the automatic `$opt_in` event appeared. The init
// CONFIG is covered instead by src/lib/analytics/posthog-config.test.ts, which
// runs in CI and fails against the old values.
//
// ⚠️ THIS SPEC DOES NOT RUN IN CI, AND SO PROTECTS NOTHING THERE. CI sets
// `PUBLIC_POSTHOG_KEY: ''` deliberately ("no analytics noise"), which makes
// initPostHog() return early, so there is no state to inspect and the test skips.
// It is real cover locally — verified to fail against the old `persistence:
// 'memory'` init — but the only executable CI gate for this fix is
// src/lib/analytics/posthog-config.test.ts, which asserts the config object.
// To make this enforce in CI, give the frontend-e2e job a throwaway PostHog token:
// the spec asserts only on browser storage and never on ingested events, and
// `/ingest/*` is unproxied by the preview server, so nothing would reach a real
// project. Not done here because enabling posthog-js across the other ~200 E2E
// tests risks new network flakiness for no gain to them.

/** posthog-js stores its state under `ph_<token>_posthog`. */
async function readPostHogState(page: Page): Promise<{ distinct_id?: string } | null> {
	return page.evaluate(() => {
		const key = Object.keys(localStorage).find((k) => /^ph_.+_posthog$/.test(k));
		if (!key) return null;
		try {
			return JSON.parse(localStorage.getItem(key)!);
		} catch {
			return null;
		}
	});
}

/**
 * PostHog is idle-deferred (up to 2s); detect it by its own boot traffic.
 * 8s, not 15: when PostHog is key-disabled this wait is pure dead CI time before
 * the inevitable skip, and posthog's own ceiling for the deferral is 2s.
 */
async function waitForPostHogBoot(hits: string[]): Promise<boolean> {
	const deadline = Date.now() + 8000;
	while (Date.now() < deadline) {
		if (hits.length > 0) return true;
		await new Promise((r) => setTimeout(r, 200));
	}
	return false;
}

/** Any posthog-owned storage, across all three backends it can write to. */
async function readAllPostHogStorage(page: Page) {
	return page.evaluate(() => ({
		localStorage: Object.keys(localStorage).filter((k) => k.startsWith('ph_')),
		sessionStorage: Object.keys(sessionStorage).filter((k) => k.startsWith('ph_')),
		cookies: document.cookie
			.split(';')
			.map((c) => c.trim().split('=')[0])
			.filter((n) => n.startsWith('ph_') || n.startsWith('__ph_'))
	}));
}

test.describe('analytics identity', () => {
	test.setTimeout(120_000);

	test('a returning visitor keeps the same distinct_id, and nothing persists pre-consent', async ({
		page
	}, testInfo) => {
		// Storage and config behaviour, not rendering — one engine is enough, and it
		// halves the dead wait when PostHog is key-disabled.
		test.skip(testInfo.project.name !== 'chromium', 'engine-independent; covered once');

		const hits: string[] = [];
		page.on('request', (req) => {
			if (req.url().includes('/ingest/')) hits.push(req.url());
		});

		await page.goto(BASE);
		const booted = await waitForPostHogBoot(hits);
		test.skip(!booted, 'PostHog is not configured in this environment (no PUBLIC_POSTHOG_KEY)');

		// Pre-consent the store is `memory`, so nothing may be written to disk. This
		// checks all three backends posthog can write to, not just localStorage —
		// note it passes against the OLD code too (which also inited under `memory`),
		// so it is a GDPR guard, not regression cover. The distinct_id-stability
		// assertion below is the part that actually pins the bug.
		const accept = page.getByRole('button', { name: 'ACCEPT ALL' });
		await expect(accept).toBeVisible();
		expect(
			await readAllPostHogStorage(page),
			'nothing may be persisted before a consent decision'
		).toEqual({ localStorage: [], sessionStorage: [], cookies: [] });

		await accept.click();

		// Accepting promotes the memory-held id into localStorage+cookie.
		await expect
			.poll(() => readPostHogState(page).then((s) => s?.distinct_id ?? null), {
				message: 'consent must promote posthog state into localStorage',
				timeout: 20000
			})
			.toBeTruthy();

		const firstId = (await readPostHogState(page))!.distinct_id!;

		// The regression itself: on reload, posthog must ADOPT the stored id rather
		// than mint a new one. Under the old `persistence: 'memory'` init this
		// assertion fails — the id differs on every load.
		hits.length = 0;
		await page.reload();
		expect(await waitForPostHogBoot(hits)).toBe(true);
		await expect
			.poll(() => readPostHogState(page).then((s) => s?.distinct_id ?? null), {
				message: 'a returning visitor must keep their distinct_id',
				timeout: 20000
			})
			.toBe(firstId);

		// And once more, to rule out a single lucky reload.
		hits.length = 0;
		await page.reload();
		expect(await waitForPostHogBoot(hits)).toBe(true);
		await expect
			.poll(() => readPostHogState(page).then((s) => s?.distinct_id ?? null), { timeout: 20000 })
			.toBe(firstId);
	});
});
