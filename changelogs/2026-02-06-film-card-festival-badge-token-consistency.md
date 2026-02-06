# Film Card and Festival Badge Token Consistency

**PR**: #90
**Date**: 2026-02-06

## Changes
- Updated film-card repertory/special-format chips from hardcoded white overlay styles to tokenized surface + border treatments.
- Updated festival programme section badge from hardcoded black/white overlay styling to tokenized background/text/border values.
- Kept all interaction and data behavior unchanged; this is a visual-system consistency update only.

## Impact
- Improves consistency between calendar cards and festival cards in high-visibility browsing contexts.
- Reduces hardcoded overlay color usage and aligns these components with theme token semantics.
- Makes future design-system adjustments safer by relying on shared tokens.
