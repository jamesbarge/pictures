/**
 * Core Web Vitals → PostHog
 *
 * Reports field-data LCP / INP / CLS / TTFB / FCP via the official `web-vitals`
 * package, tagged with route, viewport, and connection type so we can slice
 * p75 by `route × is_mobile` in PostHog.
 *
 * Replaces PostHog's built-in `capture_performance` flag, which captures raw
 * resource timings but not Core Web Vitals attribution.
 */
import type posthog from 'posthog-js';

interface MinimalNetworkInformation {
	effectiveType?: string;
	saveData?: boolean;
}

function getConnectionType(): string | undefined {
	const conn = (
		navigator as Navigator & { connection?: MinimalNetworkInformation }
	).connection;
	return conn?.effectiveType;
}

function getViewportBucket(): 'mobile' | 'tablet' | 'desktop' {
	const w = window.innerWidth;
	if (w < 768) return 'mobile';
	if (w < 1024) return 'tablet';
	return 'desktop';
}

// Called once, from PostHogProvider's onMount, so it needs no SSR guard or latch.
export async function startWebVitals(client: typeof posthog): Promise<void> {
	const { onLCP, onINP, onCLS, onTTFB, onFCP } = await import('web-vitals');

	// Each web-vital callback has its own metric subtype (LCPMetric, INPMetric,
	// …). They all share `name`/`value`/`rating`/`delta`/`navigationType` but
	// the structural-typing collision means a single `Metric` alias rejects.
	// Use a minimal common shape that satisfies every callback.
	interface CommonMetric {
		name: string;
		value: number;
		rating: 'good' | 'needs-improvement' | 'poor';
		delta: number;
		navigationType?: string;
	}

	const report = (metric: CommonMetric) => {
		try {
			client.capture('web_vital', {
				metric_name: metric.name,
				value: metric.value,
				rating: metric.rating,
				delta: metric.delta,
				navigation_type: metric.navigationType,
				route: window.location.pathname,
				viewport: getViewportBucket(),
				viewport_w: window.innerWidth,
				connection_type: getConnectionType()
			});
		} catch {
			/* best-effort — never throw from analytics */
		}
	};

	onLCP(report);
	onINP(report);
	onCLS(report);
	onTTFB(report);
	onFCP(report);
}
