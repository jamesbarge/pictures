# Fix CI Node Version + Regenerate Lockfile

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Bumped GitHub Actions Node.js from 22 to 24 in both unit-test and E2E jobs to match Vercel production (`nodeVersion: "24.x"`)
- Regenerated `package-lock.json` to resolve missing `magicast@0.3.5` transitive dependency
- Added `.npmrc` with `legacy-peer-deps=true` to handle `@opentelemetry/sdk-trace-base` peer dep conflict between `@posthog/ai` (wants `^2.2.0`) and `@trigger.dev/core` (pins `2.0.1`)
- Added `@testing-library/dom` as explicit dev dependency (required peer dep of `@testing-library/react` that was silently missing)

## Impact
- Unblocks all Vercel production deployments that have been stuck as "Production: Staged" with "Checks Failed" since PR #238
- GitHub Actions CI should now pass, allowing Vercel to promote staged deployments to live production
- No runtime behavior changes — purely CI/build infrastructure fix
