import { redirect } from '@sveltejs/kit';

// There is no auth on pictures.london — Clerk was removed entirely (0 identified
// users in 90 days, while its ~420KB eager bundle and a stale `pk_test_` dev key
// caused ~68% of all client exceptions). The route is retained purely so existing
// links and bookmarks redirect home instead of 404ing.
export const load = () => {
	redirect(307, '/');
};
