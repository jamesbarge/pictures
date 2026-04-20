import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: '.',
	testMatch: ['**/*.spec.ts'],
	timeout: 30000,
	// Modest parallelism to avoid dev-server + localStorage races seen when
	// all CPU cores hit `localhost:5173` simultaneously. Retries cover any
	// remaining flakes without masking genuine breakage on CI.
	workers: 2,
	retries: 2,
	use: {
		baseURL: 'http://localhost:5173',
		headless: true
	},
	projects: [
		{ name: 'chromium', use: { browserName: 'chromium' } },
		{ name: 'mobile-small', use: { ...devices['Galaxy S5'] } },
	]
});
