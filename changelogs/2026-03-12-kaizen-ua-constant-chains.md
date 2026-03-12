# Kaizen — Replace inline User-Agent strings with CHROME_USER_AGENT

**PR**: #170
**Date**: 2026-03-12

## Changes
- `src/scrapers/festivals/watchdog.ts`: Replaced inline UA string with `CHROME_USER_AGENT`
- `src/scrapers/chains/picturehouse.ts`: Replaced inline UA string with `CHROME_USER_AGENT`
- `src/scrapers/chains/curzon.ts`: Replaced inline UA string with `CHROME_USER_AGENT`
- `src/scrapers/chains/everyman.ts`: Replaced 2 inline UA strings with `CHROME_USER_AGENT`

## Impact
- Code quality improvement, no behavior changes
- 5 fewer inline User-Agent strings (still ~8 remaining with longer KHTML variants for future passes)
- Kaizen category: extract-constant
