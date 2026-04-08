import { getLayoutCinemas } from '$lib/server/repositories';

export async function load() {
	const cinemas = await getLayoutCinemas();
	return { cinemas };
}
