// /privacy is static legal copy with no per-request data, no client state, and
// no browser-only code. Prerender it to a static HTML asset at build time so it
// is served straight from the edge instead of through the dynamic SSR render
// path (which would otherwise inherit the root layout's per-request
// /api/cinemas fetch). Rendered output is identical to the SSR render.
export const prerender = true;
