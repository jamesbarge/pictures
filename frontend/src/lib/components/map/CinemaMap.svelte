<script lang="ts">
	import { MapLibre, Marker, Popup } from 'svelte-maplibre';
	import type { Cinema } from '$lib/types';
	import 'maplibre-gl/dist/maplibre-gl.css';

	let { cinemas = [] }: { cinemas: Cinema[] } = $props();

	const validCinemas = $derived(
		cinemas.filter((c): c is Cinema & { coordinates: { lat: number; lng: number } } =>
			!!c.coordinates?.lat && !!c.coordinates?.lng && c.isActive
		)
	);

	// London center
	const center = { lng: -0.118, lat: 51.509 };

	// Free tile style
	const styleUrl = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
</script>

<div class="map-container">
	<MapLibre
		style={styleUrl}
		center={[center.lng, center.lat]}
		zoom={11}
		class="w-full h-full"
	>
		{#each validCinemas as cinema (cinema.id)}
			<Marker lngLat={[cinema.coordinates.lng, cinema.coordinates.lat]}>
				<div class="marker" title={cinema.name}>
					<svg width="20" height="26" viewBox="0 0 20 26" fill="none">
						<path d="M10 0C4.5 0 0 4.5 0 10C0 17.5 10 26 10 26S20 17.5 20 10C20 4.5 15.5 0 10 0Z" fill="var(--color-screening-bg, #1a1a1a)"/>
						<circle cx="10" cy="10" r="4" fill="var(--color-screening-text, #fff)"/>
					</svg>
				</div>
				<Popup offset={[0, -24]}>
					<div class="popup-content">
						<a href="/cinemas/{cinema.id}" class="popup-name">{cinema.name}</a>
						{#if cinema.address?.area}
							<p class="popup-area">{cinema.address.area}</p>
						{/if}
						{#if cinema.features.length > 0}
							<p class="popup-features">{cinema.features.slice(0, 3).join(' · ').toUpperCase()}</p>
						{/if}
					</div>
				</Popup>
			</Marker>
		{/each}
	</MapLibre>
</div>

<style>
	.map-container {
		width: 100%;
		height: 100%;
		min-height: 400px;
	}

	.map-container :global(.maplibregl-map) {
		width: 100%;
		height: 100%;
	}

	.marker {
		cursor: pointer;
		transition: transform var(--duration-fast) var(--ease-sharp);
	}

	.marker:hover {
		transform: scale(1.2);
	}

	.popup-content {
		padding: 0.25rem;
	}

	.popup-name {
		font-size: 13px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #1a1a1a;
		text-decoration: none;
	}

	.popup-name:hover {
		text-decoration: underline;
	}

	.popup-area {
		font-size: 11px;
		color: #666;
		margin-top: 2px;
	}

	.popup-features {
		font-size: 10px;
		font-family: var(--font-mono, monospace);
		color: #999;
		letter-spacing: 0.04em;
		margin-top: 4px;
	}
</style>
