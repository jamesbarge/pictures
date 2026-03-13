# Kaizen — Remove Dead Barrel Re-exports from Festivals

**PR**: #TBD
**Date**: 2026-03-13

## Changes
- Removed FollowButtonCompact, FestivalTimeline, FestivalListSkeleton from festivals barrel
- These components are never imported by any external consumer

## Impact
- Code quality improvement, no behavior changes
- Kaizen category: dead-code
