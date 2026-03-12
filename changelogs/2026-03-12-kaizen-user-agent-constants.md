# Kaizen — Extract shared User-Agent constants for scrapers

**PR**: #148
**Date**: 2026-03-12

## Changes
- Created `src/scrapers/constants.ts` with `CHROME_USER_AGENT` and `BOT_USER_AGENT`
- Replaced inline User-Agent strings in 4 cinema scrapers: the-nickel, lexi, genesis, castle
- ~20 more files still use inline strings — future kaizen cycles can migrate them

## Impact
- Code quality improvement, no behavior changes
- Single source of truth for User-Agent strings
- Kaizen category: extract-constant
