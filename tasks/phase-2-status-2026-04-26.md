# Phase 2 Dependency Refresh — Session Status

**Session date:** 2026-04-26
**PRs shipped:** 11 of 12 (one blocked on upstream, one deferred for proper migration window)

## Shipped This Session (all merged to main)

| # | Item | PR | Status |
|---|---|---|---|
| 0 | Phase 1 — bulk dep bumps within current majors | [#455](https://github.com/jamesbarge/pictures/pull/455) | ✅ Merged |
| 1 | Drop unused `@anthropic-ai/*` deps | [#456](https://github.com/jamesbarge/pictures/pull/456) | ✅ Merged |
| 13 | Add generated-dir ignores to `eslint.config.mjs` | [#457](https://github.com/jamesbarge/pictures/pull/457) | ✅ Merged |
| 2 | Declare Node engine in `package.json` | [#458](https://github.com/jamesbarge/pictures/pull/458) | ✅ Merged |
| 3 | `@vercel/analytics` + `@vercel/speed-insights` v2 | [#459](https://github.com/jamesbarge/pictures/pull/459) | ✅ Merged |
| 4 | `lucide-react` 0.562 → 1.11 | [#460](https://github.com/jamesbarge/pictures/pull/460) | ✅ Merged |
| 5 | `tailwind-merge` v2 → v3 (frontend) | [#461](https://github.com/jamesbarge/pictures/pull/461) | ✅ Merged |
| 6 | `uuid` v13 → v14 + drop `@types/uuid` | [#462](https://github.com/jamesbarge/pictures/pull/462) | ✅ Merged |
| 7 | `jsdom` v27 → v29 | [#463](https://github.com/jamesbarge/pictures/pull/463) | ✅ Merged |
| 9 | `typescript` v5 → v6 (both halves) + `types/globals.d.ts` for Google Maps | [#464](https://github.com/jamesbarge/pictures/pull/464) | ✅ Merged |
| 10 | `vite` v8 + `@sveltejs/vite-plugin-svelte` v7 | [#465](https://github.com/jamesbarge/pictures/pull/465) | ✅ Merged |
| 11 | Drop unused `@chenglou/pretext` (was supposed to be a bump, but it's unused) | [#466](https://github.com/jamesbarge/pictures/pull/466) | ✅ Merged |
| 14 | Local memory update (Anthropic SDKs status, DeepSeek for enrichment) | n/a (local) | ✅ Done |

## Not Shipped

### 8. `eslint` v9 → v10 — 🚧 BLOCKED ON UPSTREAM

**Verified 2026-04-26 in worktree.**

`eslint-plugin-react@7.37.5` (latest) declares:

```json
"peerDependencies": {
  "eslint": "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7"
}
```

— explicitly does NOT support eslint v10. Attempting `npm install -D eslint@^10 && npm run lint` reproduces:

```
TypeError: Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function
    at resolveBasedir (.../node_modules/eslint-plugin-react/lib/util/version.js:31:100)
```

The plugin uses `context.getFilename()` which was removed in eslint v10. **Track `eslint-plugin-react` releases and revisit when it ships v10 support.**

### 12. `@clerk/nextjs` v6 → v7 — Deferred to dedicated session

**Verified breaking changes 2026-04-26 in worktree.**

`npm install @clerk/nextjs@^7 && npx tsc --noEmit` produced 4 type errors in 2 files:

#### `src/components/clerk-components-safe.tsx`
- `SignedIn` no longer exported (TS suggests `SignIn` — different component). Need to find v7's replacement (likely a different export or removed pattern).
- `SignedOut` no longer exported.

#### `src/components/layout/header-nav-buttons.tsx` (lines 189, 289)
- `<UserButton afterSignOutUrl="...">` — `afterSignOutUrl` prop removed in v7. Need to migrate to either:
  - `<ClerkProvider afterSignOutUrl="...">` (config moved up the tree), or
  - The new `<UserButton>`-level prop name (check v7 docs)

#### Other touch points NOT yet probed
The migration touches more than just these — surface area per `tasks/todo.md` includes:
- `src/middleware.ts` — `clerkMiddleware`/`createRouteMatcher` shape may have changed
- `src/lib/auth.ts` (the `withAdminAuth()` factory and `requireAdmin()`)
- All `src/app/api/admin/**/*.ts` route guards
- `src/app/api/webhooks/clerk/route.ts` — webhook handler
- Frontend `svelte-clerk` may need a paired bump

#### Recommended approach for the next session
1. Block out 4-8 hours.
2. Read https://clerk.com/docs/upgrade-guides/nextjs/v7 (or whatever the current canonical guide is) before touching code.
3. Address all type errors first (compile-clean is the gate for moving to behavior testing).
4. **Before merging, soak the Vercel preview overnight** with manual smoke tests:
   - Sign-in flow at `/sign-in`
   - `/admin` access still gated by `jdwbarge@gmail.com` allowlist
   - Webhook from Clerk dashboard reaches `/api/webhooks/clerk`
   - Frontend session state still hydrates via `useClerkContext`
5. Same-day merge is explicitly disallowed per the original plan.

## Final State

`npm outdated` from a clean checkout should now show **near zero** packages with a higher major version available. The remaining gaps are:
- `eslint v10` (upstream blocker)
- `@clerk/nextjs v7` (next-session work)

All other Phase 2 majors landed. The codebase is current.

## Two Things to Watch Post-Merge

1. **Vercel analytics events** — confirm they continue flowing in the Vercel dashboard after #459 merged. If silent, the v2 init shape may have shifted server-side.
2. **Vite dev server SSR** — the `ssr.noExternal: ['date-fns']` workaround in `frontend/vite.config.ts` was kept across the v8 jump. If date-fns SSR resolution gets fixed upstream in a v8 patch, that line can be removed.
