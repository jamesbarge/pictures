# Remove + gitignore unreferenced InterVariable-Italic.woff2

**PR**: #721 (supersedes #716)
**Date**: 2026-06-21
**Issue**: PIC-41

## Changes
- Deleted the untracked `frontend/static/fonts/InterVariable-Italic.woff2` (387,976 bytes) from the working tree.
- Added `/static/fonts/InterVariable-Italic.woff2` to `frontend/.gitignore` so the file can't be accidentally committed/shipped if it reappears.

## Context
- The file is **unreferenced**: no `@font-face` or preload points at it. `frontend/src/app.css` declares the roman `InterVariable.woff2` plus `Fraunces`, `Cormorant-Italic`, and `IBMPlexMono`; `rg InterVariable-Italic frontend/` returns zero hits.
- It was **never tracked** in git (`git ls-files frontend/static/fonts/` lists the five real fonts, not this one), so it was not actually shipped — but it kept reappearing locally as dead weight, and a stray `git add .` would have committed 388 KB.
- The 2026-05-30 perf campaign reported deleting it; it returned. The gitignore guard makes the removal durable.

## Impact
- No runtime/build impact — the asset was unreferenced, so removal cannot break a font face.
- Prevents 388 KB of dead weight from being accidentally committed in future.
- Verified by inspection (CI runners currently not executing; this is a static-asset/gitignore-only change with no code path).
