# Legal and Consent Token Consistency

**PR**: #79
**Date**: 2026-02-06

## Changes
- Updated `/terms` disclaimer callout styles from hardcoded amber utility classes to design-system warning tokens.
- Updated cookie consent banner and settings controls to use semantic token colors for accepted/rejected/pending states.
- Updated shared `Badge` `warning` variant and removable affordance hover state to remove hardcoded color values.
- Kept all changes presentation-only; no consent logic, tracking behavior, or routes were modified.

## Impact
- Improves visual consistency for legal/privacy surfaces that communicate high-trust information.
- Reduces risk of style drift by using existing token semantics instead of one-off utility colors.
- Makes future theme/system updates safer because these UI states now follow the central design language.
