<script module lang="ts">
	// Hoisted to module scope: createMarkerElement / createPopupContent run
	// once per cinema, so these constant literal strings were rebuilt on every
	// call. Shared here so the produced DOM is byte-identical to the inline form.
	const MARKER_WIDTH = '20';
	const MARKER_HEIGHT = '26';
	const MARKER_VIEWBOX = '0 0 20 26';
	const MARKER_PATH_D = 'M10 0C4.5 0 0 4.5 0 10C0 17.5 10 26 10 26S20 17.5 20 10C20 4.5 15.5 0 10 0Z';
	const MARKER_PIN_FILL = '#1a1a1a';
	const MARKER_CIRCLE_CX = '10';
	const MARKER_CIRCLE_CY = '10';
	const MARKER_CIRCLE_R = '4';
	const MARKER_CIRCLE_FILL = '#fff';

	const POPUP_DIV_PADDING = '4px';
	const POPUP_LINK_CSS = 'font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#1a1a1a;text-decoration:none';
	const POPUP_AREA_CSS = 'font-size:11px;color:#666;margin-top:2px';
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import type { Cinema } from '$lib/types';

	let { cinemas = [] }: { cinemas: Cinema[] } = $props();

	let mapContainer = $state<HTMLDivElement>();

	function createPopupContent(cinema: Cinema & { coordinates: { lat: number; lng: number } }): HTMLDivElement {
		const div = document.createElement('div');
		div.style.padding = POPUP_DIV_PADDING;

		const link = document.createElement('a');
		link.href = `/cinemas/${cinema.id}`;
		link.textContent = cinema.name;
		link.style.cssText = POPUP_LINK_CSS;
		link.addEventListener('mouseenter', () => { link.style.textDecoration = 'underline'; });
		link.addEventListener('mouseleave', () => { link.style.textDecoration = 'none'; });
		div.appendChild(link);

		if (cinema.address?.area) {
			const area = document.createElement('p');
			area.textContent = cinema.address.area;
			area.style.cssText = POPUP_AREA_CSS;
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
		svg.setAttribute('width', MARKER_WIDTH);
		svg.setAttribute('height', MARKER_HEIGHT);
		svg.setAttribute('viewBox', MARKER_VIEWBOX);

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', MARKER_PATH_D);
		path.setAttribute('fill', MARKER_PIN_FILL);
		svg.appendChild(path);

		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', MARKER_CIRCLE_CX);
		circle.setAttribute('cy', MARKER_CIRCLE_CY);
		circle.setAttribute('r', MARKER_CIRCLE_R);
		circle.setAttribute('fill', MARKER_CIRCLE_FILL);
		svg.appendChild(circle);

		el.appendChild(svg);
		return el;
	}

	onMount(() => {
		if (!browser || !mapContainer) return;

		// Async onMount can't return a cleanup function — Svelte sees the
		// returned `Promise<() => void>` instead of the inner cleanup, so
		// `map.remove()` was never called and every navigation leaked a
		// MapLibre WebGL context. Build the map in a non-async setup() and
		// keep the reference in an outer-scope binding the cleanup can close
		// over once the dynamic import resolves.
		let map: import('maplibre-gl').Map | null = null;
		let cancelled = false;

		(async () => {
			const maplibregl = await import('maplibre-gl');
			await import('maplibre-gl/dist/maplibre-gl.css');
			if (cancelled || !mapContainer) return;

			map = new maplibregl.Map({
				container: mapContainer,
				style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
				center: [-0.118, 51.509],
				zoom: 11
			});

			const cinemasWithCoords = cinemas.filter(
				(c): c is Cinema & { coordinates: { lat: number; lng: number } } =>
					!!c.coordinates?.lat && !!c.coordinates?.lng
			);

			for (const cinema of cinemasWithCoords) {
				const popup = new maplibregl.Popup({ offset: 25 })
					.setDOMContent(createPopupContent(cinema));

				new maplibregl.Marker({ element: createMarkerElement(cinema.name) })
					.setLngLat([cinema.coordinates.lng, cinema.coordinates.lat])
					.setPopup(popup)
					.addTo(map);
			}
		})();

		return () => {
			cancelled = true;
			map?.remove();
			map = null;
		};
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
