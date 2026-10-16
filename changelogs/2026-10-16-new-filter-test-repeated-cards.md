# New-filter poster test survives repeated cards late in the evening

**PR**: #TBD
**Date**: 2026-10-16

## Changes
- `frontend/test-all.spec.ts`, "persisted New filter renders matching posters and titles": the sanity check that the first five New cards have unique titles is replaced by a check that each title maps to one poster URL.
- The homepage groups cards by day. On 2026-10-16 at 22:04 BST production had two New films with screenings left today, so cards 3-5 came from tomorrow's section and repeated titles from today. The old assertion failed in both Playwright projects; the new one passes on the same data (both checked against https://pictures.london).

## Impact
- Frontend E2E is a required check and runs against the production API, so the old assertion blocked every PR from roughly 21:00 until midnight London time.
- The test still catches the regression it guards (SSR/CSR poster mismatch with a persisted New filter): a title rendered with a different poster fails the new check, and the post-reload comparison still requires identical title and poster pairs.
