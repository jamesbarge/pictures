import { withClerkHandler } from 'svelte-clerk/server';
import type { Handle } from '@sveltejs/kit';

const clerkHandler = withClerkHandler();

export const handle: Handle = async (input) => {
	// Skip Clerk for API proxy routes — they don't need auth middleware
	if (input.event.url.pathname.startsWith('/api/')) {
		return input.resolve(input.event);
	}

	try {
		const response = await clerkHandler(input);

		// If Clerk redirects to its handshake URL, the host isn't configured.
		// Serve the page without auth instead of following the redirect.
		if (response.status === 307 || response.status === 302) {
			const location = response.headers.get('location') ?? '';
			if (location.includes('clerk.accounts.dev') || location.includes('/v1/client/handshake')) {
				return input.resolve(input.event);
			}
		}

		return response;
	} catch {
		return input.resolve(input.event);
	}
};
