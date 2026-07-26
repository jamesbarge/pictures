import { defineConfig, devices } from '@playwright/test';
import { BASE, E2E_PORT, isExternalTarget } from './tests/base-url';

// CI drives the built bundle via `vite preview` (E2E_PREVIEW=1): it does no
// on-demand route compilation, so clicks cannot land on not-yet-hydrated DOM.
// Locally we start — or reuse — the dev server the developer already has.
const previewMode = !!process.env.E2E_PREVIEW;

export default defineConfig({
	testDir: '.',
	testMatch: ['**/*.spec.ts'],
	timeout: 30000,
	// Modest parallelism to avoid dev-server + localStorage races seen when
	// all CPU cores hit the server simultaneously. Retries cover any
	// remaining flakes without masking genuine breakage on CI.
	workers: 2,
	retries: 2,
	// A stray `test.only` must never silently shrink the suite in CI.
	forbidOnly: !!process.env.CI,
	// Playwright's CI default is `dot`, which writes no HTML report — the job
	// would upload an empty artifact and a red build would have nothing to
	// triage from. `github` annotates failures inline on the PR diff.
	reporter: process.env.CI
		? [['html', { open: 'never' }], ['github'], ['list']]
		: [['list']],
	use: {
		baseURL: BASE,
		headless: true,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure'
	},
	projects: [
		{ name: 'chromium', use: { browserName: 'chromium' } },
		{ name: 'mobile-small', use: { ...devices['Galaxy S5'] } },
	],
	// Skipped when E2E_BASE_URL points at something we don't own (a preview
	// deployment or production) — there is no local server to manage then.
	webServer: isExternalTarget
		? undefined
		: {
				command: previewMode
					? `npm run preview -- --port ${E2E_PORT} --strictPort`
					: `npm run dev -- --port ${E2E_PORT} --strictPort`,
				url: BASE,
				reuseExistingServer: !process.env.CI,
				timeout: 180_000
			}
});
