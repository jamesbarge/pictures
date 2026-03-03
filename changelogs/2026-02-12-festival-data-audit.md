# Festival Data Audit & Corrections

**Date**: 2026-02-12
**Type**: Data Fix
**PR**: TBD

## Changes

### `src/db/seed-festivals.ts`

#### Deactivated Non-Existent Festivals
- **Sundance London** (`sundance-london-2026`): Last held 2019, never returned post-COVID. Removed from active array, added to `deactivateSlugs`.
- **East End Film Festival** (`eeff-2026`): Ceased operations March 2020, dissolved July 2021. Removed from active array, added to `deactivateSlugs`.

#### Fixed Incorrect Dates
- **Open City Docs**: Sep 9-13 → Apr 14-19 (source: opencitylondon.com)
- **Raindance**: Jun 17-28 → Jun 17-26 (source: raindance.org)
- **LIAF**: Dec 3-6 → Nov 27-Dec 6 (source: animation-festivals.com)
- **UKJFF**: Nov 11-22 → Nov 5-15 London dates (source: ukjewishfilm.org)
- **LKFF**: Nov 5-26 → Nov 5-18 (source: koreanfilm.co.uk)

#### Fixed Venue Slugs to Match Cinema Registry
- `prince-charles-cinema` → `prince-charles`
- `genesis-cinema` → `genesis`
- `rio-cinema` → `rio-dalston`
- Removed non-registry venues: `vue-leicester-square`, `vue-piccadilly`, `odeon-luxe-leicester-square`, `jw3`

#### Updated Venue Lists
- **BFI LFF**: Removed Vue/ODEON chain venues
- **FrightFest**: Reduced to `prince-charles` only (ODEON Luxe mentioned in description)
- **Raindance**: Reduced to `curzon-soho` only
- **LSFF**: Fixed `rio-cinema` → `rio-dalston`
- **LKFF**: Changed to `bfi-southbank`, `cine-lumiere`, `ica`
- **Open City Docs**: Changed to `ica`, `close-up-cinema`, `barbican`, `rich-mix`
- **UKJFF**: Changed to `barbican`, `curzon-soho`
- **LIAF**: Changed to `barbican`, `close-up-cinema`, `garden`

#### Fixed Description Inaccuracies
- **Raindance**: "Europe's largest" → "The UK's largest"
- **FrightFest**: Updated to mention ODEON Luxe Leicester Square and Prince Charles Cinema
- **Open City Docs**: Updated to reflect 16th edition and April timing
- **LKFF**: Updated to reflect 21st edition
- **UKJFF**: Clarified London dates vs nationwide tour

#### Added Two New Festivals
- **Doc'n Roll Film Festival** (`docnroll-2026`): UK's music documentary festival, 13th edition. Oct 24-Nov 8. Venues: `barbican`, `bfi-southbank`, `rio-dalston`.
- **London Independent Film Festival** (`liff-2026`): London's indie film festival at Genesis Cinema, 24th edition. Apr 9-19. Venue: `genesis`.

## Verification
- All 13 venue slugs cross-checked against `src/config/cinema-registry.ts`
- TypeScript compiles cleanly
- All 542 tests pass
- Lint passes (0 errors)
