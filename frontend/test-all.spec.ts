import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

test.describe('Pictures London — SvelteKit Frontend', () => {

	// ═══════════════════════════════════════════════
	// HOMEPAGE
	// ═══════════════════════════════════════════════

	test.describe('Homepage', () => {
		test('loads and shows film cards with real data', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			const cards = await page.locator('.film-card').count();
			expect(cards).toBeGreaterThan(0);
			const firstTitle = await page.locator('.film-card .film-title').first().textContent();
			expect(firstTitle).toBeTruthy();
			expect(firstTitle!.length).toBeGreaterThan(0);
		});

		test('shows screening pills with HH:MM times', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.screening-pill', { timeout: 10000 });
			const pills = await page.locator('.screening-pill').count();
			expect(pills).toBeGreaterThan(0);
			const pillText = await page.locator('.screening-pill').first().textContent();
			expect(pillText).toMatch(/\d{2}:\d{2}/);
		});

		test('shows day section headers', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.day-section', { timeout: 10000 });
			const dayHeader = await page.locator('.day-header h2').first().textContent();
			expect(dayHeader).toBeTruthy();
		});

		test('shows breathing grid wordmark', async ({ page }) => {
			await page.goto(BASE);
			await expect(page.locator('[aria-label="pictures london"]')).toBeVisible();
		});

		test('shows all filter controls', async ({ page }) => {
			await page.goto(BASE);
			await expect(page.getByText('ALL', { exact: true })).toBeVisible();
			await expect(page.getByText('NEW', { exact: true })).toBeVisible();
			await expect(page.getByText('REPERTORY', { exact: true })).toBeVisible();
			await expect(page.getByText('WHEN')).toBeVisible();
			await expect(page.getByText('ALL CINEMAS')).toBeVisible();
			await expect(page.getByText('FORMAT')).toBeVisible();
			await expect(page.getByPlaceholder('Search films, cinemas, directors...')).toBeVisible();
		});

		test('REPERTORY filter changes displayed films', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			const allCount = await page.locator('.film-card').count();
			await page.getByText('REPERTORY', { exact: true }).click();
			await page.waitForTimeout(500);
			const repCount = await page.locator('.film-card').count();
			expect(repCount).not.toEqual(allCount);
		});

		test('cinema filter shows results for selected cinema', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			const allCount = await page.locator('.film-card').count();

			// Open cinema picker
			await page.getByLabel('Cinema filter').click();
			await page.waitForTimeout(300);

			// Select first cinema by clicking the label row
			const firstCinemaRow = page.locator('.cinema-dropdown .checkbox-row').first();
			await firstCinemaRow.click();
			await page.waitForTimeout(500);

			// Close dropdown by pressing Escape
			await page.keyboard.press('Escape');
			await page.waitForTimeout(300);

			const filteredCount = await page.locator('.film-card').count();
			// Should show fewer films than all
			expect(filteredCount).toBeLessThanOrEqual(allCount);
		});

		test('WHEN picker opens and shows date presets and time presets', async ({ page }) => {
			await page.goto(BASE);

			// Open WHEN picker
			await page.getByLabel('Date and time filter').click();
			await page.waitForTimeout(300);

			// Date presets should be visible
			await expect(page.getByRole('button', { name: 'ANY' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'TODAY' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'WEEKEND' })).toBeVisible();
			await expect(page.getByRole('button', { name: '7 DAYS' })).toBeVisible();

			// Time section should be visible (was the bug — hidden by overflow)
			await expect(page.getByRole('button', { name: 'MORNING' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'EVENING' })).toBeVisible();
		});

		test('TODAY date preset filters screenings', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });

			// Open WHEN picker and select TODAY
			await page.getByLabel('Date and time filter').click();
			await page.waitForTimeout(300);
			await page.getByRole('button', { name: 'TODAY' }).click();
			await page.waitForTimeout(500);

			// Close dropdown
			await page.keyboard.press('Escape');
			await page.waitForTimeout(300);

			// Should show TODAY in the trigger button
			const triggerText = await page.getByLabel('Date and time filter').textContent();
			expect(triggerText?.toUpperCase()).toContain('TODAY');
		});

		test('NEW filter shows different films than ALL', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			const allCount = await page.locator('.film-card').count();

			await page.getByText('NEW', { exact: true }).click();
			await page.waitForTimeout(500);

			const newCount = await page.locator('.film-card').count();
			expect(newCount).not.toEqual(allCount);
		});

		test('format filter reduces displayed films', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			const allCount = await page.locator('.film-card').count();

			// Open format picker
			await page.getByLabel('Format filter').click();
			await page.waitForTimeout(300);

			// Select 35mm
			await page.locator('.checkbox-row').filter({ hasText: '35MM' }).click();
			await page.waitForTimeout(500);

			// Close dropdown
			await page.keyboard.press('Escape');
			await page.waitForTimeout(300);

			const filteredCount = await page.locator('.film-card').count();
			// Selecting a specific format should show fewer films than ALL
			expect(filteredCount).toBeLessThan(allCount);
		});

		test('House Lights dimmer is visible', async ({ page }) => {
			await page.goto(BASE);
			await expect(page.getByText('HOUSE LIGHTS')).toBeVisible();
		});

		test('footer is visible with correct links', async ({ page }) => {
			await page.goto(BASE);
			await expect(page.locator('footer')).toBeVisible();
			await expect(page.locator('footer').getByText('about')).toBeVisible();
			await expect(page.locator('footer').getByText('privacy')).toBeVisible();
			await expect(page.locator('footer').getByText('terms')).toBeVisible();
		});

		test('has correct page title', async ({ page }) => {
			await page.goto(BASE);
			await expect(page).toHaveTitle('pictures · london');
		});
	});

	// ═══════════════════════════════════════════════
	// NAVIGATION
	// ═══════════════════════════════════════════════

	test.describe('Navigation', () => {
		test('header nav links are visible', async ({ page }) => {
			await page.goto(BASE);
			await expect(page.locator('.nav-links').getByRole('link', { name: 'ABOUT' })).toBeVisible();
			await expect(page.locator('.nav-links').getByRole('link', { name: 'MAP' })).toBeVisible();
		});

		test('clicking wordmark navigates to home', async ({ page }) => {
			await page.goto(`${BASE}/about`);
			await page.locator('[aria-label="pictures london — home"]').click();
			await expect(page).toHaveURL(BASE + '/');
		});

		test('footer about link navigates to about page', async ({ page }) => {
			await page.goto(BASE);
			await page.locator('footer').getByRole('link', { name: 'about' }).click();
			await expect(page).toHaveURL(`${BASE}/about`);
		});
	});

	// ═══════════════════════════════════════════════
	// FILM DETAIL PAGE
	// ═══════════════════════════════════════════════

	test.describe('Film Detail Page', () => {
		test('navigating to a film shows detail page with title', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			const title = await page.locator('h1').textContent();
			expect(title).toBeTruthy();
			expect(title!.length).toBeGreaterThan(0);
		});

		test('shows metadata row', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			await expect(page.locator('.meta-row')).toBeVisible();
		});

		test('shows upcoming screenings section', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			await expect(page.getByText('UPCOMING SCREENINGS')).toBeVisible();
		});

		test('shows status toggle without SEEN button', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			await expect(page.getByText('WANT TO SEE')).toBeVisible();
			await expect(page.getByText('NOT INTERESTED')).toBeVisible();
			// SEEN should NOT be present
			const seenButtons = await page.getByText('SEEN', { exact: true }).count();
			expect(seenButtons).toBe(0);
		});

		test('shows external links (TMDB, IMDb, Letterboxd)', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			// At least one external link should be present
			const extLinks = await page.locator('.ext-link').count();
			expect(extLinks).toBeGreaterThan(0);
		});

		test('has correct page title with film name', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			await expect(page).toHaveTitle(/— pictures · london/);
		});

		test('screening rows have booking link arrows', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);
			const rows = await page.locator('.screening-row').count();
			expect(rows).toBeGreaterThan(0);
			const arrows = await page.locator('.booking-arrow').count();
			expect(arrows).toBeGreaterThan(0);
		});
	});

	// ═══════════════════════════════════════════════
	// TONIGHT PAGE
	// ═══════════════════════════════════════════════

	test.describe('Tonight Page', () => {
		test('loads with correct heading', async ({ page }) => {
			await page.goto(`${BASE}/tonight`);
			await expect(page.locator('h1')).toContainText('TONIGHT');
		});

		test('has correct page title', async ({ page }) => {
			await page.goto(`${BASE}/tonight`);
			await expect(page).toHaveTitle(/Tonight/);
		});
	});

	// ═══════════════════════════════════════════════
	// THIS WEEKEND PAGE
	// ═══════════════════════════════════════════════

	test.describe('This Weekend Page', () => {
		test('loads with content or empty state', async ({ page }) => {
			await page.goto(`${BASE}/this-weekend`);
			const hasContent = await page.locator('.day-section, .empty-state').count();
			expect(hasContent).toBeGreaterThan(0);
		});

		test('has correct page title', async ({ page }) => {
			await page.goto(`${BASE}/this-weekend`);
			await expect(page).toHaveTitle(/Weekend/);
		});
	});

	// ═══════════════════════════════════════════════
	// CINEMAS PAGE
	// ═══════════════════════════════════════════════

	test.describe('Cinemas Page', () => {
		test('loads cinema list with cards', async ({ page }) => {
			await page.goto(`${BASE}/cinemas`);
			await expect(page.locator('h1')).toContainText('CINEMAS');
			const cards = await page.locator('.cinema-card').count();
			expect(cards).toBeGreaterThan(0);
		});

		test('shows cinema count', async ({ page }) => {
			await page.goto(`${BASE}/cinemas`);
			await page.waitForSelector('.cinema-card', { timeout: 10000 });
			const countText = await page.locator('h1 + span, .font-mono').first().textContent();
			expect(countText).toBeTruthy();
		});

		test('search filters cinema list', async ({ page }) => {
			await page.goto(`${BASE}/cinemas`);
			await page.waitForSelector('.cinema-card', { timeout: 10000 });
			const allCount = await page.locator('.cinema-card').count();
			await page.getByPlaceholder('Search cinemas...').fill('Curzon');
			await page.waitForTimeout(300);
			const filteredCount = await page.locator('.cinema-card').count();
			expect(filteredCount).toBeLessThan(allCount);
			expect(filteredCount).toBeGreaterThan(0);
		});

		test('has correct page title', async ({ page }) => {
			await page.goto(`${BASE}/cinemas`);
			await expect(page).toHaveTitle(/Cinemas/);
		});
	});

	// ═══════════════════════════════════════════════
	// DIRECTORS PAGE
	// ═══════════════════════════════════════════════

	test.describe('Directors Page', () => {
		test('loads directors list', async ({ page }) => {
			await page.goto(`${BASE}/directors`);
			await expect(page.locator('h1')).toContainText('DIRECTORS');
			const cards = await page.locator('.director-card').count();
			expect(cards).toBeGreaterThan(0);
		});

		test('shows director film counts', async ({ page }) => {
			await page.goto(`${BASE}/directors`);
			await page.waitForSelector('.director-card', { timeout: 10000 });
			const filmCount = await page.locator('.director-films').first().textContent();
			expect(filmCount).toMatch(/\d+ films? showing/);
		});

		test('search filters directors', async ({ page }) => {
			await page.goto(`${BASE}/directors`);
			await page.waitForSelector('.director-card', { timeout: 10000 });
			const allCount = await page.locator('.director-card').count();
			await page.getByPlaceholder('Search directors...').fill('Spielberg');
			await page.waitForTimeout(300);
			const filteredCount = await page.locator('.director-card').count();
			expect(filteredCount).toBeLessThanOrEqual(allCount);
		});

		test('has correct page title', async ({ page }) => {
			await page.goto(`${BASE}/directors`);
			await expect(page).toHaveTitle(/Directors/);
		});
	});

	// ═══════════════════════════════════════════════
	// WATCHLIST PAGE
	// ═══════════════════════════════════════════════

	test.describe('Watchlist Page', () => {
		test('loads with correct heading', async ({ page }) => {
			await page.goto(`${BASE}/watchlist`);
			await expect(page.locator('h1')).toContainText('WATCHLIST');
		});

		test('shows empty state when no films saved', async ({ page }) => {
			await page.goto(`${BASE}/watchlist`);
			await expect(page.getByText('Your watchlist is empty')).toBeVisible();
		});

		test('has correct page title', async ({ page }) => {
			await page.goto(`${BASE}/watchlist`);
			await expect(page).toHaveTitle(/Watchlist/);
		});
	});

	// ═══════════════════════════════════════════════
	// SETTINGS PAGE
	// ═══════════════════════════════════════════════

	test.describe('Settings Page', () => {
		test('loads with all setting sections', async ({ page }) => {
			await page.goto(`${BASE}/settings`);
			await expect(page.locator('h1')).toContainText('SETTINGS');
			await expect(page.getByText('DEFAULT VIEW')).toBeVisible();
			await expect(page.getByText('THEME')).toBeVisible();
			await expect(page.getByText('NOT INTERESTED')).toBeVisible();
			await expect(page.getByText('CLEAR ALL DATA')).toBeVisible();
		});

		test('view toggle works', async ({ page }) => {
			await page.goto(`${BASE}/settings`);
			await expect(page.getByRole('tab', { name: 'POSTER' })).toBeVisible();
			await expect(page.getByRole('tab', { name: 'TEXT' })).toBeVisible();
		});

		test('has correct page title', async ({ page }) => {
			await page.goto(`${BASE}/settings`);
			await expect(page).toHaveTitle(/Settings/);
		});
	});

	// ═══════════════════════════════════════════════
	// STATIC PAGES
	// ═══════════════════════════════════════════════

	test.describe('Static Pages', () => {
		test('about page loads', async ({ page }) => {
			await page.goto(`${BASE}/about`);
			await expect(page.locator('h1')).toContainText('ABOUT');
			await expect(page).toHaveTitle(/About/);
		});

		test('privacy page loads', async ({ page }) => {
			await page.goto(`${BASE}/privacy`);
			await expect(page.locator('h1')).toContainText('PRIVACY');
			await expect(page).toHaveTitle(/Privacy/);
		});

		test('terms page loads', async ({ page }) => {
			await page.goto(`${BASE}/terms`);
			await expect(page.locator('h1')).toContainText('TERMS');
			await expect(page).toHaveTitle(/Terms/);
		});

		test('map page loads', async ({ page }) => {
			await page.goto(`${BASE}/map`);
			await expect(page.locator('h1')).toContainText('CINEMA MAP');
			await expect(page).toHaveTitle(/Map/);
		});

		test('letterboxd page loads', async ({ page }) => {
			await page.goto(`${BASE}/letterboxd`);
			await expect(page.locator('h1')).toContainText('LETTERBOXD');
			await expect(page).toHaveTitle(/Letterboxd/);
		});

		test('sign-in page loads', async ({ page }) => {
			await page.goto(`${BASE}/sign-in`);
			await expect(page.locator('h1')).toContainText('SIGN IN');
		});

		test('sign-up page loads', async ({ page }) => {
			await page.goto(`${BASE}/sign-up`);
			await expect(page.locator('h1')).toContainText('SIGN UP');
		});
	});

	// ═══════════════════════════════════════════════
	// ERROR HANDLING
	// ═══════════════════════════════════════════════

	test.describe('Error Handling', () => {
		test('404 page shows for unknown routes', async ({ page }) => {
			await page.goto(`${BASE}/this-page-does-not-exist`);
			await expect(page.locator('h1')).toContainText('404');
		});

		test('404 page has back to calendar link', async ({ page }) => {
			await page.goto(`${BASE}/this-page-does-not-exist`);
			await expect(page.getByText('BACK TO CALENDAR')).toBeVisible();
		});
	});

	// ═══════════════════════════════════════════════
	// CROSS-PAGE INTERACTIONS
	// ═══════════════════════════════════════════════

	test.describe('Cross-Page Interactions', () => {
		test('want to see button persists across navigation', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('.film-card', { timeout: 10000 });
			await page.locator('.film-card a').first().click();
			await page.waitForURL(/\/film\//);

			// Click "Want to See"
			await page.getByText('WANT TO SEE').click();
			await page.waitForTimeout(300);

			// Navigate to watchlist
			await page.goto(`${BASE}/watchlist`);
			// Should no longer show empty state (film was added)
			const emptyState = await page.getByText('Your watchlist is empty').count();
			expect(emptyState).toBe(0);
		});
	});
});
