/**
 * Command palette E2E — cmd+k global search.
 *
 * Locks in the contracts shipped across steps 4-8 of the cmd+k plan:
 *  - ⌘K opens / Esc closes
 *  - Typing surfaces results from /api/films/search via debounced fetch
 *  - Arrow keys + Enter navigate to a film row
 *  - Multi-slice queries surface a "Apply filters" composite action,
 *    and pressing Enter on it mutates filters.svelte state (visible as
 *    pressed buttons in the calendar sidebar)
 *  - Escape returns focus to the trigger
 *
 * Tests rely on the dev server proxying /api/* to the production API
 * (or whichever target API_PROXY_TARGET is set to). We don't mock the
 * network because RRF / trigram fuzzy is part of the contract — if the
 * proxy target doesn't have step 2's RRF API, these tests fail loudly
 * and that's the right signal.
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

test.beforeEach(async ({ context }) => {
	// Pre-reject cookies so the banner doesn't shadow the palette.
	await context.addInitScript(() => {
		try {
			localStorage.setItem(
				'pictures-cookie-consent',
				JSON.stringify({ status: 'rejected', updatedAt: new Date().toISOString() })
			);
		} catch {
			/* ignore */
		}
	});
});

/**
 * Wait until the GlobalCmdkBinding has had a chance to mount and attach
 * its document keydown listener. Without this, the very first ⌘K can land
 * before onMount fires and the press silently does nothing.
 */
async function waitForPaletteBinding(page: import('@playwright/test').Page) {
	// The skip-link is the first interactive element in the layout; once
	// it's present the layout has hydrated and onMount handlers have run.
	await page.getByRole('link', { name: 'Skip to content' }).waitFor({
		state: 'attached',
		timeout: 10000
	});
	// One additional rAF tick to ensure onMount callbacks have flushed.
	await page.evaluate(() => new Promise(requestAnimationFrame));
}

/**
 * Open the palette via the global binding. Playwright's keyboard press
 * targets the focused element; on initial load nothing is focused so the
 * keydown doesn't reach the document-level listener reliably. We focus
 * body first, then dispatch the platform-correct modifier+k.
 */
async function openPalette(page: import('@playwright/test').Page) {
	// A small-position click avoids hitting any header link. This also
	// dismisses any open menus/popovers that might still be in the DOM.
	await page.locator('body').click({ position: { x: 1, y: 1 } });
	// Detect platform once per test to send Meta on darwin, Control elsewhere.
	const isMac = await page.evaluate(() =>
		/Mac|iPhone|iPad/.test(navigator.platform)
	);
	// Try up to 3 times — bits-ui Dialog has a tiny mount race in headless
	// where the first synthetic keydown can be swallowed before the
	// listener wires up to document. Retrying buys us a stable open.
	for (let attempt = 0; attempt < 3; attempt++) {
		await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');
		const dialog = page.getByRole('dialog', { name: 'Search pictures.london' });
		try {
			await dialog.waitFor({ state: 'visible', timeout: 2000 });
			return;
		} catch {
			if (attempt === 2) throw new Error('palette failed to open after 3 attempts');
			await page.waitForTimeout(200);
		}
	}
}

test.describe('Command Palette — cmd+k', () => {
	test('⌘K opens the palette and Esc closes it', async ({ page }) => {
		await page.goto(BASE);
		await waitForPaletteBinding(page);

		await openPalette(page);
		const dialog = page.getByRole('dialog', { name: 'Search pictures.london' });
		await expect(dialog).toBeVisible();

		const input = dialog.getByRole('combobox');
		await expect(input).toBeFocused();

		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
	});

	test('typing a fuzzy query surfaces matching films (typo + accent tolerant)', async ({ page }) => {
		await page.goto(BASE);
		await waitForPaletteBinding(page);

		await openPalette(page);
		const dialog = page.getByRole('dialog', { name: 'Search pictures.london' });
		const input = dialog.getByRole('combobox');
		await input.fill('amelei');

		// Wait for the listbox to populate.
		const listbox = dialog.getByRole('listbox');
		await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 5000 });

		// The FILMS section contains an Amélie row despite the typo + missing accent.
		await expect(listbox.getByRole('option').filter({ hasText: /Amélie/ }).first()).toBeVisible();

		// Search is internal-only now — no SCREENINGS section (it linked out to booking sites).
		await expect(dialog.getByText('SCREENINGS', { exact: true })).toHaveCount(0);
	});

	test('Enter on a film row navigates to /film/[id]', async ({ page }) => {
		await page.goto(BASE);
		await waitForPaletteBinding(page);

		await openPalette(page);
		const dialog = page.getByRole('dialog', { name: 'Search pictures.london' });
		await dialog.getByRole('combobox').fill('akira');

		// FILMS is the first result section, so the top option is a film and is
		// selected by default — Enter activates it → /film/[id].
		const firstOption = dialog.getByRole('option').first();
		await expect(firstOption).toBeVisible({ timeout: 5000 });

		await page.keyboard.press('Enter');

		await expect(page).toHaveURL(/\/film\/[a-f0-9-]+/, { timeout: 5000 });
	});

	test('composite filter-action surfaces for a multi-slice query', async ({ page }) => {
		await page.goto(BASE);
		await waitForPaletteBinding(page);

		await openPalette(page);
		const dialog = page.getByRole('dialog', { name: 'Search pictures.london' });
		await dialog.getByRole('combobox').fill('horror 70mm tonight');

		// The synthesised action is derived from the parser, no network wait needed.
		const actionRow = dialog
			.getByRole('option')
			.filter({ hasText: /Apply filters/ });
		await expect(actionRow).toBeVisible({ timeout: 2000 });
		await expect(actionRow).toContainText(/70MM/);
		await expect(actionRow).toContainText(/horror/);
	});

	test('Enter on the composite action applies filters to the calendar', async ({ page }) => {
		// Force the desktop layout: the redesigned FigmaToolbar collapses the
		// FORMAT/GENRE chips into a bottom-sheet below 840px, so the visible
		// confirmation only exists at desktop width. Both Playwright projects
		// (chromium + mobile-small) run this file, so we pin the viewport here
		// rather than relying on the device default (mirrors test-all.spec.ts).
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(BASE);
		await waitForPaletteBinding(page);

		await openPalette(page);
		const dialog = page.getByRole('dialog', { name: 'Search pictures.london' });
		await dialog.getByRole('combobox').fill('horror 70mm');

		// The composite action is the first row (actions section is first
		// in SECTION_ORDER), so it's selected by default. Activating it calls
		// filters.applyIntent(parsed) → formats=['70mm'], genres=['horror'].
		await page.keyboard.press('Enter');
		await expect(dialog).toBeHidden({ timeout: 5000 });

		// Visible confirmation in the redesigned toolbar: a single applied
		// format/genre collapses the chip label to that value, and the chip
		// flips to its `.active` (inverted) state. These chips are <button>s
		// that open Dropdown panels — the label is their accessible name.
		const toolbar = page.getByRole('toolbar', { name: 'Film filters' });
		const formatChip = toolbar.getByRole('button', { name: '70MM' });
		const genreChip = toolbar.getByRole('button', { name: 'HORROR' });
		await expect(formatChip).toBeVisible({ timeout: 5000 });
		await expect(genreChip).toBeVisible();

		// Open the FORMAT panel and confirm the 70MM option is checked — the
		// store mutation propagated all the way to the filter UI's checkboxes.
		await formatChip.click();
		await expect(page.getByRole('checkbox', { name: '70MM', exact: true })).toBeChecked();
	});
});
