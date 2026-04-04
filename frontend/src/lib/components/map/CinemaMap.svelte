<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import type { Cinema } from '$lib/types';

	let { cinemas = [] }: { cinemas: Cinema[] } = $props();

	let mapContainer = $state<HTMLDivElement>();

	const validCinemas = $derived(
		cinemas.filter((c): c is Cinema & { coordinates: { lat: number; lng: number } } =>
			!!c.coordinates?.lat && !!c.coordinates?.lng
		)
	);

	function createPopupContent(cinema: Cinema & { coordinates: { lat: number; lng: number } }): HTMLDivElement {
		const div = document.createElement('div');
		div.style.padding = '4px';

		const link = document.createElement('a');
		link.href = `/cinemas/${cinema.id}`;
		link.textContent = cinema.name;
		link.style.cssText = 'font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#1a1a1a;text-decoration:none';
		link.addEventListener('mouseenter', () => { link.style.textDecoration = 'underline'; });
		link.addEventListener('mouseleave', () => { link.style.textDecoration = 'none'; });
		div.appendChild(link);

		if (cinema.address?.area) {
			const area = document.createElement('p');
			area.textContent = cinema.address.area;
			area.style.cssText = 'font-size:11px;color:#666;margin-top:2px';
			div.appendChild(area);
		}

		return div;
	}

	function createMarkerElement(cinemaName: string): HTMLDivElement {
		const el = document.createElement('div');
		el.className = 'cinema-pin';
		el.style.cursor = 'pointer';
		el.setAttribute('role', 'button');
		el.setAttribute('tabindex', '0');
		el.setAttribute('aria-label', cinemaName);
		el.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				el.click();
			}
		});

		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '20');
		svg.setAttribute('height', '26');
		svg.setAttribute('viewBox', '0 0 20 26');

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M10 0C4.5 0 0 4.5 0 10C0 17.5 10 26 10 26S20 17.5 20 10C20 4.5 15.5 0 10 0Z');
		path.setAttribute('fill', '#1a1a1a');
		svg.appendChild(path);

		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', '10');
		circle.setAttribute('cy', '10');
		circle.setAttribute('r', '4');
		circle.setAttribute('fill', '#fff');
		svg.appendChild(circle);

		el.appendChild(svg);
		return el;
	}

	onMount(async () => {
		if (!browser || !mapContainer) return;

		const maplibregl = await import('maplibre-gl');
		await import('maplibre-gl/dist/maplibre-gl.css');

		const map = new maplibregl.Map({
			container: mapContainer,
			style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
			center: [-0.118, 51.509],
			zoom: 11
		});

		// Filter cinemas directly
		const cinemasWithCoords = cinemas.filter(
			(c): c is Cinema & { coordinates: { lat: number; lng: number } } =>
				!!c.coordinates?.lat && !!c.coordinates?.lng
		);

		// Add markers — try immediately, retry on load if map not ready
		function addMarkers() {
			for (const cinema of cinemasWithCoords) {
				const popup = new maplibregl.Popup({ offset: 25 })
					.setDOMContent(createPopupContent(cinema));

				new maplibregl.Marker({ element: createMarkerElement(cinema.name) })
					.setLngLat([cinema.coordinates.lng, cinema.coordinates.lat])
					.setPopup(popup)
					.addTo(map);
			}
		}

		// Add markers immediately — they work before tiles finish loading
		addMarkers();

		return () => map.remove();
	});
</script>

<div bind:this={mapContainer} class="map-container"></div>

<style>
	.map-container {
		width: 100%;
		height: 100%;
		min-height: 400px;
	}

	:global(.cinema-pin) {
		transition: transform 0.15s ease;
	}

	:global(.cinema-pin:hover) {
		transform: scale(1.2);
	}

	:global(.maplibregl-popup-content) {
		border-radius: 0 !important;
		box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
	}
</style>
