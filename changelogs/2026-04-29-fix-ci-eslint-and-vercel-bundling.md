# Fix CI for PR #469 — ESLint flat-config plugin scoping + Vercel webpack externals

**PR**: #469
**Date**: 2026-04-29

## Changes

### `eslint.config.mjs` — scope rule overrides via `files:` glob
Two of our rule-override config objects (jsx-a11y rules + the warnings-downgrade
block) had no `files:` filter. ESLint 9 flat config resolves plugin prefixes
(`jsx-a11y/...`, `react-hooks/...`, `@typescript-eslint/...`) per-file based on
which config objects' `files:` globs match, and `eslint-config-next` registers
those plugins under `files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}']`. Our unscoped
blocks therefore tried to apply those rule prefixes to files outside that glob,
where the plugins weren't registered, producing:

```
A configuration object specifies rule "jsx-a11y/alt-text", but could not find plugin "jsx-a11y".
```

**Fix:** add `files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"]` to both override
blocks. Also reverts the explicit `plugins: { 'jsx-a11y': jsxA11y }` re-registration
introduced in d6501bbc — `eslint-config-next/core-web-vitals` already registers
`jsx-a11y` (verified at `node_modules/eslint-config-next/dist/index.js:119`),
and ESLint 9 errors with `Cannot redefine plugin "jsx-a11y"` if the same name
is registered twice.

The d6501bbc commit message claimed `eslint-config-next` 16.x stopped registering
`jsx-a11y` — that was based on an incomplete grep. The package's `core-web-vitals`
subpath transitively pulls in `dist/index.js`, which does register the plugin.

### `next.config.ts` — externalize `rebrowser-playwright` + `playwright-extra`
The Phase 3 stealth swap added `rebrowser-playwright` (and kept `playwright-extra`
as the wrapper layer). Both were imported from `src/scrapers/cinemas/phoenix.ts`
and reachable from `src/app/api/inngest/route.ts`, so Next.js webpack tried to
bundle them into the API surface.

The wrappers ship their own copies of `playwright-core` inside their
`node_modules`, so the existing `playwright-core` external did NOT catch them.
Webpack recursed into the nested copy and choked on:
- `Can't resolve 'electron'` from `playwright-core/lib/server/electron/loader.js`
- `.ttf` font assets with no loader configured
- `.html` files with no loader configured

**Fix:** add `rebrowser-playwright` and `playwright-extra` to `serverExternalPackages`
so webpack treats them as runtime requires and never recurses into their internals.

### `src/hooks/useUrlFilters.ts` — drop unused `hasHydratedFromUrl` from return
The hook returned `hasHydratedFromUrl: hasHydratedFromUrl.current` — accessing a
ref's `.current` during render. The React 19 `react-hooks/refs` rule correctly
flags this as a footgun: refs don't trigger re-renders, so callers receive a
stale snapshot.

This is a latent issue on `main` (not introduced by PR #469), but it was masked
by the broken ESLint config until this PR repaired the plugin scoping. Project-wide
grep showed two callers (`calendar-view-loader.tsx`, `share-filters-button.tsx`),
neither of which consumes `hasHydratedFromUrl`. The minimal fix is to remove it
from the public return rather than refactor it to `useState`.

## Impact

- **Affects**: PR #469's CI gates (Unit & Integration Tests, Vercel filmcal2 deploy).
- **Verification**: `npm run lint` (0 errors, 50 warnings — all pre-existing), `npm run test:run` (923/923 pass), `npx tsc --noEmit` (clean), `npm run build` webpack compile succeeds in 5.1min.
- **Risk**: low. ESLint changes are config-only with verified local repro of both before/after error states. Next.js externals additions don't change runtime behavior — the wrappers were already runtime-loaded, just incorrectly bundled by webpack. The `useUrlFilters` change removes dead public surface area with no consumers.
- **Local-install caveat**: local `npm run build` type-check fails on `playwright.config.ts` because the dev `node_modules` is in mixed pnpm/npm state (top-level `playwright` is missing while `playwright-core` exists under `.pnpm/`). CI's clean install resolves correctly. This was previously documented in the rebuild handoff.
