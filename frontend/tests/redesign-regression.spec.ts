import { test, expect, type BrowserContext } from '@playwright/test';

const BASE = 'http://localhost:5173';

// Regression suite locking in this week's hand-fixed redesign bugs (post-#646
// Spline redesign). Each test reproduces a specific bug that was fixed by hand
// and would silently return without a guard.
//
// Both Playwright projects (chromium + mobile-small Galaxy S5) run every
// *.spec.ts, so each describe sets an explicit viewport via `test.use` rather
// than inheriting the project's device emulation — the bug being asserted is
// viewport-specific in every case.

const dismissConsent = (ctx: Pick<BrowserContext, 'addInitScript'>) =>
	ctx.addInitScript(() => {
		try {
			localStorage.setItem(
				'pictures-cookie-consent',
				JSON.stringify({ status: 'rejected', updatedAt: new Date().toISOString() })
			);
		} catch {
			/* ignore */
		}
	});

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
// 2. HEADER SELECTOR UNIQUENESS — exactly one of each at any scroll
// ═══════════════════════════════════════════════════════════════
//
// The split header keeps an in-flow masthead and a fixed compact bar. The bug:
// both surfaces exposed the same accessible labels at once, so Playwright
// strict-mode locators matched two elements. The fix hands the labels from the
// masthead to the bar on the `stuck` crossing — exactly one element owns each
// selector at every scroll position. Asserted on a mobile viewport so the
// burger (`.mobile-menu-btn`, phone-only) is the live product surface.

test.describe('Header selector uniqueness — split masthead/bar', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test.beforeEach(async ({ context }) => {
		await dismissConsent(context);
	});

	const assertUnique = async (page: import('@playwright/test').Page) => {
		await expect(page.locator('nav[aria-label="Main"]')).toHaveCount(1);
		await expect(page.locator('[aria-label="pictures london — home"]')).toHaveCount(1);
		await expect(page.locator('.mobile-menu-btn')).toHaveCount(1);
	};

	test('exactly one nav / home link / burger at top and after scrolling', async ({ page }) => {
		await page.goto(BASE);
		await page.locator('.film-row .card').first().waitFor({ timeout: 15000 });

		// At rest: the masthead owns every selector.
		await expect(page.locator('header.header')).not.toHaveClass(/stuck/);
		await assertUnique(page);

		// Scroll past the masthead so the header sticks (the bar fades in and the
		// masthead goes inert). Wait for the crossing via the compact attribute.
		await page.evaluate(() => window.scrollTo(0, 600));
		await page.waitForFunction(
			() => document.documentElement.hasAttribute('data-header-compact'),
			undefined,
			{ timeout: 5000 }
		);
		await expect(page.locator('header.header')).toHaveClass(/stuck/);

		// While stuck: the bar now owns every selector — still exactly one each.
		await assertUnique(page);
	});
});

// ═══════════════════════════════════════════════════════════════
// 3. --header-height CONTRACT — sane at rest, bar height when stuck,
//    and the burger menu anchors below the current chrome
// ═══════════════════════════════════════════════════════════════
//
// The --header-height custom property drives every fixed consumer (mobile
// Dropdown panels, DimmerDial vignette, the burger menu). It must be the
// masthead's height at rest and the bar's height (~56px) once stuck, and the
// mobile-nav panel must sit flush below whichever chrome is current.

test.describe('--header-height contract (mobile)', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test.beforeEach(async ({ context }) => {
		await dismissConsent(context);
	});

	const headerHeightPx = (page: import('@playwright/test').Page) =>
		page.evaluate(() =>
			parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height'))
		);

	test('property tracks chrome and anchors the burger menu', async ({ page }) => {
		await page.goto(BASE);
		await page.locator('.film-row .card').first().waitFor({ timeout: 15000 });

		// At rest: a sane, masthead-sized pixel value. The property is set by a
		// post-hydration $effect (masthead ResizeObserver), which can lag the
		// first paint — wait for it to be a real number before asserting.
		await page.waitForFunction(
			() => {
				const v = parseFloat(
					getComputedStyle(document.documentElement).getPropertyValue('--header-height')
				);
				return Number.isFinite(v) && v >= 40;
			},
			undefined,
			{ timeout: 5000 }
		);
		const atRest = await headerHeightPx(page);
		expect(atRest, '--header-height should be a real px value at rest').toBeGreaterThanOrEqual(40);

		// Scroll past the crossing: property collapses to the bar height (~56px).
		// The compact attribute and the --header-height update live in separate
		// $effects, so wait on the property itself collapsing below the resting
		// masthead height rather than racing the attribute toggle.
		await page.evaluate(() => window.scrollTo(0, 600));
		await page.waitForFunction(
			() => document.documentElement.hasAttribute('data-header-compact'),
			undefined,
			{ timeout: 5000 }
		);
		await page.waitForFunction(
			(rest) => {
				const v = parseFloat(
					getComputedStyle(document.documentElement).getPropertyValue('--header-height')
				);
				return Number.isFinite(v) && v < rest;
			},
			atRest,
			{ timeout: 5000 }
		);
		const stuck = await headerHeightPx(page);
		expect(stuck, '--header-height should equal the compact bar height when stuck').toBeGreaterThan(
			40
		);
		expect(stuck).toBeLessThanOrEqual(72);

		// Open the burger: the mobile-nav panel must anchor exactly at
		// --header-height (below the current chrome, not floating over it).
		await page.locator('.mobile-menu-btn').click();
		const mobileNav = page.locator('.mobile-nav');
		await expect(mobileNav).toBeVisible();

		const navBox = await mobileNav.boundingBox();
		const currentHeaderHeight = await headerHeightPx(page);
		expect(
			Math.abs(navBox!.y - currentHeaderHeight),
			'mobile-nav panel should sit flush below the current chrome (top === --header-height)'
		).toBeLessThanOrEqual(1);
	});
});

// ═══════════════════════════════════════════════════════════════
// 4. BANNER Z-ORDER — consent banner must not steal the sheet's CTA
// ═══════════════════════════════════════════════════════════════
//
// The cookie consent banner is a bottom-anchored fixed bar. The bug: at
// z-9999 it sat above the MobileFilterSheet footer and intercepted taps on the
// primary "Show N films" CTA. The fix drops it to z-70 (below the sheet's
// z-80). This describe deliberately does NOT dismiss the banner — it must be
// present to prove it no longer steals the tap.

test.describe('Banner z-order — sheet CTA wins the tap (banner not dismissed)', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('Show-films CTA receives the tap, not the consent banner', async ({ page }) => {
		await page.goto(BASE);
		await page.locator('.film-row .card').first().waitFor({ timeout: 15000 });

		// The banner must be present for this test to mean anything.
		await expect(page.locator('.consent-banner')).toBeVisible();

		// Open the FILTERS sheet — lazy-loaded via dynamic import, so allow time
		// for the chunk to resolve and the dialog to mount.
		await page.getByRole('button', { name: 'Open filters' }).click();
		const sheet = page.getByRole('dialog', { name: 'Filter programme' });
		await expect(sheet).toBeVisible({ timeout: 5000 });

		// The footer's primary CTA.
		const showBtn = page.locator('.sheet-foot button.show');
		await showBtn.scrollIntoViewIfNeeded();
		await expect(showBtn).toBeVisible();
		await expect(showBtn).toContainText('films');

		// document.elementFromPoint at the CTA's centre must hit the button (or a
		// descendant span), NOT the consent banner sitting at the bottom edge.
		const box = (await showBtn.boundingBox())!;
		const hit = await page.evaluate(
			({ cx, cy }) => {
				const el = document.elementFromPoint(cx, cy);
				return {
					inShow: !!el?.closest('button.show'),
					inBanner: !!el?.closest('.consent-banner')
				};
			},
			{ cx: box.x + box.width / 2, cy: box.y + box.height / 2 }
		);

		expect(hit.inBanner, 'consent banner intercepted the sheet CTA tap (z-order regression)').toBe(
			false
		);
		expect(hit.inShow, 'Show-films CTA should receive the tap at its own centre').toBe(true);
	});
});
