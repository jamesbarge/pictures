import { test, expect } from '@playwright/test';

import { BASE, dismissConsent } from './base-url';

// Regression suite locking in this week's hand-fixed redesign bugs (post-#646
// Spline redesign). Each test reproduces a specific bug that was fixed by hand
// and would silently return without a guard.
//
// Both Playwright projects (chromium + mobile-small Galaxy S5) run every
// *.spec.ts, so each describe sets an explicit viewport via `test.use` rather
// than inheriting the project's device emulation — the bug being asserted is
// viewport-specific in every case.

// ═══════════════════════════════════════════════════════════════
// 1. RESIZE RATCHET — fitToFirstRow must grow back, not only shrink
// ═══════════════════════════════════════════════════════════════
//
// fitToFirstRow pins each day section's width to its first row of cards so the
// black day-header bar lines up with the grid. The bug: the inline width pin
// overrode `width: 100%`, so after a narrow (mobile) pass the section wrapped
// one card per row and re-measured itself narrow forever — it could shrink but
// never grow back. The fix releases the pin before re-measuring.

test.describe('Resize ratchet — day section grows back after shrinking', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test.beforeEach(async ({ context }) => {
		await dismissConsent(context);
	});

	test('first day section re-expands to a multi-card width after a narrow pass', async ({
		page
	}) => {
		await page.goto(BASE);
		await page.locator('.film-row .card').first().waitFor({ timeout: 15000 });

		const day = page.locator('section.day').first();
		const cardCount = await day.locator('.film-row > .card').count();

		// The ratchet only manifests when a day has ≥2 cards (a single-card day
		// is legitimately one card wide at every viewport). Guard so the test is
		// meaningful rather than vacuously passing on a thin day.
		test.skip(cardCount < 2, 'first day has fewer than 2 cards — ratchet not observable');

		// Wide: section spans multiple cards (each card ≈ 328px).
		const wide = (await day.boundingBox())!.width;
		expect(wide).toBeGreaterThan(328 * 1.5);

		// Narrow pass: cards stack one-per-column, section pins to ~one card wide.
		await page.setViewportSize({ width: 400, height: 900 });
		await page.waitForFunction(
			(prev) => {
				const el = document.querySelector('section.day') as HTMLElement | null;
				return !!el && el.getBoundingClientRect().width < prev;
			},
			wide,
			{ timeout: 5000 }
		);

		// Back to wide: the pin must release so the section grows back to fit
		// multiple cards again. Pre-fix this stayed stuck at the narrow width.
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.waitForFunction(
			() => {
				const el = document.querySelector('section.day') as HTMLElement | null;
				return !!el && el.getBoundingClientRect().width > 328 * 1.5;
			},
			undefined,
			{ timeout: 5000 }
		);

		const regrown = (await day.boundingBox())!.width;
		expect(
			regrown,
			'day section failed to re-expand after a narrow→wide resize (fitToFirstRow ratchet)'
		).toBeGreaterThan(328 * 1.5);
	});
});

// ═══════════════════════════════════════════════════════════════
// 2. ONE ACCESSIBLE COPY — duplicated chrome never doubles a selector
// ═══════════════════════════════════════════════════════════════
//
// The logo, ALL / NEW / REP and search each render twice: once in the top bar
// and once in the sidebar. CSS hides whichever copy the current width does not
// use (display:none or visibility:hidden), which also drops it from the
// accessibility tree. If that hiding slips, role-based locators match two
// elements (strict mode fails across the suite) and screen readers announce
// every control twice. Replaces the split masthead/bar uniqueness test.

for (const width of [390, 1440]) {
	test.describe(`One accessible copy of each control at ${width}px`, () => {
		test.use({ viewport: { width, height: 900 } });

		test.beforeEach(async ({ context }) => {
			await dismissConsent(context);
		});

		test('exactly one logo / programme / search / burger at top and after scrolling', async ({
			page
		}) => {
			await page.goto(BASE);
			await page.locator('.film-row .card').first().waitFor({ timeout: 15000 });

			const assertUnique = async () => {
				await expect(page.getByRole('link', { name: 'pictures london, what’s on' })).toHaveCount(1);
				await expect(page.getByRole('radiogroup', { name: 'Programme' })).toHaveCount(1);
				await expect(
					page.getByRole('searchbox', { name: 'Search films, cinemas and directors' })
				).toHaveCount(1);
				// The burger exists only where the sidebar is not already open.
				await expect(page.getByRole('button', { name: /^Open menu/ })).toHaveCount(
					width < 1024 ? 1 : 0
				);
			};

			await assertUnique();
			await page.evaluate(() => window.scrollTo(0, 600));
			await page.waitForFunction(() => window.scrollY > 0, undefined, { timeout: 5000 });
			await assertUnique();
		});
	});
}

// ═══════════════════════════════════════════════════════════════
// 3. TOP BAR PINS, DRAWER COVERS — mobile chrome once scrolled
// ═══════════════════════════════════════════════════════════════
//
// Replaces the --header-height contract, which existed so the old burger menu
// could anchor below a masthead that changed height on scroll. The top bar is
// now one sticky row and the drawer a full-height panel from the left edge.
// The guarantees: the bar stays at the top of the viewport after scrolling
// (an `overflow` on an ancestor silently breaks `position: sticky`), and the
// open drawer spans the viewport from its top.

test.describe('Top bar and drawer position (mobile)', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test.beforeEach(async ({ context }) => {
		await dismissConsent(context);
	});

	test('bar stays pinned when scrolled and the drawer spans the viewport', async ({ page }) => {
		await page.goto(BASE);
		await page.locator('.film-row .card').first().waitFor({ timeout: 15000 });

		await page.evaluate(() => window.scrollTo(0, 600));
		await page.waitForFunction(() => window.scrollY >= 600, undefined, { timeout: 5000 });

		const burger = page.getByRole('button', { name: /^Open menu/ });
		await expect(burger).toBeVisible();
		const burgerBox = (await burger.boundingBox())!;
		expect(burgerBox.y, 'top bar scrolled away instead of sticking').toBeGreaterThanOrEqual(0);
		expect(burgerBox.y).toBeLessThan(40);

		// A tap before hydration is dropped, so re-tap until the drawer opens.
		const drawer = page.getByRole('dialog', { name: 'Menu and filters' });
		await expect(async () => {
			if (!(await drawer.isVisible())) await burger.click();
			await expect(drawer).toBeVisible({ timeout: 2000 });
		}).toPass({ timeout: 15000 });

		// Let the slide-in finish, then check the panel's edges.
		await expect.poll(async () => (await drawer.boundingBox())?.x, { timeout: 5000 }).toBe(0);
		const box = (await drawer.boundingBox())!;
		expect(box.y).toBe(0);
		expect(Math.abs(box.height - 844)).toBeLessThanOrEqual(1);
	});
});

// ═══════════════════════════════════════════════════════════════
// 4. BANNER Z-ORDER — consent banner must not steal the drawer's CTA
// ═══════════════════════════════════════════════════════════════
//
// The cookie consent banner is a bottom-anchored fixed bar. The bug it guards:
// at z-9999 it sat above the old filter sheet's footer and intercepted taps on
// the primary CTA. The banner is z-70, below the drawer's z-80, so the drawer's
// "Done · N films" button must win. This describe deliberately does NOT dismiss
// the banner — it must be present to prove it no longer steals the tap.

test.describe('Banner z-order — drawer CTA wins the tap (banner not dismissed)', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('Done receives the tap, not the consent banner', async ({ page }) => {
		await page.goto(BASE);
		await page.locator('.film-row .card').first().waitFor({ timeout: 15000 });

		// The banner must be present for this test to mean anything.
		await expect(page.locator('.consent-banner')).toBeVisible();

		const drawer = page.getByRole('dialog', { name: 'Menu and filters' });
		await expect(async () => {
			if (!(await drawer.isVisible())) await page.getByRole('button', { name: /^Open menu/ }).click();
			await expect(drawer).toBeVisible({ timeout: 2000 });
		}).toPass({ timeout: 15000 });
		await expect.poll(async () => (await drawer.boundingBox())?.x, { timeout: 5000 }).toBe(0);

		// The drawer foot's primary CTA.
		const done = drawer.getByRole('button', { name: /^Done/ });
		await expect(done).toBeVisible();

		// document.elementFromPoint at the CTA's centre must hit the button (or a
		// descendant), NOT the consent banner sitting at the bottom edge.
		const box = (await done.boundingBox())!;
		const hit = await page.evaluate(
			({ cx, cy }) => {
				const el = document.elementFromPoint(cx, cy);
				return {
					inDone: !!el?.closest('.done'),
					inBanner: !!el?.closest('.consent-banner')
				};
			},
			{ cx: box.x + box.width / 2, cy: box.y + box.height / 2 }
		);

		expect(hit.inBanner, 'consent banner intercepted the drawer CTA tap (z-order regression)').toBe(
			false
		);
		expect(hit.inDone, 'Done CTA should receive the tap at its own centre').toBe(true);
	});
});
