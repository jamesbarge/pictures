import { test, expect, type Locator, type Page } from '@playwright/test';

import { BASE, dismissConsent } from './tests/base-url';

// Turn a sidebar control on: a Programme or View radio (`aria-checked`) or a
// toggle chip (`aria-pressed`). Handlers are wired only after hydration, so a
// click that lands first is silently dropped; re-click until the state flips.
// Never re-clicks once on, because the Day pills and chips toggle back off.
async function switchOn(control: Locator, attr: 'aria-checked' | 'aria-pressed') {
	await expect(async () => {
		if ((await control.getAttribute(attr)) !== 'true') await control.click();
		await expect(control).toHaveAttribute(attr, 'true', { timeout: 1000 });
	}).toPass({ timeout: 8000 });
}

const programme = (page: Page) => page.getByRole('radiogroup', { name: 'Programme' });
// Radio names carry the live count ("Rep 214"), so match the label prefix.
const programmeRadio = (page: Page, label: 'All' | 'New' | 'Rep') =>
	programme(page).getByRole('radio', { name: new RegExp(`^${label}`) });
const textView = (page: Page) => page.getByRole('radio', { name: 'Text view', exact: true });

// This spec covers desktop-first UX — force a desktop viewport so the open
// sidebar (filters beside the poster card grid) is the one being asserted
// regardless of which project runs the file (e.g. the mobile-small device
// project).
test.use({ viewport: { width: 1440, height: 900 } });

// Dismiss cookie consent before every test so assertions aren't blocked by
// the pretext banner. Use addInitScript (runs on every navigation) so reloads
// don't re-trigger it.
test.beforeEach(({ context }) => dismissConsent(context));

test.describe('Pictures London — SvelteKit Frontend', () => {

	// ═══════════════════════════════════════════════
	// HOMEPAGE (sidebar filters + poster cards)
	// ═══════════════════════════════════════════════

	test.describe('Homepage', () => {
		test('loads and shows film cards with real data', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			const cards = await page.locator('article.card').count();
			expect(cards).toBeGreaterThan(0);
			const firstTitle = await page.locator('article.card h3.title').first().textContent();
			expect(firstTitle).toBeTruthy();
			expect(firstTitle!.length).toBeGreaterThan(0);
			await expect(page).toHaveTitle('pictures · london');
		});

		test('shows day header band with weekday + ordinal', async ({ page }) => {
			await page.goto(BASE);
			// Redesign: each `<section class="day">` carries a dark `.day-header`
			// band whose <h2> reads "TODAY" for the first group or
			// "WEEKDAY THE ORDINAL OF MONTH" for subsequent ones. The first group
			// is always today, so assert the band exists and reads TODAY (or, if
			// the data ever lacks a today group, a weekday string).
			const heading = page.locator('section.day .day-header h2').first();
			await expect(heading).toBeVisible();
			const text = (await heading.textContent())?.toLowerCase() ?? '';
			expect(text).toMatch(/today|monday|tuesday|wednesday|thursday|friday|saturday|sunday/);
		});

		test('shows the Day pills with Today', async ({ page }) => {
			await page.goto(BASE);
			// The sidebar's "Day" group (Today / Tomorrow / This week + calendar).
			const days = page.getByRole('group', { name: 'Day' });
			await expect(days.getByRole('button', { name: 'Today', exact: true })).toBeVisible();
		});

		test('listings default to a rolling multi-day window from today onwards', async ({ page }) => {
			// Contract since the multi-day rolling-calendar change: the homepage
			// shows today + the next few days (until ~24 films are visible), each
			// in its own `<section class="day">` with a day-header band. The
			// lock-in invariant is that NO visible screening can resolve to a
			// London date < today — a leaked past screening or a UTC-vs-London
			// comparison bug would produce a `datetime` that resolves to a London
			// date strictly before today. In the redesign each screening is a
			// `<time class="screening-time" datetime>` inside the poster card.
			const londonDate = (iso: string) =>
				new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
			const today = londonDate(new Date().toISOString());

			await page.goto(BASE);
			await page.waitForSelector('section.day .screening-time', { timeout: 10000 });

			const collectDates = async () => {
				const times = page.locator('section.day .screening-time');
				const n = await times.count();
				const out: string[] = [];
				for (let i = 0; i < n; i++) {
					const dt = await times.nth(i).getAttribute('datetime');
					if (dt) out.push(dt);
				}
				return out;
			};

			const initial = await collectDates();
			expect(initial.length, 'expected at least one screening on the homepage').toBeGreaterThan(0);
			const beforeToday = initial.filter((d) => londonDate(d) < today);
			expect(
				beforeToday,
				`expected no screening before ${today} (London); ${beforeToday.length} leaked: ${beforeToday.slice(0, 3).join(', ')}`
			).toEqual([]);

			// Press the sidebar's Tomorrow pill — the rolling window now anchors to
			// tomorrow only. Every visible screening must resolve to a London
			// date > today (no past leakage).
			await switchOn(
				page.getByRole('group', { name: 'Day' }).getByRole('button', { name: 'Tomorrow', exact: true }),
				'aria-pressed'
			);
			await page.waitForTimeout(400);
			const after = await collectDates();
			if (after.length > 0) {
				const dates = after.map(londonDate);
				const earliest = [...dates].sort()[0];
				expect(
					earliest > today,
					`after selecting Tomorrow, earliest visible date should be > today (${today}), got ${earliest}`
				).toBe(true);
			}
		});

		test('custom-date control opens the calendar popover', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			// The calendar button at the end of the Day pills opens the month grid
			// in a "Pick a date" dialog. Re-click until it opens: a click before
			// hydration is dropped.
			const picker = page.getByRole('dialog', { name: 'Pick a date' });
			await expect(async () => {
				if (!(await picker.isVisible())) await page.getByRole('button', { name: 'Pick a date' }).click();
				await expect(picker).toBeVisible({ timeout: 1000 });
			}).toPass({ timeout: 8000 });
			await expect(picker.locator('.cal-grid')).toBeVisible();
			await expect(picker.getByRole('button', { name: 'Previous month' })).toBeVisible();
		});

		test('clicking the sidebar logo navigates home', async ({ page }) => {
			// The logo at the top of the sidebar is the home affordance. Verify it
			// carries the home a11y label and routes home from another page.
			await page.goto(`${BASE}/about`);
			const home = page.getByRole('link', { name: 'pictures london, what’s on' });
			await expect(home).toBeVisible();
			await home.click();
			await expect(page).toHaveURL(BASE + '/');
		});

		test('sidebar exposes the filter controls', async ({ page }) => {
			await page.goto(BASE);
			// Every homepage filter lives in the sidebar, open beside the grid at
			// desktop width. Assert its accessible shape: search, programme, day
			// pills, the filter sections and the view switch.
			const sidebar = page.getByRole('complementary', { name: 'Menu and filters' });
			await expect(sidebar).toBeVisible();
			await expect(
				sidebar.getByRole('searchbox', { name: 'Search films, cinemas and directors' })
			).toBeVisible();
			await expect(sidebar.getByRole('radiogroup', { name: 'Programme' })).toBeVisible();
			await expect(sidebar.getByRole('group', { name: 'Day' })).toBeVisible();
			for (const name of ['Time of day', 'Where', 'Format', 'Genre', 'Era']) {
				await expect(sidebar.getByRole('region', { name, exact: true })).toBeVisible();
			}
			await expect(sidebar.getByRole('radiogroup', { name: 'View' })).toBeVisible();
		});

		test('ALL / NEW / REP programme radios visible', async ({ page }) => {
			await page.goto(BASE);
			for (const label of ['All', 'New', 'Rep'] as const) {
				await expect(programmeRadio(page, label)).toBeVisible();
			}
		});

		test('REP filters to repertory-only films', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });

			const titles = () => page.locator('article.card h3.title').allTextContents();

			// NOTE: a raw count comparison (rep <= all) no longer holds. The
			// homepage shows a rolling window capped by MIN_FILMS_VISIBLE /
			// MAX_DAYS_VISIBLE, so a filtered view that spreads thinner across
			// days can surface MORE total cards than the unfiltered cap admits.
			// The windowing-independent invariant is that REP and NEW partition
			// the catalogue: a repertory film is never a new release, so the two
			// filtered title sets must be disjoint.
			await switchOn(programmeRadio(page, 'Rep'), 'aria-checked');
			await page.waitForTimeout(500);
			const repTitles = await titles();
			expect(repTitles.length).toBeGreaterThan(0);

			await switchOn(programmeRadio(page, 'New'), 'aria-checked');
			await page.waitForTimeout(500);
			const newTitles = new Set(await titles());

			const overlap = repTitles.filter((t) => newTitles.has(t));
			expect(
				overlap,
				`expected REP and NEW film sets to be disjoint; overlap: ${overlap.slice(0, 3).join(', ')}`
			).toEqual([]);
		});

		test('persisted New filter renders matching posters and titles', async ({ page, context }) => {
			// Regression for fix/poster-title-mismatch: persisted filter loaded
			// at module init produced a SSR/CSR hydration mismatch where titles
			// updated to the new film set but <img src> attributes stayed bound
			// to the SSR'd "All" view's films. This test loads the page with a
			// New filter persisted in localStorage and confirms each card's
			// poster URL matches the title set produced by picking New.

			const readPairs = () =>
				page.evaluate(() =>
					Array.from(document.querySelectorAll('article.card')).slice(0, 5).map((c) => ({
						title: c.querySelector('h3.title')?.textContent?.trim() ?? '',
						imgSrc: (c.querySelector('img') as HTMLImageElement | null)?.src ?? ''
					}))
				);

			// Capture title→poster pairs from picking New on a fresh page.
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await switchOn(programmeRadio(page, 'New'), 'aria-checked');
			await page.waitForTimeout(800);
			const expected = await readPairs();
			expect(expected.length).toBe(5);
			// Sanity: each title shows one poster (catches obvious render glitches).
			// Titles can repeat: late in the evening today has fewer than five New
			// films, so the first five cards run on into tomorrow's section.
			const posterByTitle = new Map<string, string>();
			for (const { title, imgSrc } of expected) {
				expect(posterByTitle.get(title) ?? imgSrc, `"${title}" shows two posters`).toBe(imgSrc);
				posterByTitle.set(title, imgSrc);
			}

			// Persist the New filter, reload, and verify the same pairings appear.
			await context.addInitScript(() => {
				try {
					localStorage.setItem(
						'pictures-filters',
						JSON.stringify({
							cinemaIds: [],
							formats: [],
							programmingTypes: ['new_release'],
							genres: [],
							decades: []
						})
					);
				} catch { /* ignore */ }
			});
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await expect(programmeRadio(page, 'New')).toHaveAttribute('aria-checked', 'true');
			// Poll for the deferred persisted-state apply to settle.
			await expect.poll(readPairs, { timeout: 5000 }).toEqual(expected);
		});

		test('WHERE cinema filter narrows results', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			const allCount = await page.locator('article.card').count();
			// The sidebar's Where section finds a cinema by name and selects it.
			// Re-fill until results show: input before hydration never reaches
			// the bound state.
			const where = page.getByRole('region', { name: 'Where', exact: true });
			const results = where.locator('.results .chip');
			await expect(async () => {
				await where.getByRole('searchbox', { name: 'Search cinemas or areas' }).fill('Curzon');
				await expect(results.first()).toBeVisible({ timeout: 1000 });
			}).toPass({ timeout: 8000 });
			await switchOn(results.first(), 'aria-pressed');
			await page.waitForTimeout(500);
			const filteredCount = await page.locator('article.card').count();
			// Skip the assertion when the data can't actually exhibit narrowing —
			// the chosen cinema has no visible films (filteredCount=0) or every
			// visible film already plays there (filteredCount=allCount). Both
			// legitimately occur at sparse-data hours and aren't a filter bug.
			test.skip(
				filteredCount === 0 || filteredCount === allCount,
				`cannot test narrowing: filtered ${filteredCount} of ${allCount} after selecting a cinema`
			);
			expect(filteredCount).toBeLessThan(allCount);
			expect(filteredCount).toBeGreaterThan(0);
		});

		test('FORMAT filter (35mm) reduces displayed films', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			// Skip when no 35mm films are currently visible — the filter can't
			// narrow what isn't there. The poster card's format rail exposes the
			// format as "35MM" (uppercase).
			const hasAny35mm =
				(await page.locator('article.card').filter({ hasText: '35MM' }).count()) > 0;
			test.skip(!hasAny35mm, 'no 35mm films currently visible on homepage');
			const allCount = await page.locator('article.card').count();
			await switchOn(
				page
					.getByRole('region', { name: 'Format', exact: true })
					.getByRole('button', { name: '35MM', exact: true }),
				'aria-pressed'
			);
			await page.waitForTimeout(500);
			const filteredCount = await page.locator('article.card').count();
			expect(filteredCount).toBeLessThan(allCount);
		});

		test('search matches film titles', async ({ page }, testInfo) => {
			// Unlike the desktop-sidebar tests above, exercise this input at the
			// mobile project's real viewport (the top bar's search) as well as the
			// desktop viewport (the sidebar's).
			if (testInfo.project.use.viewport) await page.setViewportSize(testInfo.project.use.viewport);
			await page.goto(BASE);
			const cards = page.getByRole('article');
			await expect(cards.first()).toBeVisible();
			const title = await cards.first().getAttribute('aria-label');
			expect(title, 'a loaded film provides the positive search case').toBeTruthy();
			const matchingFilm = page.getByRole('article', { name: title!, exact: true }).first();
			const search = page.getByRole('searchbox', { name: 'Search films, cinemas and directors' });
			const noMatch = '__pictures_e2e_nonexistent_film__';

			// Filtering can ADD visible cards: the rolling calendar includes more
			// whole days until it reaches its minimum-card target. Check search
			// semantics instead of comparing counts across different date windows.
			// First prove filtering runs (a no-op search must fail this assertion).
			await expect(async () => {
				await search.fill(noMatch);
				await expect(cards).toHaveCount(0, { timeout: 1000 });
			}).toPass({ timeout: 8000 });
			await expect(page.getByRole('heading', { name: 'No screenings found', exact: true })).toBeVisible();

			// An always-empty search must fail here. Use a real loaded title so
			// the assertion does not depend on a particular film being programmed.
			await search.fill(title!.toLowerCase());
			await expect(matchingFilm).toBeVisible();
			// Clear from an empty result set: the positive result already being
			// visible would not prove that clearing actually restores anything.
			await search.fill(noMatch);
			await expect(cards).toHaveCount(0);
			await search.fill('');
			await expect(search).toHaveValue('');
			await expect(matchingFilm).toBeVisible();
		});

		test('search matches cinema names', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			// Skip when today has no Prince Charles films at all — the test
			// asserts that search FINDS them, not that PCC always has films
			// today. Late evening / quiet days legitimately have zero PCC
			// screenings remaining.
			const baselinePcc = await page
				.locator('article.card')
				.filter({ hasText: /Prince Charles/i })
				.count();
			test.skip(baselinePcc === 0, 'no Prince Charles films on homepage right now');
			await page.getByRole('searchbox', { name: 'Search films, cinemas and directors' }).fill('Prince Charles');
			await page.waitForTimeout(400);
			// Every visible card should have at least one Prince Charles screening
			const count = await page.locator('article.card').count();
			expect(count).toBeGreaterThan(0);
			const visibleText = await page.locator('.page-chrome').textContent();
			expect(visibleText?.toLowerCase()).toContain('prince charles');
		});

		test('display-mode toggle switches between posters and text', async ({ page }) => {
			// The sidebar's "View" radiogroup owns the poster/text switch. Poster
			// view renders poster cards, Text view renders the screenings table.
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await switchOn(textView(page), 'aria-checked');
			await expect(page.getByRole('table', { name: 'Screenings list' }).first()).toBeVisible();
			await expect(page.locator('article.card')).toHaveCount(0);
			await switchOn(page.getByRole('radio', { name: 'Poster view', exact: true }), 'aria-checked');
			await expect(page.locator('article.card').first()).toBeVisible();
		});

		test('sidebar More nav carries About, Privacy and Terms', async ({ page }) => {
			// The footer's links moved to the foot of the sidebar.
			await page.goto(BASE);
			const more = page.getByRole('navigation', { name: 'More' });
			for (const name of ['About', 'Privacy', 'Terms']) {
				await expect(more.getByRole('link', { name, exact: true })).toBeVisible();
			}
		});
	});

	// ═══════════════════════════════════════════════
	// NAVIGATION
	// ═══════════════════════════════════════════════

	test.describe('Navigation', () => {
		test('sidebar nav links are visible at desktop width', async ({ page }) => {
			await page.goto(BASE);
			const nav = page.getByRole('navigation', { name: 'Main' });
			for (const name of ['What’s on', 'Cinemas', 'Reachable', 'Watchlist']) {
				await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
			}
			await expect(nav.getByRole('link', { name: 'What’s on' })).toHaveAttribute('aria-current', 'page');
		});

		test('sidebar about link navigates to about page', async ({ page }) => {
			await page.goto(BASE);
			await page.getByRole('navigation', { name: 'More' }).getByRole('link', { name: 'About' }).click();
			await expect(page).toHaveURL(`${BASE}/about`);
		});

		test('sidebar collapses to the burger, and the choice survives a reload', async ({ page }) => {
			// At desktop width the sidebar sits beside the page; Hide menu folds it
			// into the top bar's burger and stores the choice in
			// `pictures-sidebar-collapsed`. Focus follows to the counterpart control.
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			const sidebar = page.getByRole('complementary', { name: 'Menu and filters' });
			const hide = page.getByRole('button', { name: 'Hide menu' });
			const burger = page.getByRole('button', { name: /^Open menu/ });
			const stored = () => page.evaluate(() => localStorage.getItem('pictures-sidebar-collapsed'));
			await expect(sidebar).toBeVisible();
			await expect(burger).toBeHidden();

			// Retry: a click before hydration is dropped.
			await expect(async () => {
				if (await hide.isVisible()) await hide.click();
				await expect(sidebar).toBeHidden({ timeout: 1000 });
			}).toPass({ timeout: 8000 });
			await expect(burger).toBeVisible();
			await expect(burger).toBeFocused();
			expect(await stored()).toBe('1');

			await page.reload();
			await page.waitForSelector('article.card', { timeout: 10000 });
			await expect(sidebar).toBeHidden();
			await expect(burger).toBeVisible();

			await expect(async () => {
				if (await burger.isVisible()) await burger.click();
				await expect(sidebar).toBeVisible({ timeout: 1000 });
			}).toPass({ timeout: 8000 });
			await expect(hide).toBeFocused();
			expect(await stored()).toBe('0');

			await page.reload();
			await page.waitForSelector('article.card', { timeout: 10000 });
			await expect(sidebar).toBeVisible();
			await expect(burger).toBeHidden();
		});
	});

	// ═══════════════════════════════════════════════
	// FILM DETAIL PAGE (V2a literary hero)
	// ═══════════════════════════════════════════════

	test.describe('Film Detail Page', () => {
		test('navigating to a film shows detail page with title', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);
			const title = await page.locator('h1.film-title').textContent();
			expect(title).toBeTruthy();
			expect(title!.length).toBeGreaterThan(0);
		});

		test('shows metadata line (runtime · country · rating · genres)', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);
			// New literary hero renders `.meta` inside `.info-col`
			await expect(page.locator('.info-col .meta').first()).toBeVisible();
		});

		test('shows Showings heading', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);
			await expect(page.getByRole('heading', { name: /howings/ }).first()).toBeVisible();
		});

		test('shows Want to see / Not interested status buttons', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);
			await expect(page.getByText('Want to see')).toBeVisible();
			await expect(page.getByText('Not interested')).toBeVisible();
			// "Seen" toggle should NOT be present
			const seenButtons = await page.getByText(/^SEEN$/).count();
			expect(seenButtons).toBe(0);
		});

		test('shows external links (at least one of TMDB / IMDb / Letterboxd)', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);
			const extLinks = await page.locator('.ext').count();
			expect(extLinks).toBeGreaterThan(0);
		});

		test('shows bookable screening rows in the Showings section', async ({ page }) => {
			// The redesign removed the per-screening iCal download button
			// (`/api/calendar?screening=`). The Showings section now exposes each
			// screening as a `.screening-link` row that deep-links to the cinema's
			// own booking page — the new per-screening actionable affordance.
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);
			const rows = page.locator('.screening-link');
			await expect(rows.first()).toBeVisible();
			expect(await rows.count()).toBeGreaterThan(0);
			const href = await rows.first().getAttribute('href');
			expect(href).toBeTruthy();
			expect(href).toMatch(/^https?:\/\//);
		});

		test('Pick date button on detail opens calendar popover', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);
			await expect(page).toHaveTitle(/— pictures · london/);
			const pick = page.getByRole('button', { name: /Pick date/ });
			if (await pick.count() === 0) test.skip();
			await pick.first().click();
			await expect(page.getByRole('dialog', { name: 'Pick a date' }).first()).toBeVisible();
		});
	});

	// ═══════════════════════════════════════════════
	// TONIGHT PAGE
	// ═══════════════════════════════════════════════

	test.describe('Tonight Page', () => {
		test('loads with correct heading', async ({ page }) => {
			await page.goto(`${BASE}/tonight`);
			await expect(page.locator('h1')).toContainText('TONIGHT');
			await expect(page).toHaveTitle(/Tonight/);
		});
	});

	// ═══════════════════════════════════════════════
	// CINEMAS PAGE
	// ═══════════════════════════════════════════════

	test.describe('Cinemas Page', () => {
		test('loads cinema list with cards', async ({ page }) => {
			await page.goto(`${BASE}/cinemas`);
			await expect(page.locator('h1')).toContainText('CINEMAS');
			await expect(page).toHaveTitle(/Cinemas/);
			const cards = await page.locator('.cinema-card').count();
			expect(cards).toBeGreaterThan(0);
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
	});

	// ═══════════════════════════════════════════════
	// DIRECTORS PAGE
	// ═══════════════════════════════════════════════

	test.describe('Directors Page', () => {
		test('loads directors list', async ({ page }) => {
			await page.goto(`${BASE}/directors`);
			await expect(page.locator('h1')).toContainText('DIRECTORS');
			await expect(page).toHaveTitle(/Directors/);
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
	});

	// ═══════════════════════════════════════════════
	// WATCHLIST PAGE
	// ═══════════════════════════════════════════════

	test.describe('Watchlist Page', () => {
		test('loads with correct heading', async ({ page }) => {
			await page.goto(`${BASE}/watchlist`);
			await expect(page.locator('h1')).toContainText('WATCHLIST');
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
			await expect(page).toHaveTitle(/Settings/);
			await expect(page.getByText('DEFAULT VIEW')).toBeVisible();
			await expect(page.getByText('CLEAR ALL DATA')).toBeVisible();
		});

		test('view toggle works', async ({ page }) => {
			await page.goto(`${BASE}/settings`);
			await expect(page.getByRole('tab', { name: 'POSTER' })).toBeVisible();
			await expect(page.getByRole('tab', { name: 'TEXT' })).toBeVisible();
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
	});

	// ═══════════════════════════════════════════════
	// ERROR HANDLING
	// ═══════════════════════════════════════════════

	test.describe('Error Handling', () => {
		test('404 page shows for unknown routes with a back to calendar link', async ({ page }) => {
			await page.goto(`${BASE}/this-page-does-not-exist`);
			await expect(page.locator('h1')).toContainText('404');
			await expect(page.getByText('BACK TO CALENDAR')).toBeVisible();
		});
	});

	// ═══════════════════════════════════════════════
	// CROSS-PAGE INTERACTIONS
	// ═══════════════════════════════════════════════

	test.describe('Cross-Page Interactions', () => {
		test('Want to see button persists across navigation', async ({ page }) => {
			await page.goto(BASE);
			await page.waitForSelector('article.card', { timeout: 10000 });
			await page.locator('article.card a').first().click();
			await page.waitForURL(/\/film\//);

			await page.getByRole('button', { name: 'Want to see' }).click();
			await page.waitForTimeout(300);

			await page.goto(`${BASE}/watchlist`);
			const emptyState = await page.getByText('Your watchlist is empty').count();
			expect(emptyState).toBe(0);
		});
	});

	// ═══════════════════════════════════════════════
	// SEARCH RESULTS PAGE
	// ═══════════════════════════════════════════════

	test.describe('Search Results Page', () => {
		test('loads with query parameter and shows results', async ({ page }) => {
			await page.goto(`${BASE}/search?q=godfather`);
			await page.waitForTimeout(2000);
			const title = await page.locator('h1').textContent();
			expect(title?.toUpperCase()).toContain('GODFATHER');
		});

		test('shows empty state for no-match query', async ({ page }) => {
			await page.goto(`${BASE}/search?q=zzzzzznonexistent`);
			await page.waitForTimeout(2000);
			await expect(page.getByText('No results')).toBeVisible();
		});

		test('shows empty state when no query', async ({ page }) => {
			await page.goto(`${BASE}/search`);
			await expect(page.getByText('Search for films')).toBeVisible();
		});
	});

	// ═══════════════════════════════════════════════
	// LETTERBOXD IMPORT PAGE
	// ═══════════════════════════════════════════════

	test.describe('Letterboxd Import Page', () => {
		test('shows username input form', async ({ page }) => {
			await page.goto(`${BASE}/letterboxd`);
			await expect(page.getByPlaceholder('your-username')).toBeVisible();
			await expect(page.getByRole('button', { name: 'IMPORT' })).toBeVisible();
		});

		test('import button is disabled when input is empty', async ({ page }) => {
			await page.goto(`${BASE}/letterboxd`);
			const btn = page.getByRole('button', { name: 'IMPORT' });
			await expect(btn).toBeDisabled();
		});
	});

	// ═══════════════════════════════════════════════
	// CINEMA MAP PAGE
	// ═══════════════════════════════════════════════

	test.describe('Cinema Map Page', () => {
		test('shows venue count', async ({ page }) => {
			await page.goto(`${BASE}/map`);
			await expect(page.getByText(/\d+ VENUES/)).toBeVisible();
		});
	});

	// ═══════════════════════════════════════════════
	// FESTIVALS PAGE
	// ═══════════════════════════════════════════════

	test.describe('Festivals Page', () => {
		test('loads and shows festival names', async ({ page }) => {
			await page.goto(`${BASE}/festivals`);
			await expect(page.getByText('FESTIVALS')).toBeVisible();
			const links = await page.locator('a[href^="/festivals/"]').count();
			expect(links).toBeGreaterThan(0);
		});
	});

	// ═══════════════════════════════════════════════
	// THE SLEEPER
	// ═══════════════════════════════════════════════
	//
	// These assert INVARIANTS rather than a specific film, because the pick
	// cannot be mocked from here: /api/screenings and /api/sleepers are fetched
	// by the SvelteKit *server* load, so `page.route()` never fires. The
	// selection rule itself is pinned by unit tests in src/lib/sleeper.test.ts.

	test.describe('The Sleeper', () => {
		test('marks at most one film, and only in the first day section', async ({ page }) => {
			await page.goto(BASE);
			await page.locator('section.day .film-row article.card').first().waitFor({ timeout: 15000 });

			// "One pick per day" plus "today only" collapses to: at most one on the page.
			expect(await page.locator('article.card .rail-sleeper').count()).toBeLessThanOrEqual(1);

			const days = page.locator('section.day');
			for (let i = 1; i < (await days.count()); i++) {
				expect(await days.nth(i).locator('.rail-sleeper').count()).toBe(0);
			}
		});

		test('never leaks a rating numeral', async ({ page }) => {
			// Ratings are deliberately spoiler-gated product-wide (see
			// LetterboxdRatingReveal.svelte). The marker must not undo that, in
			// its visible text OR its accessible name.
			await page.goto(BASE);
			await page.locator('section.day .film-row article.card').first().waitFor({ timeout: 15000 });

			for (const t of await page.locator('.rail-sleeper').allTextContents()) {
				expect(t).not.toMatch(/\d/);
			}
			const labels = await page
				.locator('article.card:has(.rail-sleeper)')
				.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
			for (const label of labels) {
				expect(label).toMatch(/Sleeper/);
				expect(label).not.toMatch(/\d/);
			}
		});

		test('consumes only rail slack, leaving the card grid undisturbed', async ({ page }) => {
			await page.goto(BASE);
			await page.locator('section.day .film-row article.card').first().waitFor({ timeout: 15000 });

			const card = page.locator('article.card:has(.rail-sleeper)').first();
			test.skip((await card.count()) === 0, 'no sleeper pick in the current window');

			// The card module width must be untouched, or fitToFirstRow's day-bar
			// alignment measurement changes.
			expect(Math.round((await card.boundingBox())!.width)).toBe(328);

			const marker = card.locator('.rail-sleeper');
			await expect(marker).toContainText('THE SLEEPER');
			const mb = (await marker.boundingBox())!;
			expect(mb.width).toBeLessThanOrEqual(65);

			// Bottom-anchored: flush with the poster's bottom edge.
			const pb = (await card.locator('.poster').boundingBox())!;
			expect(Math.abs(mb.y + mb.height - (pb.y + pb.height))).toBeLessThanOrEqual(2);
		});

		test('the day bar still aligns with the first card row', async ({ page }) => {
			// Direct regression guard on the fitToFirstRow contract.
			await page.goto(BASE);
			await page.locator('section.day .film-row article.card').first().waitFor({ timeout: 15000 });

			const section = page.locator('section.day:has(.rail-sleeper)').first();
			test.skip((await section.count()) === 0, 'no sleeper pick in the current window');

			const hb = (await section.locator('.day-header').boundingBox())!;
			const boxes = await section
				.locator('.film-row > article.card')
				.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
			const top = Math.min(...boxes.map((b) => b.top));
			const firstRowRight = Math.max(
				...boxes.filter((b) => Math.abs(b.top - top) < 2).map((b) => b.right)
			);
			expect(Math.abs(hb.x + hb.width - firstRowRight)).toBeLessThanOrEqual(2);
		});

		test('survives the switch to TEXT display mode', async ({ page }) => {
			await page.goto(BASE);
			await page.locator('section.day .film-row article.card').first().waitFor({ timeout: 15000 });
			test.skip(
				(await page.locator('.rail-sleeper').count()) === 0,
				'no sleeper pick in the current window'
			);

			// The radio's onclick is wired only after hydration, so a single early
			// click is silently dropped — the race `switchOn` absorbs at the top
			// of this file.
			const tables = page.getByRole('table', { name: 'Screenings list' });
			await switchOn(textView(page), 'aria-checked');
			await expect(tables.first()).toBeVisible();

			// One chip per day at most — never once per screening of the same film.
			for (let i = 0; i < (await tables.count()); i++) {
				expect(await tables.nth(i).locator('.sleeper-tag').count()).toBeLessThanOrEqual(1);
			}
		});
	});
});
