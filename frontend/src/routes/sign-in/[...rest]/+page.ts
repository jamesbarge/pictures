import { redirect } from '@sveltejs/kit';

// Sign-in is temporarily removed from the site (the prod Clerk key is a dev
// `pk_test_` key, so the hosted SignIn widget renders blank). Redirect any
// direct navigation home until auth is re-enabled. Reverting = delete this file.
export const load = () => {
	redirect(307, '/');
};
