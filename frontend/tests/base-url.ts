/**
 * Origin the Playwright suite drives.
 *
 * The specs used to hard-code `http://localhost:5173`, which made Playwright's
 * `baseURL` dead config and left the suite unable to run anywhere but one
 * developer's dev server — the reason it never entered CI.
 *
 * Defaults to the dev server a developer already has running. CI sets
 * `E2E_PREVIEW=1` and drives the built bundle through `vite preview`, which
 * does no on-demand route compilation; that compilation is what let clicks
 * land before hydration and made several specs flaky.
 *
 * `E2E_BASE_URL` overrides both, so the same specs can be aimed at a preview
 * deployment or at production.
 */
export const E2E_PORT = process.env.E2E_PREVIEW ? 4173 : 5173;

// `||`, not `??`: an exported-but-empty E2E_BASE_URL (common from .env files
// and CI matrices) must fall back rather than resolve to '', which would leave
// both `BASE` and the webServer `url` empty and hang the run.
const explicitTarget = process.env.E2E_BASE_URL || '';

/** True when we're driving a server we don't manage (preview deploy, prod). */
export const isExternalTarget = explicitTarget !== '';

export const BASE = explicitTarget || `http://localhost:${E2E_PORT}`;
