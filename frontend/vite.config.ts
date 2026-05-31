import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	build: {
		rollupOptions: {
			output: {
				// Narrowly pin bits-ui into its own vendor chunk so it stays in the
				// lazy command-palette async chunk and can never be hoisted back into
				// the entry/layout chunk by a future static import. Scoped to bits-ui
				// only — broad node_modules grouping would de-optimise SvelteKit's
				// per-route splitting and the lazy maplibre/posthog chunks.
				manualChunks(id) {
					if (id.includes('node_modules/bits-ui')) {
						return 'vendor-bits-ui';
					}
				}
			}
		}
	},
	server: {
		proxy: {
			'/api': {
				target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
				changeOrigin: true
			}
		}
	}
});
