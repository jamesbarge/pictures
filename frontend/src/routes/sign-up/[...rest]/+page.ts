import { redirect } from '@sveltejs/kit';

// There is no auth on pictures.london — see sign-in/[...rest]/+page.ts. The route
// is retained purely so existing links and bookmarks redirect home instead of 404ing.
export const load = () => {
	redirect(307, '/');
};
