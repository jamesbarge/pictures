import { redirect } from '@sveltejs/kit';

// Sign-up is temporarily removed from the site (see sign-in/[...rest]/+page.ts).
// Redirect any direct navigation home until auth is re-enabled. Revert = delete.
export const load = () => {
	redirect(307, '/');
};
