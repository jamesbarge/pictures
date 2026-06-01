import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// loadEnv picks up .env.local so devs can set API_PROXY_TARGET there
	// (point at https://api.pictures.london to use prod data without running
	// the Next.js backend locally).
	const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
	return {
		plugins: [tailwindcss(), sveltekit()],
		ssr: {
			// date-fns must be bundled, not externalized — Vite 7 SSR fails to resolve it otherwise
			noExternal: ['date-fns']
		},
		server: {
			proxy: {
				'/api': {
					target: env.API_PROXY_TARGET ?? 'http://localhost:3000',
					changeOrigin: true
				}
			}
		}
	};
});
