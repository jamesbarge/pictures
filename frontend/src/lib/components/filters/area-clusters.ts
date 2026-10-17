/**
 * Shared "area cluster" definitions and helpers for filter surfaces.
 *
 * A "cluster" maps an editorial label (e.g. "Soho & West End") onto a set of
 * neighbourhood substrings. A cinema belongs to the cluster if its
 * `address.area` (case-insensitively) contains any of the substrings.
 *
 * Keeping the editorial membership table here prevents chips from silently
 * disagreeing when another filter surface is added.
 */

export interface AreaCluster {
	label: string;
	areas: string[];
}

export interface ClusterableCinema {
	id: string;
	address: { area: string } | null;
}

export const AREA_CLUSTERS: readonly AreaCluster[] = [
	{ label: 'Soho & West End', areas: ['Soho', 'West End', 'Leicester Square', 'Covent Garden', 'Mayfair', 'Bloomsbury'] },
	{ label: 'East',             areas: ['Shoreditch', 'Hackney', 'Dalston', 'Hoxton', 'Bethnal Green', 'Mile End', 'Stratford', 'Whitechapel'] },
	{ label: 'South',            areas: ['Peckham', 'Brixton', 'Clapham', 'Waterloo', 'Southbank', 'South Bank', 'Elephant', 'Bermondsey', 'Camberwell'] },
	{ label: 'North',            areas: ['Camden', 'Islington', 'Angel', 'Kings Cross', 'Crouch End', 'Highgate', 'Archway'] }
];

/**
 * Cinema IDs whose `address.area` matches any neighbourhood in the named
 * cluster. Empty array if the label is unknown — callers tolerate that.
 */
export function cinemasInCluster(label: string, cinemas: ClusterableCinema[]): string[] {
	const cluster = AREA_CLUSTERS.find((c) => c.label === label);
	if (!cluster) return [];
	const ids: string[] = [];
	for (const c of cinemas) {
		const area = (c.address?.area ?? '').toLowerCase();
		if (cluster.areas.some((a) => area.includes(a.toLowerCase()))) ids.push(c.id);
	}
	return ids;
}
