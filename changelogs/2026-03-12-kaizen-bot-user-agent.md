# Kaizen — Use BOT_USER_AGENT constant in scrapers

**PR**: #178
**Date**: 2026-03-12

## Changes
- `src/scrapers/cinemas/david-lean.ts`: Replaced inline UA string with `BOT_USER_AGENT` import
- `src/scrapers/cinemas/romford-lumiere.ts`: Replaced inline UA string with `BOT_USER_AGENT` import
- `src/scrapers/cinemas/regent-street.ts`: Replaced inline UA string with `BOT_USER_AGENT` import
- `src/scrapers/cinemas/rich-mix.ts`: Replaced inline UA string with `BOT_USER_AGENT` import

## Impact
- Centralizes bot User-Agent to single constant (already existed in `constants.ts`)
- If the bot UA string needs to change, only one file to update instead of 4+
- Code quality improvement, no behavior changes
- Kaizen category: extract-constant
