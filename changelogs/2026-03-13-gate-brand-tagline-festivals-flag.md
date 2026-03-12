# Gate brand tagline behind festivals feature flag

**PR**: #XX
**Date**: 2026-03-13

## Changes
- `src/lib/brand.ts`: Conditionally include "Festivals" in the SEO tagline based on `isFeatureEnabled("festivals")`
- Promoted latest Vercel deployment to production via `vercel promote` — custom domains were stuck on a pre-PR#230 deployment due to a manual redeploy breaking auto-promotion

## Impact
- Page `<title>` no longer advertises "Festivals" while the feature is disabled
- When `NEXT_PUBLIC_ENABLE_FESTIVALS=true` is set, the tagline automatically re-includes "Festivals"
- Production (`pictures.london`) now serves the latest main branch code

## Root Cause
A manual "Redeploy" in the Vercel dashboard pinned production aliases to an old deployment (PR #221). The project's `live: false` setting prevented subsequent git-triggered deploys from auto-promoting to custom domains. Over 20 deployments built successfully but never served traffic on `pictures.london`.
