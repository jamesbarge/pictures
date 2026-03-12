# Kaizen — Use Shared UA Constants in 4 More Scrapers

**PR**: #XX
**Date**: 2026-03-12

## Changes
- Replaced hardcoded Chrome User-Agent string with `CHROME_USER_AGENT` constant in `coldharbour-blue.ts`, `castle-sidcup.ts`, `electric.ts`
- Replaced hardcoded bot User-Agent string with `BOT_USER_AGENT` constant in `phoenix.ts`

## Impact
- Code quality improvement, no behavior changes
- Continues UA string consolidation arc from PRs #192-#194
- Kaizen category: extract-constant
