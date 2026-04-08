import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: '.',
	testMatch: ['**/*.spec.ts'],
	timeout: 30000,
	use: {
		baseURL: 'http://localhost:5173',
		headless: true
	},
	projects: [
		{ name: 'chromium', use: { browserName: 'chromium' } },
		{ name: 'mobile-small', use: { ...devices['Galaxy S5'] } },
	]
});
