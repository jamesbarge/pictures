# Kaizen — Remove Dead Parameter from getFollowingText

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Removed unused \$: CheerioAPI parameter from getFollowingText() in programme-changes-parser.ts
- Removed \$ argument from call site
- Removed dead CheerioAPI import (only used by the removed parameter)

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
